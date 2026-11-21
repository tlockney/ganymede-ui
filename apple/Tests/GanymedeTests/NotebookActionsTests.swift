import XCTest

/// The Shortcuts action layer (#302) against a fake server: the REST calls
/// it makes, and what it makes of the answers.
final class NotebookActionsTests: XCTestCase {
    /// Answers requests by method and path, and records them.
    final class FakeServer: @unchecked Sendable {
        typealias Route = (URLRequest) -> (Int, Any?)
        private let lock = NSLock()
        private var routes: [String: [Route]] = [:]
        private(set) var requests: [URLRequest] = []

        /// Answers `method path` with each of `answers` in turn, the last
        /// one from then on.
        func on(_ key: String, _ answers: Route...) {
            lock.withLock { routes[key] = answers }
        }

        func on(_ key: String, status: Int = 200, _ body: Any?) {
            on(key) { _ in (status, body) }
        }

        func calls(_ key: String) -> [URLRequest] {
            lock.withLock { requests.filter { Self.key($0) == key } }
        }

        static func key(_ request: URLRequest) -> String {
            "\(request.httpMethod ?? "GET") \(request.url?.path ?? "")"
        }

        func respond(_ request: URLRequest) -> (Data, URLResponse) {
            let route: Route? = lock.withLock {
                requests.append(request)
                let key = Self.key(request)
                guard var list = routes[key], !list.isEmpty else { return nil }
                let first = list.removeFirst()
                if !list.isEmpty { routes[key] = list }
                return first
            }
            let (status, body) = route?(request) ?? (404, ["message": "no route for \(Self.key(request))"])
            let data = body.flatMap { try? JSONSerialization.data(withJSONObject: $0, options: [.fragmentsAllowed]) } ?? Data()
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            return (data, response)
        }
    }

    private var fake: FakeServer!
    private var actions: NotebookActions!

    override func setUp() {
        let fake = FakeServer()
        self.fake = fake
        actions = NotebookActions(
            server: ServerEndpoint(base: URL(string: "http://127.0.0.1:1/")!, token: "secret"),
            send: { fake.respond($0) }
        )
        actions.settle = .zero
    }

    private static func code(_ id: String, _ source: Any, tags: [String] = [], outputs: [[String: Any]] = [], count: Int? = nil) -> [String: Any] {
        ["cell_type": "code", "id": id, "source": source, "metadata": ["tags": tags],
         "outputs": outputs, "execution_count": count.map { $0 as Any } ?? NSNull()]
    }

    private static func notebook(_ cells: [[String: Any]], kernel: String? = "python3") -> [String: Any] {
        var metadata: [String: Any] = [:]
        if let kernel { metadata["kernelspec"] = ["name": kernel, "display_name": kernel] }
        return ["type": "notebook", "path": "dir/nb.ipynb",
                "content": ["cells": cells, "metadata": metadata, "nbformat": 4, "nbformat_minor": 5]]
    }

    private static func body(_ request: URLRequest) -> [String: Any] {
        request.httpBody.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
    }

    private static let stream: [String: Any] = ["output_type": "stream", "name": "stdout", "text": ["hel", "lo\n"]]

    /// A 400 as the server answers it; `error` is its machine-readable kind.
    private static func refusal(_ message: String, error: String? = nil) -> (Int, Any?) {
        var body: [String: Any] = ["message": message, "reason": NSNull()]
        if let error { body["error"] = error }
        return (400, body)
    }

    /// The server's answer for an id or tag the room doesn't have.
    private static func notFound() -> (Int, Any?) {
        refusal("No code cell has the tag \"x\" in document", error: "cell_not_found")
    }

    /// What a server from before ganymede#843 (v0.11.0) answers a request with no `source_hash`.
    private static func needsHash() -> (Int, Any?) {
        refusal("source_hash is required for cell \"a\"")
    }

    /// The `cells` of an execute request, as a list of `{cell_id|tag, source_hash?}` entries.
    private static func entries(_ request: URLRequest) -> [[String: String]]? {
        body(request)["cells"] as? [[String: String]]
    }

    private static func hash(_ source: String) -> String {
        String(NotebookActions.murmur2(Array(source.utf8)))
    }

    /// A notebook of nbformat 4.4: cells without ids.
    private func serveWithoutIDs() {
        fake.on("GET /api/contents/dir/nb.ipynb", ["type": "notebook", "content": [
            "cells": [["cell_type": "code", "source": "1", "metadata": [:], "outputs": [], "execution_count": NSNull()]],
            "metadata": ["kernelspec": ["name": "python3"]], "nbformat": 4, "nbformat_minor": 4,
        ]])
        fake.on("GET /api/sessions", [Any]())
        fake.on("POST /api/sessions", status: 201, ["id": "s1", "kernel": ["id": "k1"]])
        fake.on("POST /api/fileid/index", ["id": "f1"])
        fake.on("POST /api/kernels/k1/restart", ["id": "k1"])
    }

    /// A server with `cells` in dir/nb.ipynb, no session, and a new one on
    /// kernel k1 when asked.
    private func serve(_ cells: [[String: Any]], kernel: String? = "python3") {
        fake.on("GET /api/contents/dir/nb.ipynb", Self.notebook(cells, kernel: kernel))
        fake.on("GET /api/sessions", [Any]())
        fake.on("POST /api/sessions", status: 201, ["id": "s1", "kernel": ["id": "k1"]])
        fake.on("POST /api/fileid/index", ["id": "f1", "path": "dir/nb.ipynb"])
        fake.on("POST /api/kernels/k1/restart", ["id": "k1"])
    }

    // MARK: Hashes and paths

    /// Values from `jupyter_server_documents`, as ganymede's own test has them.
    func testMurmur2MatchesJupyterServerDocuments() {
        for (text, hash) in [
            ("", 0), ("a", 2_456_313_694), ("ab", 446_775_395), ("abc", 324_500_635),
            ("abcd", 646_393_889), ("print('hello')\n", 1_612_567_987), ("héllo wörld 🚀", 1_432_791_399),
        ] as [(String, UInt32)] {
            XCTAssertEqual(NotebookActions.murmur2(Array(text.utf8)), hash, text)
        }
    }

    func testAPIPathsAreUnderTheServerRoot() {
        let mac = URL(fileURLWithPath: "/", isDirectory: true)
        XCTAssertEqual(NotebookActions.apiPath(for: URL(fileURLWithPath: "/Users/me/a b.ipynb"), root: mac), "Users/me/a b.ipynb")
        let folder = URL(fileURLWithPath: "/Users/me/notes", isDirectory: true)
        XCTAssertEqual(NotebookActions.apiPath(for: URL(fileURLWithPath: "/Users/me/notes/x/y.ipynb"), root: folder), "x/y.ipynb")
        XCTAssertEqual(NotebookActions.apiPath(for: folder, root: folder), "")
        XCTAssertNil(NotebookActions.apiPath(for: URL(fileURLWithPath: "/Users/me/notes2/y.ipynb"), root: folder))
        XCTAssertNil(NotebookActions.apiPath(for: URL(fileURLWithPath: "/Users/me/y.ipynb"), root: folder))
    }

    /// As the windows map paths: symlinks stay as written on the Mac, so
    /// an action and a window share one room (/tmp is a link to /private/tmp).
    func testAPIPathsMatchTheWindows() {
        let mac = URL(fileURLWithPath: "/", isDirectory: true)
        let file = URL(fileURLWithPath: "/tmp/a.ipynb")
        XCTAssertEqual(NotebookActions.apiPath(for: file, root: mac), "tmp/a.ipynb")
        XCTAssertEqual(NotebookActions.apiPath(for: file, root: mac), FolderEntry.serverPath(file))
    }

    func testQueryValuesEscapePlusAndAmpersand() async throws {
        fake.on("GET /api/contents/a+b&c.ipynb", Self.notebook([Self.code("a", "1")]))
        fake.on("GET /api/sessions", [Any]())
        fake.on("POST /api/sessions", status: 201, ["id": "s1", "kernel": ["id": "k1"]])
        fake.on("POST /api/fileid/index", ["id": "f1"])
        fake.on("POST /api/kernels/k1/execute", ["finished": true, "cells": [Self.code("a", "1", count: 1)]])
        _ = try await actions.notebookRunAll(path: "a+b&c.ipynb", restart: false, timeout: 5)
        let index = try XCTUnwrap(fake.calls("POST /api/fileid/index").first?.url)
        XCTAssertEqual(URLComponents(url: index, resolvingAgainstBaseURL: false)?.percentEncodedQuery, "path=a%2Bb%26c.ipynb")
    }

    // MARK: Runs with parameters

    func testRunWithParamsPostsToTheRunEndpoint() async throws {
        fake.on("POST /api/notebooks/run") { request in
            let body = Self.body(request)
            XCTAssertEqual(body["path"] as? String, "dir/nb.ipynb")
            XCTAssertEqual((body["params"] as? [String: Any])?["day"] as? String, "mon")
            XCTAssertEqual(body["timeout"] as? Int, 30)
            return (200, ["path": "dir/nb.ipynb", "status": "ok", "results": ["total": 43, "a": [1]]])
        }
        let result = try await actions.notebookRunWithParams(path: "dir/nb.ipynb", params: #"{"day":"mon"}"#, timeout: 30)
        XCTAssertEqual(result, .init(status: "ok", results: #"{"a":[1],"total":43}"#, error: nil))
    }

    func testRunWithParamsReportsAFailedRun() async throws {
        fake.on("POST /api/notebooks/run", ["status": "error", "results": ["first": 1], "error": "cell 1 failed: E: x"])
        let result = try await actions.notebookRunWithParams(path: "dir/nb.ipynb", params: "{}", timeout: 30)
        XCTAssertEqual(result, .init(status: "error", results: #"{"first":1}"#, error: "cell 1 failed: E: x"))
    }

    func testRunWithParamsErrors() async {
        func failure(_ params: String = "{}") async -> NotebookActionError? {
            do {
                _ = try await actions.notebookRunWithParams(path: "dir/nb.ipynb", params: params, timeout: 30)
                return nil
            } catch {
                return error as? NotebookActionError
            }
        }
        let bad = await failure("[1]")
        XCTAssertEqual(bad, .badParams("[1]"))
        XCTAssertTrue(fake.calls("POST /api/notebooks/run").isEmpty, "nothing sent for bad parameters")
        // No route: a server from before ganymede#652.
        let old = await failure()
        XCTAssertEqual(old, .oldServer)
        fake.on("POST /api/notebooks/run", status: 404, ["message": "cannot read dir/nb.ipynb as a notebook"])
        let missing = await failure()
        XCTAssertEqual(missing, .notFound("dir/nb.ipynb"))
        fake.on("POST /api/notebooks/run", status: 400, ["message": "dir/nb.ipynb has no metadata.kernelspec.name"])
        let refused = await failure()
        XCTAssertEqual(refused, .server(status: 400, message: "dir/nb.ipynb has no metadata.kernelspec.name"))
    }

    /// nbformat before 4.5 has no cell ids on disk; the room gives them, so
    /// a run on a server with ganymede#843 needs none.
    func testCellsWithoutIDsRunByTheRoomsIDs() async throws {
        serveWithoutIDs()
        fake.on("POST /api/kernels/k1/execute", ["finished": true, "cells": [Self.code("room-id", "1", count: 1)]])
        let all = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: true, timeout: 5)
        XCTAssertEqual(all.map(\.id), ["room-id"])
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/restart").count, 1)
        let one = try await actions.cellRun(path: "dir/nb.ipynb", cell: "room-id", timeout: 5)
        XCTAssertEqual(one.map(\.id), ["room-id"])
        XCTAssertEqual(Self.entries(try XCTUnwrap(fake.calls("POST /api/kernels/k1/execute").last)), [["cell_id": "room-id"]])
    }

    /// A server from before ganymede#843 needs the ids on disk, as before.
    func testCellsWithoutIDsAreAnErrorOnAnOldServer() async throws {
        serveWithoutIDs()
        fake.on("POST /api/kernels/k1/execute") { _ in Self.refusal("cells must be a non-empty list of {cell_id, source_hash}") }
        do {
            _ = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: false, timeout: 5)
            XCTFail("no ids")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .noCellIDs("dir/nb.ipynb"))
        }
        // Reading outputs by id still needs them.
        do {
            _ = try await actions.notebookRead(path: "dir/nb.ipynb")
            XCTFail("no ids")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .noCellIDs("dir/nb.ipynb"))
        }
    }

    func testOnlyTheOldServersRefusalsMeanNeedsAHash() {
        for message in [
            "source_hash is required for cell \"a\"",
            "cells must be a non-empty list of {cell_id, source_hash}",
            "Each cell entry must have a cell_id string, got {\"tag\":\"x\"}",
        ] {
            XCTAssertTrue(NotebookActions.needsSourceHash(message), message)
        }
        for message in [
            "cells must be \"all\" or a non-empty list of {cell_id, source_hash} or {tag}",
            "Each cell entry must have a cell_id string or a tag string, not both, got 1",
            "source_hash must be a string or number for cell \"a\"",
            "document_id is required",
        ] {
            XCTAssertFalse(NotebookActions.needsSourceHash(message), message)
        }
    }

    func testNewNotebookReportsOtherFailures() async throws {
        fake.on("GET /api/contents/dir/Report.ipynb", status: 403, ["message": "forbidden"])
        do {
            _ = try await actions.notebookNew(dir: "dir", name: "Report", template: nil)
            XCTFail("forbidden")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .server(status: 403, message: "forbidden"))
        }
    }

    // MARK: Outputs

    func testOutputsBecomeTextImagesAndJSON() throws {
        let png = Data([0x89, 0x50, 0x4E, 0x47])
        let cell = try XCTUnwrap(NotebookCell(json: Self.code("a", ["x = 1\n", "x"], outputs: [
            Self.stream,
            ["output_type": "execute_result", "execution_count": 1, "metadata": [:],
             "data": ["text/plain": ["1"], "application/json": ["b": 2, "a": [1]]]],
            ["output_type": "display_data", "metadata": [:],
             "data": ["image/png": png.base64EncodedString() + "\n", "text/plain": "<Figure>"]],
            ["output_type": "error", "ename": "ValueError", "evalue": "bad", "traceback": []],
            ["output_type": "unknown"],
        ], count: 1)))
        XCTAssertEqual(cell.source, "x = 1\nx")
        XCTAssertEqual(cell.executionCount, 1)
        XCTAssertEqual(cell.outputs.map(\.kind), [.stream, .result, .display, .error])
        XCTAssertEqual(cell.outputs[0].text, "hello\n")
        XCTAssertEqual(cell.outputs[1].text, "1")
        XCTAssertEqual(cell.outputs[1].json, "{\n  \"a\" : [\n    1\n  ],\n  \"b\" : 2\n}")
        XCTAssertEqual(cell.outputs[2].image, CellOutput.Image(data: png, type: "image/png"))
        XCTAssertEqual(cell.outputs[2].text, "<Figure>")
        XCTAssertEqual(cell.outputs[3].text, "ValueError: bad")
        XCTAssertEqual(cell.error?.name, "ValueError")
        XCTAssertNil(NotebookCell(json: ["cell_type": "code", "source": ""]), "a cell without an id")
    }

    // MARK: Running

    func testRunAllAsksForAllCellsAndReturnsThem() async throws {
        serve([
            Self.code("a", "1"),
            ["cell_type": "markdown", "id": "m", "source": "text", "metadata": [:]],
            Self.code("c", ["print(", "'hi')"]),
        ])
        fake.on("POST /api/kernels/k1/execute") { _ in
            (200, ["finished": true, "cells": [
                Self.code("a", "1", count: 1),
                Self.code("c", "print('hi')", outputs: [Self.stream], count: 2),
            ]])
        }
        let cells = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: true, timeout: 30)
        XCTAssertEqual(cells.map(\.id), ["a", "c"])
        XCTAssertEqual(cells[1].outputs.first?.text, "hello\n")

        // A session on the notebook's own kernelspec, restarted, then run.
        let session = Self.body(try XCTUnwrap(fake.calls("POST /api/sessions").first))
        XCTAssertEqual(session["path"] as? String, "dir/nb.ipynb")
        XCTAssertEqual(session["type"] as? String, "notebook")
        XCTAssertEqual((session["kernel"] as? [String: Any])?["name"] as? String, "python3")
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/restart").count, 1)
        let keys = fake.requests.map(FakeServer.key)
        let restarted = try XCTUnwrap(keys.firstIndex(of: "POST /api/kernels/k1/restart"))
        let ran = try XCTUnwrap(keys.firstIndex(of: "POST /api/kernels/k1/execute"))
        XCTAssertLessThan(restarted, ran, "restarts before running")
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/execute").count, 1)
        let request = try XCTUnwrap(fake.calls("POST /api/kernels/k1/execute").first)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "token secret")
        XCTAssertGreaterThan(request.timeoutInterval, 30)
        let body = Self.body(request)
        XCTAssertEqual(body["document_id"] as? String, "json:notebook:f1")
        XCTAssertEqual(body["wait"] as? Int, 30)
        XCTAssertEqual(body["by"] as? String, "Ganymede")
        XCTAssertEqual(body["cells"] as? String, "all", "the room picks the cells, from its own source")
        let index = try XCTUnwrap(fake.calls("POST /api/fileid/index").first?.url)
        XCTAssertEqual(URLComponents(url: index, resolvingAgainstBaseURL: false)?.queryItems?.first?.value, "dir/nb.ipynb")
    }

    func testRunAllWithoutRestartDoesNotRestart() async throws {
        serve([Self.code("a", "1")])
        fake.on("POST /api/kernels/k1/execute", ["finished": true, "cells": [Self.code("a", "1", count: 1)]])
        _ = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: false, timeout: 5)
        XCTAssertTrue(fake.calls("POST /api/kernels/k1/restart").isEmpty)
    }

    /// The room has no code cells with source: nothing runs, and that isn't an error.
    func testRunAllOfANotebookWithoutCodeIsEmpty() async throws {
        serve([["cell_type": "markdown", "id": "m", "source": "text", "metadata": [:]]])
        fake.on("POST /api/kernels/k1/execute", ["finished": true, "cells": [Any]()])
        let cells = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: true, timeout: 5)
        XCTAssertEqual(cells, [])
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/restart").count, 1)
    }

    func testARunJoinsTheNotebooksSession() async throws {
        serve([Self.code("a", "1")])
        fake.on("GET /api/sessions", [["id": "s0", "path": "dir/nb.ipynb", "kernel": ["id": "k1"]]])
        fake.on("POST /api/kernels/k1/execute", ["finished": true, "cells": [Self.code("a", "1", count: 1)]])
        _ = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: false, timeout: 5)
        XCTAssertTrue(fake.calls("POST /api/sessions").isEmpty)
        XCTAssertTrue(fake.calls("POST /api/kernels/k1/restart").isEmpty)
    }

    /// The cell is named by its id, with no hash: the room's source runs.
    func testRunCellSendsItsIdWithoutAHash() async throws {
        serve([Self.code("a", "1"), Self.code("b", "2")])
        fake.on("POST /api/kernels/k1/execute", ["finished": true, "cells": [Self.code("b", "2", count: 1)]])
        let cells = try await actions.cellRun(path: "dir/nb.ipynb", cell: "b", timeout: 5)
        XCTAssertEqual(cells.map(\.id), ["b"])
        let request = try XCTUnwrap(fake.calls("POST /api/kernels/k1/execute").first)
        XCTAssertEqual(Self.entries(request), [["cell_id": "b"]])
        let sent = try XCTUnwrap(Self.body(request)["cells"] as? [[String: Any]])
        XCTAssertNil(sent.first?["source_hash"])
        XCTAssertEqual(Self.body(request)["by"] as? String, "Ganymede")
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/execute").count, 1)
        XCTAssertTrue(fake.calls("POST /api/kernels/k1/restart").isEmpty)
    }

    /// No cell has the id, so the name is a tag: every cell tagged so.
    func testRunCellFallsBackToTheTag() async throws {
        serve([Self.code("a", "1", tags: ["report"]), Self.code("c", "3", tags: ["report"])])
        fake.on(
            "POST /api/kernels/k1/execute",
            { _ in Self.notFound() },
            { _ in (200, ["finished": true, "cells": [Self.code("a", "1", count: 1), Self.code("c", "3", count: 2)]]) }
        )
        let cells = try await actions.cellRun(path: "dir/nb.ipynb", cell: "report", timeout: 5)
        XCTAssertEqual(cells.map(\.id), ["a", "c"])
        let sent = fake.calls("POST /api/kernels/k1/execute").compactMap { Self.entries($0) }
        XCTAssertEqual(sent, [[["cell_id": "report"]], [["tag": "report"]]])
    }

    func testRunCellWithNeitherAnIdNorATagIsNoCell() async throws {
        serve([Self.code("a", "1")])
        fake.on("POST /api/kernels/k1/execute") { _ in Self.notFound() }
        do {
            _ = try await actions.cellRun(path: "dir/nb.ipynb", cell: "nothing", timeout: 5)
            XCTFail("no such cell")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .noCell("nothing"))
        }
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/execute").count, 2, "the id, then the tag")
    }

    /// An id that names a markdown cell is no cell, as it always was, and
    /// isn't tried as a tag.
    func testRunCellOfANonCodeCellIsNoCell() async throws {
        serve([["cell_type": "markdown", "id": "m", "source": "text", "metadata": [:]]])
        fake.on("POST /api/kernels/k1/execute") { _ in Self.refusal("Cell \"m\" is not a code cell") }
        do {
            _ = try await actions.cellRun(path: "dir/nb.ipynb", cell: "m", timeout: 5)
            XCTFail("not code")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .noCell("m"))
        }
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/execute").count, 1)
    }

    /// Other refusals are the server's, reported as they are.
    func testOtherRefusalsAreReported() async throws {
        serve([Self.code("a", "1")])
        fake.on("POST /api/kernels/k1/execute") { _ in Self.refusal("read-only here; run it there") }
        do {
            _ = try await actions.cellRun(path: "dir/nb.ipynb", cell: "a", timeout: 5)
            XCTFail("refused")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .server(status: 400, message: "read-only here; run it there"))
        }
    }

    // MARK: A server from before ganymede#843

    /// It answers that every cell needs a hash: read the saved file, select, hash.
    func testRunAllOnAnOldServerHashesTheSavedCells() async throws {
        serve([
            Self.code("a", "1"),
            ["cell_type": "markdown", "id": "m", "source": "text", "metadata": [:]],
            Self.code("blank", "  \n"),
            Self.code("c", ["print(", "'hi')"]),
        ])
        fake.on(
            "POST /api/kernels/k1/execute",
            { _ in Self.refusal("cells must be a non-empty list of {cell_id, source_hash}") },
            { _ in (200, ["finished": true, "cells": [Self.code("a", "1", count: 1), Self.code("c", "print('hi')", count: 2)]]) }
        )
        let cells = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: true, timeout: 30)
        XCTAssertEqual(cells.map(\.id), ["a", "c"])
        let calls = fake.calls("POST /api/kernels/k1/execute")
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(Self.body(calls[0])["cells"] as? String, "all")
        XCTAssertEqual(Self.entries(calls[1]), [
            ["cell_id": "a", "source_hash": Self.hash("1")],
            ["cell_id": "c", "source_hash": Self.hash("print('hi')")],
        ])
        XCTAssertEqual(Self.body(calls[1])["by"] as? String, "Ganymede")
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/restart").count, 1, "restarted once, not again")
    }

    func testRunCellOnAnOldServerHashesTheSavedCell() async throws {
        serve([Self.code("a", "1", tags: ["report"]), Self.code("b", "2"), Self.code("c", "3", tags: ["report"])])
        fake.on(
            "POST /api/kernels/k1/execute",
            { _ in Self.needsHash() },
            { _ in (200, ["finished": true, "cells": [Self.code("b", "2", count: 1)]]) },
            { _ in Self.needsHash() },
            { _ in (200, ["finished": true, "cells": [Self.code("a", "1", count: 1), Self.code("c", "3", count: 2)]]) }
        )
        let byID = try await actions.cellRun(path: "dir/nb.ipynb", cell: "b", timeout: 5)
        XCTAssertEqual(byID.map(\.id), ["b"])
        let byTag = try await actions.cellRun(path: "dir/nb.ipynb", cell: "report", timeout: 5)
        XCTAssertEqual(byTag.map(\.id), ["a", "c"])
        let sent = fake.calls("POST /api/kernels/k1/execute").compactMap { Self.entries($0) }
        XCTAssertEqual(sent, [
            [["cell_id": "b"]], [["cell_id": "b", "source_hash": Self.hash("2")]],
            [["cell_id": "report"]],
            [["cell_id": "a", "source_hash": Self.hash("1")], ["cell_id": "c", "source_hash": Self.hash("3")]],
        ])
        do {
            fake.on("POST /api/kernels/k1/execute") { _ in Self.needsHash() }
            _ = try await actions.cellRun(path: "dir/nb.ipynb", cell: "nothing", timeout: 5)
            XCTFail("no such cell")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .noCell("nothing"))
        }
    }

    func testAFailedCellIsAnError() async throws {
        serve([Self.code("a", "raise")])
        fake.on("POST /api/kernels/k1/execute", ["finished": true, "cells": [
            Self.code("a", "raise", outputs: [["output_type": "error", "ename": "ZeroDivisionError", "evalue": "division by zero", "traceback": []]], count: 1),
        ]])
        do {
            _ = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: false, timeout: 5)
            XCTFail("the cell failed")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .cellFailed(cell: "a", name: "ZeroDivisionError", value: "division by zero"))
            XCTAssertEqual(error.localizedDescription, "Cell a failed: ZeroDivisionError: division by zero")
        }
    }

    func testUnfinishedCellsTimeOut() async throws {
        serve([Self.code("a", "sleep")])
        fake.on("POST /api/kernels/k1/execute", ["finished": false, "cells": [Self.code("a", "sleep")]])
        do {
            _ = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: false, timeout: 2)
            XCTFail("timed out")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .timedOut(2))
        }
    }

    /// On a server from before ganymede#843 the file can be older than the
    /// window's edits: read again and retry once.
    func testAStaleSourceIsReadAgainOnceOnAnOldServer() async throws {
        serve([Self.code("a", "old")])
        fake.on(
            "GET /api/contents/dir/nb.ipynb",
            { _ in (200, Self.notebook([Self.code("a", "old")])) },
            { _ in (200, Self.notebook([Self.code("a", "old")])) },
            { _ in (200, Self.notebook([Self.code("a", "new")])) }
        )
        fake.on(
            "POST /api/kernels/k1/execute",
            { _ in Self.refusal("cells must be a non-empty list of {cell_id, source_hash}") },
            { _ in (409, ["error": "source_mismatch", "cell_id": "a"]) },
            { _ in (200, ["finished": true, "cells": [Self.code("a", "new", count: 1)]]) }
        )
        let cells = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: false, timeout: 5)
        XCTAssertEqual(cells.first?.source, "new")
        let hashes: [String?] = fake.calls("POST /api/kernels/k1/execute").dropFirst().map { Self.entries($0)?.first?["source_hash"] }
        XCTAssertEqual(hashes, [Self.hash("old") as String?, Self.hash("new") as String?])
    }

    /// With no hash there is nothing to be stale against: no retry.
    func testAStaleAnswerToAHashlessRequestIsReported() async throws {
        serve([Self.code("a", "1")])
        fake.on("POST /api/kernels/k1/execute", status: 409, ["error": "source_mismatch", "cell_id": "a"])
        do {
            _ = try await actions.cellRun(path: "dir/nb.ipynb", cell: "a", timeout: 5)
            XCTFail("stale")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .changed("a"))
        }
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/execute").count, 1)
    }

    func testAServerThatDoesNotWaitIsReported() async throws {
        serve([Self.code("a", "1")])
        fake.on("POST /api/kernels/k1/execute", NSNull())
        do {
            _ = try await actions.notebookRunAll(path: "dir/nb.ipynb", restart: false, timeout: 5)
            XCTFail("old server")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .oldServer)
        }
    }

    // MARK: Other operations

    func testAMissingNotebookIsNamed() async throws {
        do {
            _ = try await actions.notebookRead(path: "gone.ipynb")
            XCTFail("missing")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .notFound("gone.ipynb"))
        }
    }

    func testListGivesNotebooksAndFolders() async throws {
        fake.on("GET /api/contents/dir", ["type": "directory", "content": [
            ["type": "notebook", "path": "dir/b.ipynb"], ["type": "file", "path": "dir/x.txt"],
            ["type": "directory", "path": "dir/sub"], ["type": "notebook", "path": "dir/A.ipynb"],
        ]])
        let items = try await actions.notebooksList(dir: "dir")
        XCTAssertEqual(items, [
            .init(path: "dir/A.ipynb", isDirectory: false), .init(path: "dir/b.ipynb", isDirectory: false),
            .init(path: "dir/sub", isDirectory: true),
        ])
        fake.on("GET /api/contents", ["type": "directory", "content": [["type": "notebook", "path": "top.ipynb"]]])
        let top = try await actions.notebooksList(dir: "")
        XCTAssertEqual(top.map(\.path), ["top.ipynb"])
    }

    func testNewNotebookNeverReplacesAFile() async throws {
        fake.on("GET /api/contents/dir/Report.ipynb", ["type": "notebook", "path": "dir/Report.ipynb"])
        do {
            _ = try await actions.notebookNew(dir: "dir", name: "Report", template: nil)
            XCTFail("exists")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .exists("dir/Report.ipynb"))
        }
        XCTAssertTrue(fake.calls("PUT /api/contents/dir/Report.ipynb").isEmpty)
    }

    func testNewNotebookFromATemplate() async throws {
        fake.on("GET /api/contents/dir/Report.ipynb", status: 404, ["message": "not found"])
        fake.on("GET /api/contents/t.ipynb", Self.notebook([Self.code("a", "1")]))
        fake.on("PUT /api/contents/dir/Report.ipynb", status: 201, ["type": "notebook", "path": "dir/Report.ipynb"])
        let path = try await actions.notebookNew(dir: "dir", name: "Report", template: "t.ipynb")
        XCTAssertEqual(path, "dir/Report.ipynb")
        let put = Self.body(try XCTUnwrap(fake.calls("PUT /api/contents/dir/Report.ipynb").first))
        XCTAssertEqual(put["type"] as? String, "notebook")
        XCTAssertEqual(((put["content"] as? [String: Any])?["cells"] as? [Any])?.count, 1)

        // Unnamed: the server names it, copying the template.
        fake.on("POST /api/contents/dir", status: 201, ["type": "notebook", "path": "dir/t-Copy1.ipynb"])
        let copy = try await actions.notebookNew(dir: "dir", name: nil, template: "t.ipynb")
        XCTAssertEqual(copy, "dir/t-Copy1.ipynb")
        XCTAssertEqual(Self.body(try XCTUnwrap(fake.calls("POST /api/contents/dir").first))["copy_from"] as? String, "t.ipynb")
    }

    func testKernelControl() async throws {
        fake.on("GET /api/sessions", [Any]())
        do {
            _ = try await actions.kernelControl(path: "dir/nb.ipynb", action: .interrupt)
            XCTFail("no kernel")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .noKernel("dir/nb.ipynb"))
        }
        fake.on("GET /api/sessions", [["id": "s1", "path": "dir/nb.ipynb", "kernel": ["id": "k1"]]])
        fake.on("POST /api/kernels/k1/interrupt", status: 204, nil)
        _ = try await actions.kernelControl(path: "dir/nb.ipynb", action: .interrupt)
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/interrupt").count, 1)
        // Shutting down deletes the session; the kernel is gone with it.
        fake.on("DELETE /api/sessions/s1", status: 204, nil)
        fake.on("DELETE /api/kernels/k1", status: 404, ["message": "no kernel"])
        _ = try await actions.kernelControl(path: "dir/nb.ipynb", action: .shutdown)
        XCTAssertEqual(fake.calls("DELETE /api/sessions/s1").count, 1)
    }

    /// The calls that need no kernel, against the real in-process server:
    /// the REST shapes the fake stands in for.
    func testAgainstTheRealServer() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let web = dir.appendingPathComponent("web")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: dir.appendingPathComponent("notes"), withIntermediateDirectories: true)
        try "<!doctype html>".write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: dir) }
        let host = try ServerHost(config: [
            "root_dir": dir.path, "static_dir": web.path, "port": 0,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
        ])
        defer { host.stop() }
        let real = NotebookActions(server: try XCTUnwrap(ServerEndpoint(serverURL: host.url)))

        let made = try await real.notebookNew(dir: "notes", name: "First", template: nil)
        XCTAssertEqual(made, "notes/First.ipynb")
        let untitled = try await real.notebookNew(dir: "notes", name: nil, template: made)
        XCTAssertNotEqual(untitled, made)
        let listed = try await real.notebooksList(dir: "notes")
        XCTAssertEqual(Set(listed.map(\.path)), [made, untitled])
        let read = try await real.notebookRead(path: made)
        XCTAssertEqual(read.cells, [])
        do {
            _ = try await real.notebookNew(dir: "notes", name: "First", template: nil)
            XCTFail("exists")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .exists(made))
        }
        do {
            _ = try await real.notebookRead(path: "notes/none.ipynb")
            XCTFail("missing")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .notFound("notes/none.ipynb"))
        }
    }
}
