import XCTest

/// The Mac navigator's Search tab (#246).
final class FileSearchTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("FileSearchTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root.appendingPathComponent("moons/deep"), withIntermediateDirectories: true)
        try notebook(["# Orbits\n", "Io, Europa and Ganymede sit in a resonance."]).write(to: root.appendingPathComponent("moons/Orbits.ipynb"))
        try notebook(["const days = 1;"]).write(to: root.appendingPathComponent("moons/deep/Tides.ipynb"))
        try Data("resonance in a text file".utf8).write(to: root.appendingPathComponent("notes.txt"))
        try FileManager.default.createDirectory(at: root.appendingPathComponent("Resonance data"), withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func notebook(_ source: [String]) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "cells": [["cell_type": "markdown", "source": source, "metadata": [:]]],
            "metadata": [:], "nbformat": 4, "nbformat_minor": 5,
        ])
    }

    func testNamesMatchCaseInsensitivelyWithIpynbOptional() {
        XCTAssertTrue(FileSearch.nameMatches("Orbits.ipynb", query: "orbits"))
        XCTAssertTrue(FileSearch.nameMatches("Orbits.ipynb", query: "ORBITS.IPYNB"))
        XCTAssertTrue(FileSearch.nameMatches("Resonance data", query: " reso "))
        XCTAssertFalse(FileSearch.nameMatches("Orbits.ipynb", query: "tides"))
        XCTAssertFalse(FileSearch.nameMatches("Orbits.ipynb", query: "   "))
    }

    func testFindsNamesInSubfoldersFoldersIncluded() {
        let names = FileSearch().run("i", in: root, contents: false).names.map(\.entry.name)
        XCTAssertTrue(names.contains("Orbits.ipynb"))
        XCTAssertTrue(names.contains("Tides.ipynb"), "two folders down")
        let folders = FileSearch().run("resonance", in: root, contents: false).names
        XCTAssertEqual(folders.map(\.entry.name), ["Resonance data"])
        XCTAssertTrue(folders[0].entry.isDirectory)
    }

    func testContentSearchReadsNotebooksOnlyAndOnlyWhenAsked() {
        let off = FileSearch().run("resonance", in: root, contents: false)
        XCTAssertTrue(off.contents.isEmpty)
        let on = FileSearch().run("resonance", in: root, contents: true)
        XCTAssertEqual(on.contents.map(\.entry.name), ["Orbits.ipynb"], "not the .txt file")
        XCTAssertEqual(on.contents.first?.snippet, "Io, Europa and Ganymede sit in a resonance.")
    }

    func testSnippetTakesSourceAsAStringOrLinesAndIgnoresOtherFiles() throws {
        let asString = try JSONSerialization.data(withJSONObject: ["cells": [["source": "a\n  the Laplace resonance  \nb"]]])
        XCTAssertEqual(FileSearch.snippet(inNotebook: asString, query: "laplace"), "the Laplace resonance")
        XCTAssertNil(FileSearch.snippet(inNotebook: Data("not json".utf8), query: "a"))
    }

    func testStopsAtTheDepthLimitAndSaysSo() {
        var search = FileSearch()
        search.maxDepth = 1
        let results = search.run("Tides", in: root, contents: false)
        XCTAssertTrue(results.names.isEmpty)
        XCTAssertTrue(results.stoppedEarly)
    }

    func testStopsAtTheEntryLimitAndSaysSo() {
        var search = FileSearch()
        search.maxEntries = 2
        XCTAssertTrue(search.run("zzz", in: root, contents: false).stoppedEarly)
    }

    func testStopsAtTheResultLimitAndSaysSo() {
        var search = FileSearch()
        search.maxResults = 1
        // "o" names moons, Orbits.ipynb and notes.txt, among others.
        let results = search.run("o", in: root, contents: false)
        XCTAssertEqual(results.names.count, 1)
        XCTAssertTrue(results.stoppedEarly)
    }

    func testACancelledSearchStops() {
        let results = FileSearch().run("i", in: root, contents: true, isCancelled: { true })
        XCTAssertEqual(results, FileSearch.Results())
    }
}
