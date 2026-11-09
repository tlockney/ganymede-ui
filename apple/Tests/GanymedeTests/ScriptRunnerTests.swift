import DeviceBridge
import XCTest

// The headless script runner (#69, a spike): the engine bundle from
// `npm run build:runner` in a JavaScriptCore context, with no web view.
@MainActor
final class ScriptRunnerTests: XCTestCase {
    private func engine() throws -> String {
        try XCTUnwrap(ScriptRunner.bundledEngine(in: Bundle(for: Self.self)), "build/runner/engine.js is missing: run apple/scripts/bootstrap.sh")
    }

    private func run(_ source: ScriptSource, input: RunInput = RunInput(), timeLimit: TimeInterval = 10) async throws -> ScriptResult {
        let runner = try ScriptRunner(bridge: DeviceBridge(), notebook: "/tmp/run.ipynb", input: input, timeLimit: timeLimit, engine: engine())
        return await runner.run(source)
    }

    func testReturnsTheValueOfTypeScript() async throws {
        let result = try await run(.script("const n: number = 20\nreturn n + 22"))
        XCTAssertNil(result.error)
        XCTAssertEqual(result.value, "42")
    }

    func testRunsNotebookCellsInOrderWithAwait() async throws {
        let notebook = """
        {"cells": [
          {"cell_type": "code", "source": ["let total = 1\\n", "await new Promise((r) => setTimeout(r, 10))"]},
          {"cell_type": "markdown", "source": "not code"},
          {"cell_type": "code", "source": "total += 1\\nconsole.log('total', total)\\nreturn {total}"}
        ], "metadata": {"language_info": {"name": "typescript"}}, "nbformat": 4, "nbformat_minor": 5}
        """
        let source = try ScriptSource.notebook(Data(notebook.utf8))
        XCTAssertEqual(source.sources.count, 2)
        let result = try await run(source)
        XCTAssertNil(result.error)
        XCTAssertEqual(result.value, #"{"total":2}"#)
        XCTAssertEqual(result.log, ["log: total 2"])
    }

    func testReadsInputAndHandsBackOutput() async throws {
        let result = try await run(
            .script("const text = device.input?.text ?? ''\nawait device.output({ text: text.toUpperCase() })"),
            input: RunInput(text: "shared text")
        )
        XCTAssertNil(result.error)
        XCTAssertEqual(result.output?.text, "SHARED TEXT")
    }

    func testReportsAnError() async throws {
        let result = try await run(.script("throw new TypeError('nope')"))
        XCTAssertEqual(result.error, "TypeError: nope")
    }

    func testRejectsImports() async throws {
        let result = try await run(.script("import x from 'y'\nreturn x"))
        XCTAssertEqual(result.error?.hasPrefix("SyntaxError"), true)
    }

    func testStopsWaitingAfterTheTimeLimit() async throws {
        let result = try await run(.script("await new Promise(() => {})"), timeLimit: 0.2)
        XCTAssertEqual(result.error, "the run took longer than 0.2 seconds and was stopped")
    }

    func testFetchTakesOnlyHTTP() async {
        let reply = await ScriptRunner.fetch(#"{"url": "file:///etc/hosts"}"#, session: URLSession(configuration: .ephemeral))
        XCTAssertTrue(reply.contains("http or https"))
    }

    func testNotebookLanguagePicksJavaScript() throws {
        let notebook = #"{"cells": [], "metadata": {"language_info": {"name": "JavaScript"}}}"#
        XCTAssertEqual(try ScriptSource.notebook(Data(notebook.utf8)).language, "javascript")
        XCTAssertThrowsError(try ScriptSource.notebook(Data("[]".utf8)))
    }
}
