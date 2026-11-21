import XCTest

/// The engine benchmark's run model (#698), with engines that answer at
/// once: what a run passes the engines, and how leaving the screen marks a
/// run and only that run.
@MainActor
final class EngineBenchmarkRunTests: XCTestCase {
    /// What the fake engines saw, and what the Worker half does mid-run.
    private final class Probe {
        weak var model: EngineBenchmark?
        var leaveDuringWorkers = false
        var configs: [String] = []
        var written: [String] = []
    }

    private var folder: URL!

    override func setUp() async throws {
        folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("bench-\(UUID().uuidString)", isDirectory: true)
        let workloads = folder.appendingPathComponent("workloads", isDirectory: true)
        try FileManager.default.createDirectory(at: workloads, withIntermediateDirectories: true)
        try Data(#"{"workloads": [{"name": "start", "sources": ["workloads/start.js"]}]}"#.utf8)
            .write(to: workloads.appendingPathComponent("manifest.json"))
        try Data("// start".utf8).write(to: workloads.appendingPathComponent("start.js"))
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: folder)
    }

    private func model(v8: Bool, probe: Probe) -> EngineBenchmark {
        let folder = folder!
        let results = folder.appendingPathComponent("results.json")
        let configs = Configs()
        let model = EngineBenchmark(engines: .init(
            v8Available: v8,
            v8Blocked: { nil },
            folder: { folder },
            runV8: { config in
                configs.append(config)
                return #"{"engine": "v8", "workloads": [{"name": "start", "cold_ms": 2, "steady_ms": 1}]}"#
            },
            runWorkers: { _, show in
                show(nil)
                if probe.leaveDuringWorkers { probe.model?.screenLeft() }
                probe.configs = configs.all
                return #"{"engine": "worker", "workloads": [{"name": "start", "cold_ms": 4, "steady_ms": 3}]}"#
            },
            write: { text in
                probe.written.append(text)
                return results
            }
        ))
        probe.model = model
        return model
    }

    /// The V8 configs a run passed, from the V8 engine's thread.
    private final class Configs: @unchecked Sendable {
        private let lock = NSLock()
        private var list: [String] = []
        func append(_ config: String) { lock.withLock { list.append(config) } }
        var all: [String] { lock.withLock { list } }
    }

    /// The `left_screen` of each report in the results file, `[v8, worker]`.
    private func leftScreen(in results: String?) throws -> [Bool] {
        let text = try XCTUnwrap(results)
        let reports = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(text.utf8)) as? [Any])
        return reports.compactMap { $0 as? [String: Any] }.map { $0["left_screen"] as? Bool ?? false }
    }

    func testARunPassesV8TheConfigAndKeepsBothReports() async throws {
        let probe = Probe()
        let benchmark = model(v8: true, probe: probe)
        await benchmark.run()

        XCTAssertEqual(probe.configs.count, 1)
        let config = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(probe.configs[0].utf8)) as? [String: Any]
        )
        let workloads = try XCTUnwrap(config["workloads"] as? [[String: Any]])
        XCTAssertEqual(workloads.first?["sources"] as? [String], ["// start"])

        XCTAssertNil(benchmark.failure)
        XCTAssertFalse(benchmark.running)
        XCTAssertNil(benchmark.page)
        XCTAssertEqual(benchmark.v8Report?.engine, "v8")
        XCTAssertEqual(benchmark.workerReport?.engine, "worker")
        XCTAssertEqual(benchmark.rows.map(\.name), ["start"])
        XCTAssertNotNil(benchmark.footprint)
        let results = try XCTUnwrap(benchmark.resultsText)
        XCTAssertEqual(probe.written, [results])
        XCTAssertEqual(benchmark.resultsFile?.lastPathComponent, "results.json")
    }

    func testABuildWithoutV8RunsOnlyTheWorkers() async throws {
        let probe = Probe()
        let benchmark = model(v8: false, probe: probe)
        await benchmark.run()

        XCTAssertTrue(probe.configs.isEmpty)
        XCTAssertNil(benchmark.v8Report)
        XCTAssertEqual(benchmark.workerReport?.engine, "worker")
        XCTAssertTrue(try XCTUnwrap(benchmark.resultsText).hasPrefix("[null,"))
    }

    func testABlockedV8IsSkippedWithItsReasonAndTheWorkersStillRun() async throws {
        let probe = Probe()
        let configs = Configs()
        let folder = folder!
        let benchmark = EngineBenchmark(engines: .init(
            v8Available: true,
            v8Blocked: { "no address space" },
            folder: { folder },
            runV8: { config in
                configs.append(config)
                return "{}"
            },
            runWorkers: { _, _ in #"{"engine": "worker", "workloads": [{"name": "start", "cold_ms": 4, "steady_ms": 3}]}"# },
            write: { text in
                probe.written.append(text)
                return URL(fileURLWithPath: "/dev/null")
            }
        ))
        await benchmark.run()

        XCTAssertTrue(configs.all.isEmpty, "V8 started although it was blocked")
        XCTAssertEqual(benchmark.v8Report?.error, "no address space")
        XCTAssertEqual(benchmark.problems, ["V8: no address space"])
        XCTAssertEqual(benchmark.workerReport?.engine, "worker")
        XCTAssertEqual(probe.written.count, 1)
        XCTAssertNil(benchmark.failure)
    }

    /// The Mac and the simulator have the address space V8's caged heap
    /// takes, so the check passes there; on an iPhone without the
    /// entitlement it doesn't.
    func testThisProcessHasTheAddressSpaceV8Reserves() {
        XCTAssertNil(EngineBenchmark.v8AddressSpaceProblem)
    }

    /// More address space than any process has: the reservation fails, and
    /// the check says so instead of reporting success.
    func testAnImpossibleReservationIsAProblem() {
        XCTAssertNotNil(EngineBenchmark.addressSpaceProblem(bytes: 1 << 60))
    }

    /// The check reserves the 12 GB V8's caged heap first asks for, and a
    /// failed reservation becomes the reason, not the system's error text.
    func testTheV8CheckReservesTwelveGigabytesAndExplainsAFailure() throws {
        var sizes: [Int] = []
        let problem = EngineBenchmark.v8Problem { bytes in
            sizes.append(bytes)
            return "Cannot allocate memory"
        }
        XCTAssertEqual(sizes, [12 << 30])
        XCTAssertTrue(try XCTUnwrap(problem).hasPrefix("V8 can't run here: it needs about 12 GB of address space"))
        XCTAssertNil(EngineBenchmark.v8Problem { _ in nil })
    }

    func testLeavingTheScreenMarksOnlyThatRun() async throws {
        let probe = Probe()
        let benchmark = model(v8: false, probe: probe)

        probe.leaveDuringWorkers = true
        await benchmark.run()
        XCTAssertTrue(benchmark.leftScreen)
        XCTAssertEqual(try leftScreen(in: benchmark.resultsText), [true])

        probe.leaveDuringWorkers = false
        await benchmark.run()
        XCTAssertFalse(benchmark.leftScreen)
        XCTAssertEqual(try leftScreen(in: benchmark.resultsText), [false])
    }

    func testLeavingTheScreenWhileIdleMarksNothing() async throws {
        let probe = Probe()
        let benchmark = model(v8: false, probe: probe)
        benchmark.screenLeft()
        XCTAssertFalse(benchmark.leftScreen)

        await benchmark.run()
        benchmark.screenLeft()
        XCTAssertFalse(benchmark.leftScreen)
        XCTAssertEqual(try leftScreen(in: benchmark.resultsText), [false])
    }

    #if os(macOS)
    /// The app's Worker runner puts its page on screen for the run (WebKit
    /// throttles one that isn't shown) and takes it off after. The empty
    /// folder has no page, so the load fails at once.
    func testTheLiveWorkerRunnerShowsItsPageWhileItRuns() async {
        var shown: [Bool] = []
        let report = await EngineBenchmark.Engines.live.runWorkers(folder) { shown.append($0 != nil) }
        XCTAssertEqual(shown, [true, false])
        XCTAssertNotNil(EngineBench.Report(json: report)?.error)
    }
    #endif

    func testAMissingBenchFolderEndsTheRunWithAFailure() async {
        let benchmark = EngineBenchmark(engines: .init(
            v8Available: true,
            v8Blocked: { nil },
            folder: { throw EngineBench.Failure("no files") },
            runV8: { _ in XCTFail("V8 ran without files"); return "{}" },
            runWorkers: { _, _ in XCTFail("the Workers ran without files"); return "{}" },
            write: { _ in XCTFail("wrote results without a run"); return URL(fileURLWithPath: "/dev/null") }
        ))
        await benchmark.run()
        XCTAssertNotNil(benchmark.failure)
        XCTAssertFalse(benchmark.running)
        XCTAssertNil(benchmark.resultsText)
    }
}
