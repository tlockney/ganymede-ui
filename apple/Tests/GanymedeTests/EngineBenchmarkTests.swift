import XCTest

/// The engine benchmark's config and report formats (#698): the config the
/// V8 runner takes, and the table the V8 and Worker reports make, in the
/// formats of the V8 spike's `bench/report.mjs`.
final class EngineBenchmarkTests: XCTestCase {
    private let manifest = Data("""
    {"workloads": [
      {"name": "start", "sources": ["workloads/start.js"]},
      {"name": "ts-strip", "sources": ["dist/strip-bundle.js", "workloads/ts-strip.js"]}
    ]}
    """.utf8)

    private func object(_ json: String) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
    }

    // MARK: Config

    func testConfigReadsEachSourceInOrder() throws {
        var read: [String] = []
        let json = try EngineBench.config(manifest: manifest) { path in
            read.append(path)
            return "// \(path)"
        }
        XCTAssertEqual(read, ["workloads/start.js", "dist/strip-bundle.js", "workloads/ts-strip.js"])
        let config = try object(json)
        XCTAssertEqual(config["jitless"] as? Bool, true)
        XCTAssertEqual(config["repeats"] as? Int, EngineBench.repeats)
        let workloads = try XCTUnwrap(config["workloads"] as? [[String: Any]])
        XCTAssertEqual(workloads.map { $0["name"] as? String }, ["start", "ts-strip"])
        XCTAssertEqual(workloads[1]["sources"] as? [String], ["// dist/strip-bundle.js", "// workloads/ts-strip.js"])
    }

    func testConfigTakesTheRepeats() throws {
        let json = try EngineBench.config(manifest: manifest, repeats: 3) { _ in "" }
        XCTAssertEqual(try object(json)["repeats"] as? Int, 3)
    }

    func testConfigRefusesPathsOutsideTheFolderWithoutReadingThem() {
        for path in ["../secret.js", "/etc/passwd", "workloads/../../x.js", "a//b.js", ""] {
            let bad = Data(#"{"workloads": [{"name": "w", "sources": ["\#(path)"]}]}"#.utf8)
            var reads = 0
            XCTAssertThrowsError(try EngineBench.config(manifest: bad) { _ in reads += 1; return "" }, path) { error in
                XCTAssertTrue(error.localizedDescription.contains("outside the bench folder"), "\(error)")
            }
            XCTAssertEqual(reads, 0, path)
        }
    }

    func testConfigNamesTheFileItCouldNotRead() {
        struct Missing: LocalizedError { var errorDescription: String? { "no such file" } }
        XCTAssertThrowsError(try EngineBench.config(manifest: manifest) { _ in throw Missing() }) { error in
            XCTAssertEqual(error.localizedDescription, "Couldn't read workloads/start.js: no such file")
        }
    }

    func testConfigRefusesABadManifest() {
        let cases = [
            "not json",
            #"{"workloads": []}"#,
            #"{"workloads": [{"name": "w", "sources": []}]}"#,
            #"{"workloads": [{"name": "w"}]}"#,
            "{}",
        ]
        for text in cases {
            XCTAssertThrowsError(try EngineBench.config(manifest: Data(text.utf8)) { _ in "" }, text)
        }
    }

    func testPathCheck() {
        XCTAssertTrue(EngineBench.isInsideBenchFolder("workloads/cpu.js"))
        XCTAssertTrue(EngineBench.isInsideBenchFolder("dist/strip-bundle.js"))
        XCTAssertFalse(EngineBench.isInsideBenchFolder(".."))
        XCTAssertFalse(EngineBench.isInsideBenchFolder("workloads/.."))
        XCTAssertFalse(EngineBench.isInsideBenchFolder("workloads/"))
    }

    // MARK: Reports

    private let v8 = """
    {"engine": "v8", "version": "13.0", "jitless": true, "init_ms": 12.5, "workloads": [
      {"name": "start", "cold_ms": 4.25, "steady_ms": 0.5, "error": null},
      {"name": "cpu", "cold_ms": 120.4, "steady_ms": 98.6, "error": null},
      {"name": "memory", "cold_ms": 30, "steady_ms": null, "error": null}
    ]}
    """

    private let worker = """
    {"engine": "worker", "version": "Safari", "jitless": false, "init_ms": 0, "workloads": [
      {"name": "start", "cold_ms": 3.0, "steady_ms": 0.25, "error": null},
      {"name": "cpu", "cold_ms": 10.5, "steady_ms": 9.5, "error": null},
      {"name": "ts-strip", "error": "boom"}
    ]}
    """

    func testReadsAReport() throws {
        let report = try XCTUnwrap(EngineBench.Report(json: v8))
        XCTAssertEqual(report.engine, "v8")
        XCTAssertEqual(report.workloads.map(\.name), ["start", "cpu", "memory"])
        XCTAssertEqual(report.workloads[0].coldMs, 4.25)
        XCTAssertNil(report.workloads[2].steadyMs)
        XCTAssertNil(report.error)
    }

    func testNoReportIsNil() {
        XCTAssertNil(EngineBench.Report(json: nil))
    }

    func testAReportThatIsNotJSONIsAnError() throws {
        let report = try XCTUnwrap(EngineBench.Report(json: "oops"))
        XCTAssertEqual(report.error, "The report isn't JSON.")
        XCTAssertTrue(report.workloads.isEmpty)
    }

    func testAnErrorReportHoldsOnlyItsError() throws {
        let report = try XCTUnwrap(EngineBench.Report(json: EngineBench.errorReport("bad config")))
        XCTAssertEqual(report.error, "bad config")
        XCTAssertTrue(report.workloads.isEmpty)
    }

    func testNumbersThatAreNotNumbersAreMissing() throws {
        let report = try XCTUnwrap(EngineBench.Report(json: """
        {"workloads": [{"name": "w", "cold_ms": true, "steady_ms": "7"}]}
        """))
        XCTAssertNil(report.workloads[0].coldMs)
        XCTAssertNil(report.workloads[0].steadyMs)
    }

    // MARK: Table

    func testRowsMergeBothEnginesByWorkload() throws {
        let rows = EngineBench.rows(v8: EngineBench.Report(json: v8), worker: EngineBench.Report(json: worker))
        XCTAssertEqual(rows.map(\.name), ["start", "cpu", "memory", "ts-strip"])
        XCTAssertEqual(rows[1].v8?.text, "120 / 99")
        XCTAssertEqual(rows[1].webkit?.text, "11 / 9.5")
        // Only V8 ran it, so WebKit has no timing; only WebKit has ts-strip.
        XCTAssertNil(rows[2].webkit)
        XCTAssertNil(rows[3].v8)
        XCTAssertEqual(rows[3].webkit?.text, "error")
    }

    func testRowsWithoutV8ListTheWorkersAlone() {
        let rows = EngineBench.rows(v8: nil, worker: EngineBench.Report(json: worker))
        XCTAssertEqual(rows.map(\.name), ["start", "cpu", "ts-strip"])
        XCTAssertTrue(rows.allSatisfy { $0.v8 == nil })
    }

    func testRowsOfNothingAreEmpty() {
        XCTAssertTrue(EngineBench.rows(v8: nil, worker: nil).isEmpty)
    }

    func testTimingText() {
        XCTAssertEqual(EngineBench.Timing(coldMs: 4.25, steadyMs: 0.5).text, "4.3 / 0.5")
        XCTAssertEqual(EngineBench.Timing(coldMs: 30, steadyMs: nil).text, "30 / –")
        XCTAssertEqual(EngineBench.Timing(coldMs: nil, steadyMs: 1).text, "–")
        XCTAssertEqual(EngineBench.Timing(coldMs: 1, steadyMs: 1, error: "x").text, "error")
    }

    func testMillisecondsAsReportMjsShowsThem() {
        XCTAssertEqual(EngineBench.ms(nil), "–")
        XCTAssertEqual(EngineBench.ms(.infinity), "–")
        XCTAssertEqual(EngineBench.ms(0.04), "0.0")
        XCTAssertEqual(EngineBench.ms(9.5), "9.5")
        XCTAssertEqual(EngineBench.ms(10.4), "10")
        XCTAssertEqual(EngineBench.ms(10.5), "11")
        XCTAssertEqual(EngineBench.ms(1234.56), "1235")
    }

    func testMebibytes() {
        XCTAssertEqual(EngineBench.mb(nil), "–")
        XCTAssertEqual(EngineBench.mb(0), "0")
        XCTAssertEqual(EngineBench.mb(3 * 1_048_576), "3")
        XCTAssertEqual(EngineBench.mb(UInt64(1.6 * 1_048_576)), "2")
    }

    func testProblemsListReportAndWorkloadErrors() {
        let problems = EngineBench.problems(
            v8: EngineBench.Report(json: EngineBench.errorReport("bad config")),
            worker: EngineBench.Report(json: worker)
        )
        XCTAssertEqual(problems, ["V8: bad config", "WebKit, ts-strip: boom"])
        XCTAssertTrue(EngineBench.problems(v8: EngineBench.Report(json: v8), worker: nil).isEmpty)
    }

    // MARK: The results file

    func testAnnotatedAddsDeviceOSAndFootprint() throws {
        let footprint = EngineBench.Footprint(before: 10, after: 20, peak: 30)
        let json = EngineBench.annotated(v8, device: "iPad14,1", os: "Version 26.0", footprint: footprint)
        let report = try object(json)
        XCTAssertEqual(report["device"] as? String, "iPad14,1")
        XCTAssertEqual(report["os"] as? String, "Version 26.0")
        XCTAssertEqual(report["footprint_before_bytes"] as? Int, 10)
        XCTAssertEqual(report["footprint_after_bytes"] as? Int, 20)
        XCTAssertEqual(report["footprint_peak_bytes"] as? Int, 30)
        // The engine's own fields stay.
        XCTAssertEqual(report["engine"] as? String, "v8")
        XCTAssertEqual((report["workloads"] as? [Any])?.count, 3)
    }

    func testAnnotatedRecordsLeavingTheScreenOnlyWhenItHappened() throws {
        XCTAssertEqual(try object(EngineBench.annotated(worker, device: "d", os: "o", leftScreen: true))["left_screen"] as? Bool, true)
        XCTAssertNil(try object(EngineBench.annotated(worker, device: "d", os: "o"))["left_screen"])
    }

    func testAnnotatedWithoutFootprintLeavesItOut() throws {
        let report = try object(EngineBench.annotated(worker, device: "Mac15,3", os: "macOS"))
        XCTAssertNil(report["footprint_peak_bytes"])
        XCTAssertEqual(report["device"] as? String, "Mac15,3")
    }

    func testAnnotatedTurnsNonJSONIntoAnErrorReport() throws {
        let report = try object(EngineBench.annotated("garbage", device: "d", os: "o"))
        XCTAssertNotNil(report["error"] as? String)
    }

    /// The file is `[v8, worker]` (what `report.mjs` reads); `null` for an
    /// engine that didn't run.
    func testCombinedIsAnArrayWithNullForAnEngineThatDidNotRun() throws {
        let both = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(EngineBench.combined(v8: v8, worker: worker).utf8)) as? [Any])
        XCTAssertEqual(both.count, 2)
        let one = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(EngineBench.combined(v8: nil, worker: worker).utf8)) as? [Any])
        XCTAssertEqual(one.count, 2)
        XCTAssertTrue(one[0] is NSNull)
        XCTAssertEqual((one[1] as? [String: Any])?["engine"] as? String, "worker")
    }
}
