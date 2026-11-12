import XCTest

/// What Spotlight indexes of a notebook, and which entries change (#305).
final class NotebookIndexTests: XCTestCase {
    private func notebook(_ cells: [[String: Any]], metadata: [String: Any] = [:]) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "cells": cells, "metadata": metadata, "nbformat": 4, "nbformat_minor": 5,
        ])
    }

    private func markdown(_ source: Any) -> [String: Any] {
        ["cell_type": "markdown", "source": source, "metadata": [:]]
    }

    private func code(_ source: String) -> [String: Any] {
        [
            "cell_type": "code", "source": source, "metadata": [:], "execution_count": 1,
            "outputs": [["output_type": "stream", "name": "stdout", "text": "secret output"]],
        ]
    }

    func testIndexesMarkdownTextAndHeadingsButNotCodeOrOutputs() throws {
        let data = try notebook([
            markdown(["# Orbits\n", "Io, Europa and Ganymede sit in a resonance.\n"]),
            code("let period = 7.15"),
            markdown("## Tides ##\n```python\n# not a heading\n```"),
        ], metadata: ["kernelspec": ["name": "cdp-node", "language": "javascript"]])
        let text = try NotebookIndexText(data: data, fileName: "Moons.ipynb", code: false)
        XCTAssertEqual(text.title, "Orbits")
        XCTAssertEqual(text.headings, ["Orbits", "Tides"])
        XCTAssertEqual(text.language, "javascript")
        XCTAssertTrue(text.text.contains("sit in a resonance"))
        XCTAssertFalse(text.text.contains("period"))
        XCTAssertFalse(text.text.contains("secret output"))
        XCTAssertEqual(text.summary, "Io, Europa and Ganymede sit in a resonance.")
    }

    func testHeadingsKeepAHashThatIsPartOfTheText() {
        XCTAssertEqual(NotebookIndexText.headings(in: "# Intro to C#\n## Done ##\n### ###"), ["Intro to C#", "Done"])
    }

    func testAFenceClosesOnlyOnABareRun() {
        let markdown = "```python\n# in code\n```python\n# still code\n````\n# Out"
        XCTAssertEqual(NotebookIndexText.headings(in: markdown), ["Out"])
    }

    func testSummarySkipsFencedCode() throws {
        let data = try notebook([markdown("# Title\n```\nlet x = 1\n```\nProse here.")])
        let text = try NotebookIndexText(data: data, fileName: "a.ipynb", code: true)
        XCTAssertEqual(text.summary, "Prose here.")
    }

    func testCodeWhenAskedStillNoOutputs() throws {
        let data = try notebook([code("let period = 7.15")], metadata: ["language_info": ["name": "python"]])
        let text = try NotebookIndexText(data: data, fileName: "Moons.ipynb", code: true)
        XCTAssertTrue(text.text.contains("let period = 7.15"))
        XCTAssertFalse(text.text.contains("secret output"))
        XCTAssertEqual(text.language, "python")
    }

    func testTitleFallsBackToTheFileName() throws {
        let text = try NotebookIndexText(data: notebook([markdown("Just text.")]), fileName: "Field notes.ipynb", code: false)
        XCTAssertEqual(text.title, "Field notes")
        XCTAssertEqual(text.headings, [])
        XCTAssertNil(text.language)
    }

    func testRefusesWhatIsNotANotebook() {
        XCTAssertThrowsError(try NotebookIndexText(data: Data("{}".utf8), fileName: "a.ipynb", code: false))
        XCTAssertThrowsError(try NotebookIndexText(data: Data("not json".utf8), fileName: "a.ipynb", code: false))
    }

    func testCapsTheText() throws {
        let big = String(repeating: "x", count: NotebookIndexText.maxText + 10)
        let text = try NotebookIndexText(data: notebook([markdown(big)]), fileName: "a.ipynb", code: false)
        XCTAssertEqual(text.text.count, NotebookIndexText.maxText)
    }

    func testPlanIndexesChangedAndNewFilesAndDropsGoneOnes() {
        let old = Date(timeIntervalSince1970: 1)
        let new = Date(timeIntervalSince1970: 2)
        let plan = SpotlightPlan.make(
            wanted: ["/a.ipynb": old, "/b.ipynb": new, "/c.ipynb": old],
            indexed: ["/a.ipynb": old, "/b.ipynb": old, "/gone.ipynb": old],
            all: false
        )
        XCTAssertEqual(plan, SpotlightPlan(index: ["/b.ipynb", "/c.ipynb"], remove: ["/gone.ipynb"]))
    }

    func testPlanIndexesEverythingWhenAskedTo() {
        let date = Date(timeIntervalSince1970: 1)
        let plan = SpotlightPlan.make(wanted: ["/a.ipynb": date], indexed: ["/a.ipynb": date], all: true)
        XCTAssertEqual(plan, SpotlightPlan(index: ["/a.ipynb"], remove: []))
    }
}
