import Foundation

/// The pure parts of Settings > Developer's engine benchmark (#698): the
/// config the V8 runner takes, the reports it and the Worker page give back,
/// and the table the two make. They are the V8 spike's (ganymede
/// spikes/v8-engine) formats: `results-<time>.json` is read by its
/// `bench/report.mjs`. Foundation only, so the unit tests build it.
enum EngineBench {
    /// Calls of each workload, the first included.
    static let repeats = 5

    struct Failure: LocalizedError, Equatable {
        let message: String
        init(_ message: String) { self.message = message }
        var errorDescription: String? { message }
    }

    // MARK: Config

    /// bench/workloads/manifest.json: workloads, each a name and the
    /// scripts it runs in order, as paths inside the bench folder.
    private struct Manifest: Decodable {
        struct Workload: Decodable {
            let name: String
            let sources: [String]
        }

        let workloads: [Workload]
    }

    /// The JSON config `ganymede_v8_bench_run` takes: the manifest's
    /// workloads with their sources read in, jitless (the device build has
    /// no JIT). `readSource` reads one path relative to the bench folder;
    /// a path that leaves the folder is refused before it is read.
    static func config(
        manifest: Data,
        repeats: Int = EngineBench.repeats,
        readSource: (String) throws -> String
    ) throws -> String {
        var workloads: [[String: Any]] = []
        for workload in try decode(manifest).workloads {
            guard !workload.sources.isEmpty else {
                throw Failure("The workload \(workload.name) in the manifest has no scripts.")
            }
            var sources: [String] = []
            for path in workload.sources {
                guard isInsideBenchFolder(path) else {
                    throw Failure("The workload \(workload.name) names a script outside the bench folder: \(path).")
                }
                do {
                    sources.append(try readSource(path))
                } catch {
                    throw Failure("Couldn't read \(path): \(error.localizedDescription)")
                }
            }
            workloads.append(["name": workload.name, "sources": sources])
        }
        let config: [String: Any] = ["jitless": true, "repeats": repeats, "workloads": workloads]
        do {
            return String(decoding: try JSONSerialization.data(withJSONObject: config), as: UTF8.self)
        } catch {
            throw Failure("Couldn't build the benchmark config: \(error.localizedDescription)")
        }
    }

    private static func decode(_ manifest: Data) throws -> Manifest {
        let parsed: Manifest
        do {
            parsed = try JSONDecoder().decode(Manifest.self, from: manifest)
        } catch {
            throw Failure("The workload manifest is malformed: \(error.localizedDescription)")
        }
        guard !parsed.workloads.isEmpty else { throw Failure("The workload manifest lists no workloads.") }
        return parsed
    }

    /// A relative path with no `..` or empty parts.
    static func isInsideBenchFolder(_ path: String) -> Bool {
        // An empty part covers "", a leading "/" and "//".
        !path.split(separator: "/", omittingEmptySubsequences: false).contains { $0.isEmpty || $0 == ".." }
    }

    // MARK: Reports

    /// One engine's report, the fields the table and the problem list use.
    struct Report: Equatable {
        struct Workload: Equatable {
            var name: String
            var coldMs: Double?
            var steadyMs: Double?
            var error: String?
        }

        /// `v8` or `worker`.
        var engine: String
        var version: String?
        var workloads: [Workload]
        /// A report with no workloads holds only this.
        var error: String?

        /// Reads a report; nil when there is none. Text that isn't a JSON
        /// object is a report with an error.
        init?(json: String?) {
            guard let json else { return nil }
            guard let object = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] else {
                engine = "unknown"
                workloads = []
                error = "The report isn't JSON."
                return
            }
            engine = object["engine"] as? String ?? "unknown"
            version = object["version"] as? String
            error = object["error"] as? String
            let list = object["workloads"] as? [[String: Any]] ?? []
            workloads = list.map {
                Workload(
                    name: $0["name"] as? String ?? "?",
                    coldMs: Self.number($0["cold_ms"]),
                    steadyMs: Self.number($0["steady_ms"]),
                    error: $0["error"] as? String
                )
            }
            if object["workloads"] == nil, error == nil { error = "The report has no workloads." }
        }

        /// A JSON number as a Double; nil for null, a string or a bool.
        private static func number(_ value: Any?) -> Double? {
            guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
            let double = number.doubleValue
            return double.isFinite ? double : nil
        }
    }

    /// A report holding only an error, as valid JSON.
    static func errorReport(_ message: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: ["error": message])) ?? Data("{}".utf8)
        return String(decoding: data, as: UTF8.self)
    }

    /// What the app adds to the V8 report: its memory footprint before and
    /// after the run, and the peak since launch.
    struct Footprint: Equatable {
        var before: UInt64
        var after: UInt64
        var peak: UInt64
    }

    /// The report with the device and OS added, `left_screen` when the
    /// person left the benchmark's screen or the app during the run (WebKit
    /// throttles a page that isn't shown), and the footprint when
    /// there is one (`footprint_before_bytes`, `footprint_after_bytes`,
    /// `footprint_peak_bytes`, which report.mjs reads). Text that isn't a
    /// JSON object comes back as an error report.
    static func annotated(
        _ report: String, device: String, os: String, footprint: Footprint? = nil, leftScreen: Bool = false
    ) -> String {
        guard var json = (try? JSONSerialization.jsonObject(with: Data(report.utf8))) as? [String: Any] else {
            return errorReport("The engine's report isn't JSON.")
        }
        json["device"] = device
        json["os"] = os
        if leftScreen { json["left_screen"] = true }
        if let footprint {
            json["footprint_before_bytes"] = footprint.before
            json["footprint_after_bytes"] = footprint.after
            json["footprint_peak_bytes"] = footprint.peak
        }
        guard let data = try? JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys]) else {
            return errorReport("Couldn't write the engine's report.")
        }
        return String(decoding: data, as: UTF8.self)
    }

    /// The file's text: V8's report and the Worker's, `null` for one that
    /// didn't run (what the spike's bench app shares).
    static func combined(v8: String?, worker: String?) -> String {
        "[\(v8 ?? "null"),\n\(worker ?? "null")]"
    }

    // MARK: Table

    /// One engine's numbers for one workload.
    struct Timing: Equatable {
        var coldMs: Double?
        var steadyMs: Double?
        var error: String?

        /// `cold / steady` in ms, as report.mjs prints them: `error` for a
        /// failed workload, `–` for a missing number.
        var text: String {
            if error != nil { return "error" }
            guard let coldMs else { return "–" }
            return "\(EngineBench.ms(coldMs)) / \(EngineBench.ms(steadyMs))"
        }
    }

    struct Row: Identifiable, Equatable {
        var name: String
        var v8: Timing?
        var webkit: Timing?
        var id: String { name }
    }

    /// One row per workload, in the order the reports list them (V8's
    /// first); an engine without a report, or without that workload, has
    /// no timing in it.
    static func rows(v8: Report?, worker: Report?) -> [Row] {
        var names: [String] = []
        for name in (v8?.workloads ?? []).map(\.name) + (worker?.workloads ?? []).map(\.name)
        where !names.contains(name) {
            names.append(name)
        }
        func timing(_ report: Report?, _ name: String) -> Timing? {
            guard let workload = report?.workloads.first(where: { $0.name == name }) else { return nil }
            return Timing(coldMs: workload.coldMs, steadyMs: workload.steadyMs, error: workload.error)
        }
        return names.map { Row(name: $0, v8: timing(v8, $0), webkit: timing(worker, $0)) }
    }

    /// What failed, one line each: a report's own error, then its
    /// workloads' errors.
    static func problems(v8: Report?, worker: Report?) -> [String] {
        var lines: [String] = []
        for (label, report) in [("V8", v8), ("WebKit", worker)] {
            guard let report else { continue }
            if let error = report.error { lines.append("\(label): \(error)") }
            for workload in report.workloads {
                if let error = workload.error { lines.append("\(label), \(workload.name): \(error)") }
            }
        }
        return lines
    }

    /// Milliseconds as report.mjs shows them: one decimal under 10, whole
    /// numbers above, `–` for none.
    static func ms(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "–" }
        // Ties round up, as report.mjs's toFixed does for the usual values.
        return value < 10 ? String(format: "%.1f", (value * 10).rounded() / 10) : String(Int(value.rounded()))
    }

    /// Bytes as whole mebibytes, `–` for none.
    static func mb(_ bytes: UInt64?) -> String {
        guard let bytes else { return "–" }
        return String(Int((Double(bytes) / 1_048_576).rounded()))
    }
}
