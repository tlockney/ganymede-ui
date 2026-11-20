import XCTest

/// The Mac navigator's Search tab (#246).
final class FileSearchTests: XCTestCase {
    private var root: URL!
    private let local = LocalFileSource()

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

    func testFindsNamesInSubfoldersFoldersIncluded() async {
        let names = await FileSearch().run("i", in: root, contents: false, source: local).names.map(\.entry.name)
        XCTAssertTrue(names.contains("Orbits.ipynb"))
        XCTAssertTrue(names.contains("Tides.ipynb"), "two folders down")
        let folders = await FileSearch().run("resonance", in: root, contents: false, source: local).names
        XCTAssertEqual(folders.map(\.entry.name), ["Resonance data"])
        XCTAssertTrue(folders[0].entry.isDirectory)
    }

    func testContentSearchReadsNotebooksOnlyAndOnlyWhenAsked() async {
        let off = await FileSearch().run("resonance", in: root, contents: false, source: local)
        XCTAssertTrue(off.contents.isEmpty)
        let on = await FileSearch().run("resonance", in: root, contents: true, source: local)
        XCTAssertEqual(on.contents.map(\.entry.name), ["Orbits.ipynb"], "not the .txt file")
        XCTAssertEqual(on.contents.first?.snippet, "Io, Europa and Ganymede sit in a resonance.")
    }

    func testSnippetTakesSourceAsAStringOrLinesAndIgnoresOtherFiles() throws {
        let asString = try JSONSerialization.data(withJSONObject: ["cells": [["source": "a\n  the Laplace resonance  \nb"]]])
        XCTAssertEqual(FileSearch.snippet(inNotebook: asString, query: "laplace"), "the Laplace resonance")
        XCTAssertNil(FileSearch.snippet(inNotebook: Data("not json".utf8), query: "a"))
    }

    func testStopsAtTheDepthLimitAndSaysSo() async {
        var search = FileSearch()
        search.maxDepth = 1
        let results = await search.run("Tides", in: root, contents: false, source: local)
        XCTAssertTrue(results.names.isEmpty)
        XCTAssertTrue(results.stoppedEarly)
    }

    func testStopsAtTheEntryLimitAndSaysSo() async {
        var search = FileSearch()
        search.maxEntries = 2
        let results = await search.run("zzz", in: root, contents: false, source: local)
        XCTAssertTrue(results.stoppedEarly)
    }

    func testStopsAtTheResultLimitAndSaysSo() async {
        var search = FileSearch()
        search.maxResults = 1
        // "o" names moons, Orbits.ipynb and notes.txt, among others.
        let results = await search.run("o", in: root, contents: false, source: local)
        XCTAssertEqual(results.names.count, 1)
        XCTAssertTrue(results.stoppedEarly)
    }

    func testACancelledSearchStops() async {
        let results = await FileSearch().run("i", in: root, contents: true, source: local, isCancelled: { true })
        XCTAssertEqual(results, FileSearch.Results())
    }

    /// The search only asks its source (#737): names and notebook text come
    /// from it, not from the disk, and a folder it can't list is skipped.
    func testSearchesAnyFileSource() async {
        let fake = FakeSource(folders: [
            "": [("moons", true), ("Orbits.ipynb", false), ("locked", true)],
            "moons": [("Io.ipynb", false), ("notes.txt", false)],
        ], texts: [
            "Orbits.ipynb": try! String(decoding: notebook(["a resonance"]), as: UTF8.self),
            "moons/Io.ipynb": try! String(decoding: notebook(["nothing"]), as: UTF8.self),
        ])
        let root = FolderEntry.machineURL("m1", path: "")!
        let names = await FileSearch().run("io", in: root, contents: false, source: fake)
        XCTAssertEqual(names.names.map(\.entry.name), ["Io.ipynb"])
        XCTAssertEqual(FolderEntry.serverPath(names.names[0].entry.url), "moons/Io.ipynb")
        let found = await FileSearch().run("resonance", in: root, contents: true, source: fake)
        XCTAssertEqual(found.contents.map(\.entry.name), ["Orbits.ipynb"])
        XCTAssertEqual(found.contents.first?.snippet, "a resonance")
        XCTAssertTrue(fake.read.contains("moons/Io.ipynb"), "every notebook is read")
        XCTAssertFalse(fake.read.contains("moons/notes.txt"), "not other files")
    }

    /// The default `isCancelled` is the running task's: the search stops
    /// after the listing that cancelled it (what a newer query does).
    func testTheDefaultCancellationIsTheCurrentTasks() async {
        let source = CancellingSource()
        let results = await FileSearch().run("a", in: FolderEntry.machineURL("m1", path: "")!, contents: false, source: source)
        XCTAssertEqual(results, FileSearch.Results())
        XCTAssertEqual(source.listCalls, 1)
    }

    /// Its first listing cancels the task that asked.
    final class CancellingSource: FileSource, @unchecked Sendable {
        private let lock = NSLock()
        private var calls = 0
        var listCalls: Int { lock.withLock { calls } }

        func list(_ folder: URL) async throws -> [FolderEntry] {
            lock.withLock { calls += 1 }
            withUnsafeCurrentTask { $0?.cancel() }
            return [
                FolderEntry(url: FolderEntry.machineURL("m1", path: "a")!, isDirectory: true),
                FolderEntry(url: FolderEntry.machineURL("m1", path: "ab.txt")!, isDirectory: false),
            ]
        }

        func readText(_ url: URL) async throws -> String? { nil }
        func serverPath(_ url: URL) -> String { FolderEntry.serverPath(url) }
        func newFolder(in parent: URL) async throws -> URL { parent }
        func rename(_ url: URL, to name: String) async throws -> URL { url }
        func duplicate(_ url: URL) async throws -> URL { url }
        func delete(_ url: URL) async throws -> URL? { nil }
    }

    /// Folders and files by machine-relative path.
    final class FakeSource: FileSource, @unchecked Sendable {
        let folders: [String: [(String, Bool)]]
        let texts: [String: String]
        private let lock = NSLock()
        private var reads: [String] = []
        var read: [String] { lock.withLock { reads } }

        init(folders: [String: [(String, Bool)]], texts: [String: String]) {
            self.folders = folders
            self.texts = texts
        }

        func list(_ folder: URL) async throws -> [FolderEntry] {
            guard let items = folders[serverPath(folder)] else { throw FileSourceError.server(status: 403, message: nil) }
            return items.map { name, isDirectory in
                let path = serverPath(folder).isEmpty ? name : serverPath(folder) + "/" + name
                return FolderEntry(url: FolderEntry.machineURL("m1", path: path)!, isDirectory: isDirectory)
            }
        }

        func readText(_ url: URL) async throws -> String? {
            lock.withLock { reads.append(serverPath(url)) }
            return texts[serverPath(url)]
        }

        func serverPath(_ url: URL) -> String { FolderEntry.serverPath(url) }
        func newFolder(in parent: URL) async throws -> URL { parent }
        func rename(_ url: URL, to name: String) async throws -> URL { url }
        func duplicate(_ url: URL) async throws -> URL { url }
        func delete(_ url: URL) async throws -> URL? { nil }
    }
}
