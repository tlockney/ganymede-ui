import DeviceBridge
import UniformTypeIdentifiers
import XCTest

// Shortcuts' "Run Script on Device" (#434): what it hands the runner and
// what it gives back. The run itself is ScriptRunnerTests'.
final class ScriptIntentTests: XCTestCase {
    func testPicksTheLanguageByExtension() throws {
        let code = Data("return 1".utf8)
        XCTAssertEqual(try RunScriptIntent.source(data: code, filename: "a.ts").language, "typescript")
        XCTAssertEqual(try RunScriptIntent.source(data: code, filename: "a.JS").language, "javascript")
        XCTAssertEqual(try RunScriptIntent.source(data: code, filename: "a.txt").language, "typescript")
        let notebook = #"{"cells": [{"cell_type": "code", "source": "return 2"}], "metadata": {}}"#
        XCTAssertEqual(try RunScriptIntent.source(data: Data(notebook.utf8), filename: "n.ipynb").sources, ["return 2"])
        XCTAssertThrowsError(try RunScriptIntent.source(data: Data([0xFF, 0xFE, 0xFF]), filename: "bad.ts"))
    }

    func testTurnsParametersIntoInput() {
        let input = RunScriptIntent.input(
            text: "hi",
            link: URL(string: "https://example.com"),
            files: [("a.png", .png, Data([1, 2])), ("b", nil, Data())]
        )
        XCTAssertEqual(input.text, "hi")
        XCTAssertEqual(input.url, URL(string: "https://example.com"))
        XCTAssertEqual(input.files, [RunFile(name: "a.png", type: "image/png", data: Data([1, 2])), RunFile(name: "b", data: Data())])
    }

    func testKeysByTheFilesPathOrName() {
        XCTAssertEqual(RunScriptIntent.notebookPath(url: URL(fileURLWithPath: "/tmp/x/../a.ts"), filename: "a.ts"), "/tmp/a.ts")
        XCTAssertEqual(RunScriptIntent.notebookPath(url: nil, filename: "a.ts"), "shortcuts/a.ts")
    }

    func testAnswersWithOutputThenValue() throws {
        XCTAssertEqual(try RunScriptIntent.answer(ScriptResult(value: "v", output: RunOutput(text: "t"))), "t")
        XCTAssertEqual(try RunScriptIntent.answer(ScriptResult(value: "v", output: RunOutput(url: URL(string: "https://x.test")))), "https://x.test")
        XCTAssertEqual(try RunScriptIntent.answer(ScriptResult(value: "v")), "v")
        XCTAssertEqual(try RunScriptIntent.answer(ScriptResult()), "")
        XCTAssertThrowsError(try RunScriptIntent.answer(ScriptResult(error: "boom"))) { error in
            XCTAssertEqual(error as? RunScriptError, .failed("boom"))
        }
    }
}
