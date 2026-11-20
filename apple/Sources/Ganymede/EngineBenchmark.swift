import Darwin
import Foundation
import GanymedeFFI
import Observation

/// Settings > Developer's engine benchmark (#698): the V8 spike's workloads
/// (ganymede spikes/v8-engine) on the V8 linked into ganymede-ffi, jitless,
/// and on WebKit's Workers (today's in-app kernel's engine), with a
/// results file `bench/report.mjs` reads. The pure parts are in
/// `EngineBench` (EngineBenchmarkReport.swift); the files it loads are the
/// bundled `Bench` folder (`Resources/Bench`).
///
/// One per app, so the results stay while Settings is closed. V8 starts
/// once per process: for steady numbers, quit and relaunch between runs.
@MainActor
@Observable
final class EngineBenchmark {
    /// What a run calls out to: the engines, the bundled files and the
    /// results file. `live` is the app's; tests pass their own.
    struct Engines {
        /// Whether this build of the library has V8.
        var v8Available: Bool
        /// The bench folder.
        var folder: () throws -> URL
        /// Runs the V8 config; returns the report.
        var runV8: @Sendable (String) async -> String
        /// Runs the Workers from the folder; returns the report. `show` puts
        /// a page on screen while it runs, and nil when it's done.
        var runWorkers: @MainActor (URL, _ show: (BenchWorkerPage?) -> Void) async -> String
        /// Writes the results; returns the file.
        var write: (String) throws -> URL

        static let live = Engines(
            v8Available: ganymede_v8_bench_available() == 1,
            folder: EngineBenchmark.benchFolder,
            runV8: { await EngineBenchmark.runV8(config: $0) },
            runWorkers: { folder, show in
                let page = BenchWorkerPage(root: folder)
                show(page)
                let report = await page.run()
                show(nil)
                return report
            },
            write: EngineBenchmark.write
        )
    }

    static let shared = EngineBenchmark(engines: .live)

    private let engines: Engines

    init(engines: Engines) {
        self.engines = engines
    }

    /// Whether this build of the library has V8.
    var v8Available: Bool { engines.v8Available }

    private(set) var running = false
    /// What the run is doing, while it runs.
    private(set) var step = ""
    /// The Worker page, while it runs: shown on screen so WebKit doesn't
    /// throttle it.
    private(set) var page: BenchWorkerPage?
    private(set) var v8Report: EngineBench.Report?
    private(set) var workerReport: EngineBench.Report?
    /// What stopped the run, or what went wrong after it.
    private(set) var failure: String?
    /// Whether the person left the screen or the app during the run.
    private(set) var leftScreen = false
    private(set) var footprint: EngineBench.Footprint?
    private(set) var device = ""
    private(set) var os = ""
    /// The reports as JSON, `[v8, worker]`, once a run ends.
    private(set) var resultsText: String?
    /// `results-<time>.json`, written when a run ends.
    private(set) var resultsFile: URL?

    var rows: [EngineBench.Row] { EngineBench.rows(v8: v8Report, worker: workerReport) }
    var problems: [String] { EngineBench.problems(v8: v8Report, worker: workerReport) }
    var hasResults: Bool { v8Report != nil || workerReport != nil }

    /// The bundled bench folder.
    nonisolated static func benchFolder() throws -> URL {
        guard let folder = Bundle.main.url(forResource: "Bench", withExtension: nil) else {
            throw EngineBench.Failure("This build has no benchmark files (Resources/Bench).")
        }
        return folder
    }

    /// The benchmark's screen went away, or the app left the front.
    func screenLeft() {
        if running { leftScreen = true }
    }

    func run() async {
        guard !running else { return }
        running = true
        defer {
            running = false
            page = nil
        }
        step = ""
        v8Report = nil
        workerReport = nil
        failure = nil
        leftScreen = false
        footprint = nil
        resultsText = nil
        resultsFile = nil
        device = Self.deviceModel()
        os = ProcessInfo.processInfo.operatingSystemVersionString

        let folder: URL
        let manifest: Data
        do {
            folder = try engines.folder()
            manifest = try Data(contentsOf: folder.appendingPathComponent("workloads/manifest.json"))
        } catch {
            failure = "Couldn't load the benchmark's files: \(error.localizedDescription)"
            return
        }

        var v8Text: String?
        let before = Self.footprintNow()
        if v8Available {
            step = "Running V8 (jitless)…"
            do {
                let config = try EngineBench.config(manifest: manifest) { path in
                    try String(contentsOf: folder.appendingPathComponent(path), encoding: .utf8)
                }
                let raw = await engines.runV8(config)
                let after = Self.footprintNow()
                footprint = EngineBench.Footprint(before: before.current, after: after.current, peak: after.peak)
                v8Text = EngineBench.annotated(raw, device: device, os: os, footprint: footprint, leftScreen: leftScreen)
            } catch {
                failure = error.localizedDescription
                v8Text = EngineBench.errorReport(error.localizedDescription)
            }
            v8Report = EngineBench.Report(json: v8Text)
        }

        step = "Running the WebKit Workers…"
        let workerRaw = await engines.runWorkers(folder) { self.page = $0 }
        page = nil
        let workerText = EngineBench.annotated(workerRaw, device: device, os: os, leftScreen: leftScreen)
        workerReport = EngineBench.Report(json: workerText)

        let combined = EngineBench.combined(v8: v8Text, worker: workerText)
        resultsText = combined
        do {
            resultsFile = try engines.write(combined)
        } catch {
            failure = "Couldn't write the results file: \(error.localizedDescription)"
        }
        step = "Done."
    }

    /// The library runs V8 on a thread of its own with an 8 MB stack and
    /// blocks its caller until it's done: a thread of ours waits for it, so
    /// neither the main actor nor the cooperative pool does.
    nonisolated static func runV8(config: String) async -> String {
        await withCheckedContinuation { done in
            let thread = Thread {
                guard let raw = ganymede_v8_bench_run(config) else {
                    done.resume(returning: EngineBench.errorReport("V8 returned no report."))
                    return
                }
                let text = String(cString: raw)
                ganymede_v8_bench_free(raw)
                done.resume(returning: text)
            }
            thread.stackSize = 8 << 20
            thread.qualityOfService = .userInitiated
            thread.start()
        }
    }

    /// The reports as a results-<time>.json file, the name `report.mjs`'s
    /// callers expect.
    nonisolated static func write(_ text: String) throws -> URL {
        let stamp = ISO8601DateFormatter().string(from: .now).replacingOccurrences(of: ":", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("results-\(stamp).json")
        try Data(text.utf8).write(to: url, options: .atomic)
        return url
    }

    // MARK: Device

    /// The hardware model: `iPad14,1`, `Mac15,3`.
    nonisolated static func deviceModel() -> String {
        #if os(macOS)
        var size = 0
        if sysctlbyname("hw.model", nil, &size, nil, 0) == 0, size > 0 {
            var buffer = [UInt8](repeating: 0, count: size)
            if sysctlbyname("hw.model", &buffer, &size, nil, 0) == 0 {
                return String(decoding: buffer.prefix { $0 != 0 }, as: UTF8.self)
            }
        }
        #endif
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    }

    /// The app's memory footprint, as iOS counts it against its limit
    /// (`phys_footprint`), and its peak since launch.
    nonisolated static func footprintNow() -> (current: UInt64, peak: UInt64) {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return (0, 0) }
        return (info.phys_footprint, UInt64(max(0, info.ledger_phys_footprint_peak)))
    }
}
