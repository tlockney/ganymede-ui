import XCTest

/// A machine's files through the contents API on the app's mount (#737),
/// against a stub that records the requests.
final class MachineFileSourceTests: XCTestCase {
    private let id = "0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0"
    private let server = URL(string: "http://127.0.0.1:8123/?token=abc")!

    /// Records requests and answers each with the next canned response.
    final class Stub: @unchecked Sendable {
        private let lock = NSLock()
        private var answers: [(Int, Any?)]
        private(set) var requests: [URLRequest] = []

        init(_ answers: (Int, Any?)...) { self.answers = answers }

        func respond(_ request: URLRequest) -> (Data, URLResponse) {
            let (status, body) = lock.withLock { () -> (Int, Any?) in
                requests.append(request)
                return answers.count > 1 ? answers.removeFirst() : (answers.first ?? (200, nil))
            }
            let data = body.flatMap { try? JSONSerialization.data(withJSONObject: $0) } ?? Data()
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            return (data, response)
        }

        var last: URLRequest { lock.withLock { requests.last! } }
    }

    private func source(_ stub: Stub) -> MachineFileSource {
        MachineFileSource(id: id, server: server, send: { stub.respond($0) })
    }

    private func url(_ path: String) -> URL { FolderEntry.machineURL(id, path: path)! }

    private func query(_ request: URLRequest) -> [String: String] {
        let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
    }

    private func body(_ request: URLRequest) throws -> [String: String] {
        let data = try XCTUnwrap(request.httpBody)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
    }

    // MARK: Machine URLs

    func testMachineURLsRoundTripWithTheServerPath() throws {
        for path in ["", "moons", "moons/Io.ipynb", "Moons & rings/100% #1 ?.ipynb", "é/日本.ipynb", "runs;old/a;b.ipynb", "a+b=c,d@e:f/g$h!.txt"] {
            let u = try XCTUnwrap(FolderEntry.machineURL(id, path: path))
            XCTAssertEqual(u.scheme, "ganymede-machine")
            let location = try XCTUnwrap(FolderEntry.machineLocation(u))
            XCTAssertEqual(location.id.lowercased(), id.lowercased())
            XCTAssertEqual(location.path, path, path)
            XCTAssertEqual(FolderEntry.serverPath(u), path)
        }
        XCTAssertEqual(FolderEntry.serverPath(url("")), "", "the root")
        XCTAssertEqual(FolderEntry.serverPath(try XCTUnwrap(URL(string: "ganymede-machine://\(id)/"))), "")
        XCTAssertNil(FolderEntry.machineURL("../x", path: "a"), "a malformed id")
        XCTAssertNil(FolderEntry.machineLocation(URL(fileURLWithPath: "/tmp/a")))
        // A folder's parent, up to the root.
        XCTAssertEqual(FolderEntry.parent(of: url("a/b")), url("a"))
        XCTAssertEqual(FolderEntry.parent(of: url("a")), url(""))
        XCTAssertEqual(FolderEntry.parent(of: url("")), url(""))
    }

    func testAnEntryNamesAMachineItemLikeAFile() {
        let entry = FolderEntry(url: url("moons/Io.ipynb"), isDirectory: false)
        XCTAssertEqual(entry.name, "Io.ipynb")
        XCTAssertEqual(entry.title, "Io")
        XCTAssertTrue(entry.isNotebook)
        XCTAssertEqual(entry.serverPath, "moons/Io.ipynb")
        XCTAssertEqual(MachineFileSource(id: id, server: server).serverPath(entry.url), "moons/Io.ipynb")
    }

    // MARK: Listing

    func testListsFoldersFirstInFinderOrderWithoutHiddenItems() async throws {
        let stub = Stub((200, [
            "type": "directory", "path": "moons",
            "content": [
                ["name": "Orbit 10.ipynb", "type": "notebook", "path": "moons/Orbit 10.ipynb"],
                ["name": "Orbit 9.ipynb", "type": "notebook", "path": "moons/Orbit 9.ipynb"],
                ["name": "notes.md", "type": "file", "path": "moons/notes.md"],
                ["name": ".hidden", "type": "file", "path": "moons/.hidden"],
                ["name": ".git", "type": "directory", "path": "moons/.git"],
                ["name": "deep", "type": "directory", "path": "moons/deep"],
                ["name": "odd", "type": "mystery", "path": "moons/odd"],
            ],
        ] as [String: Any]))
        let entries = try await source(stub).list(url("moons"))
        XCTAssertEqual(entries.map(\.name), ["deep", "notes.md", "Orbit 9.ipynb", "Orbit 10.ipynb"])
        XCTAssertEqual(entries.map(\.isDirectory), [true, false, false, false])
        XCTAssertEqual(entries.map(\.serverPath), ["moons/deep", "moons/notes.md", "moons/Orbit 9.ipynb", "moons/Orbit 10.ipynb"])
        XCTAssertTrue(entries[2].isNotebook)
        XCTAssertEqual(stub.last.httpMethod, "GET")
        XCTAssertEqual(stub.last.url?.path, "/machines/\(id)/api/contents/moons")
        XCTAssertEqual(query(stub.last)["content"], "1")
        XCTAssertEqual(query(stub.last)["token"], "abc", "the server's token stays")
    }

    func testListingTheRootAsksTheContentsRoot() async throws {
        let stub = Stub((200, ["type": "directory", "path": "", "content": []] as [String: Any]))
        let entries = try await source(stub).list(url(""))
        XCTAssertTrue(entries.isEmpty)
        XCTAssertEqual(stub.last.url?.path, "/machines/\(id)/api/contents")
    }

    func testAFileIsNotAFolderListing() async {
        let stub = Stub((200, ["type": "file", "path": "a.txt"]))
        do {
            _ = try await source(stub).list(url("a.txt"))
            XCTFail("expected an error")
        } catch {
            XCTAssertTrue(error is FileSourceError)
        }
    }

    // MARK: Operations

    func testNamesThatClimbOutOfTheFolderAreDropped() async throws {
        let stub = Stub((200, [
            "type": "directory", "path": "a",
            "content": [
                ["name": "a/../../x", "type": "file", "path": "a/a/../../x"],
                ["name": "..", "type": "directory", "path": "a/.."],
                ["name": "back\\slash", "type": "file", "path": "a/back\\slash"],
                ["name": "lies", "type": "file", "path": "other/lies"],
                ["name": "ok.ipynb", "type": "notebook", "path": "a/ok.ipynb"],
                ["name": "nopath.txt", "type": "file"],
            ],
        ] as [String: Any]))
        let entries = try await source(stub).list(url("a"))
        XCTAssertEqual(entries.map(\.name), ["nopath.txt", "ok.ipynb"])
    }

    func testDotSegmentsMakeNoMachineLocation() throws {
        XCTAssertNil(FolderEntry.machineURL(id, path: "a/../b"))
        XCTAssertNil(FolderEntry.machineURL(id, path: ".."))
        XCTAssertNil(FolderEntry.machineURL(id, path: "./a"))
        XCTAssertNotNil(FolderEntry.machineURL(id, path: "a/..b/c.d"))
        let sneaky = try XCTUnwrap(URL(string: "ganymede-machine://\(id)/a/%2E%2E/b"))
        XCTAssertNil(FolderEntry.machineLocation(sneaky))
        let slash = try XCTUnwrap(URL(string: "ganymede-machine://\(id)/a%2Fb"))
        XCTAssertNil(FolderEntry.machineLocation(slash))
    }

    func testAServerPathWithDotDotIsRefused() async throws {
        let stub = Stub((201, ["path": "../x", "type": "directory"] as [String: Any]))
        do {
            _ = try await source(stub).newFolder(in: url("a"))
            XCTFail("should throw")
        } catch let error as FileSourceError {
            XCTAssertEqual(error, .badResponse("a new folder"))
        }
        XCTAssertThrowsError(try source(stub).contentsURL("a/../b"))
        XCTAssertThrowsError(try source(stub).contentsURL(".."))
        XCTAssertNoThrow(try source(stub).contentsURL("a/b"))
    }

    func testPathsAreEncodedPerSegmentAndTheTokenStays() async throws {
        let stub = Stub((200, ["type": "directory", "path": "a b", "content": []] as [String: Any]))
        _ = try await source(stub).list(url("Moons & rings/a b"))
        let raw = try XCTUnwrap(stub.last.url?.absoluteString)
        XCTAssertTrue(raw.contains("/machines/\(id)/api/contents/Moons%20%26%20rings/a%20b?"), raw)
        XCTAssertEqual(stub.last.url?.path, "/machines/\(id)/api/contents/Moons & rings/a b")
        XCTAssertEqual(query(stub.last)["token"], "abc")
    }

    func testNewFolderPostsToTheParent() async throws {
        let stub = Stub((201, ["type": "directory", "path": "moons/Untitled Folder"]))
        let made = try await source(stub).newFolder(in: url("moons"))
        XCTAssertEqual(stub.last.httpMethod, "POST")
        XCTAssertEqual(stub.last.url?.path, "/machines/\(id)/api/contents/moons")
        XCTAssertEqual(try body(stub.last), ["type": "directory"])
        XCTAssertEqual(stub.last.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(query(stub.last)["token"], "abc")
        XCTAssertEqual(made, url("moons/Untitled Folder"))
        XCTAssertEqual(FolderEntry.serverPath(made), "moons/Untitled Folder")
    }

    func testRenamePatchesThePathToTheNewName() async throws {
        let stub = Stub((200, ["path": "moons/Europa & co.ipynb", "name": "Europa & co.ipynb"]))
        let moved = try await source(stub).rename(url("moons/Io.ipynb"), to: "Europa & co.ipynb")
        XCTAssertEqual(stub.last.httpMethod, "PATCH")
        XCTAssertEqual(stub.last.url?.path, "/machines/\(id)/api/contents/moons/Io.ipynb")
        XCTAssertEqual(try body(stub.last), ["path": "moons/Europa & co.ipynb"])
        XCTAssertEqual(moved, url("moons/Europa & co.ipynb"))
    }

    func testRenameInTheRootAndBadNames() async throws {
        let stub = Stub((200, nil))
        let moved = try await source(stub).rename(url("Io.ipynb"), to: "Europa.ipynb")
        XCTAssertEqual(try body(stub.last), ["path": "Europa.ipynb"])
        XCTAssertEqual(moved, url("Europa.ipynb"), "the target when the answer has no path")
        for bad in ["", "a/b"] {
            do {
                _ = try await source(stub).rename(url("Io.ipynb"), to: bad)
                XCTFail("expected an error for \(bad)")
            } catch {
                XCTAssertEqual(error as? FileSourceError, .badName(bad))
            }
        }
        XCTAssertEqual(stub.requests.count, 1, "a bad name sends nothing")
    }

    func testDuplicatePostsCopyFromToTheParent() async throws {
        let file: (Int, Any?) = (200, ["type": "notebook", "path": "x"])
        let stub = Stub(file, (201, ["path": "moons/Io-Copy1.ipynb"]))
        let copy = try await source(stub).duplicate(url("moons/Io.ipynb"))
        XCTAssertEqual(stub.requests.first?.httpMethod, "GET")
        XCTAssertTrue(stub.requests.first?.url?.query?.contains("content=0") ?? false)
        XCTAssertEqual(stub.last.httpMethod, "POST")
        XCTAssertEqual(stub.last.url?.path, "/machines/\(id)/api/contents/moons")
        XCTAssertEqual(try body(stub.last), ["copy_from": "moons/Io.ipynb"])
        XCTAssertEqual(copy, url("moons/Io-Copy1.ipynb"))

        let again = Stub(file, (201, ["path": "Io-Copy1.ipynb"]))
        _ = try await source(again).duplicate(url("Io.ipynb"))
        XCTAssertEqual(again.last.url?.path, "/machines/\(id)/api/contents")
        XCTAssertEqual(try body(again.last), ["copy_from": "Io.ipynb"])
    }

    func testAFolderCantBeDuplicatedAndNothingIsCopied() async {
        let stub = Stub((200, ["type": "directory", "path": "moons"]))
        do {
            _ = try await source(stub).duplicate(url("moons"))
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? FileSourceError, .foldersCantBeDuplicated)
        }
        XCTAssertEqual(stub.requests.map(\.httpMethod), ["GET"], "no copy is sent")
    }

    func testDeleteSendsDeleteAndAnEmptyAnswerIsFine() async throws {
        let stub = Stub((204, nil))
        try await source(stub).delete(url("moons/Io.ipynb"))
        XCTAssertEqual(stub.last.httpMethod, "DELETE")
        XCTAssertEqual(stub.last.url?.path, "/machines/\(id)/api/contents/moons/Io.ipynb")
        XCTAssertEqual(query(stub.last)["token"], "abc")
    }

    func testReadsATextFileAndANotebooksJSON() async throws {
        let stub = Stub((200, ["type": "file", "format": "text", "content": "hello"]))
        let text = try await source(stub).readText(url("moons/notes.txt"))
        XCTAssertEqual(text, "hello")
        XCTAssertEqual(stub.last.httpMethod, "GET")
        XCTAssertEqual(query(stub.last)["content"], "1")
        XCTAssertEqual(query(stub.last)["type"], "file")
        XCTAssertEqual(query(stub.last)["format"], "text")

        let notebook: [String: Any] = ["cells": [["source": ["the Laplace resonance"]]], "nbformat": 4]
        let nb = Stub((200, ["type": "notebook", "content": notebook] as [String: Any]))
        let json = try await source(nb).readText(url("Io.ipynb"))
        XCTAssertEqual(nb.last.url?.path, "/machines/\(id)/api/contents/Io.ipynb")
        XCTAssertEqual(query(nb.last)["type"], "notebook")
        let data = Data(try XCTUnwrap(json).utf8)
        XCTAssertEqual(FileSearch.snippet(inNotebook: data, query: "laplace"), "the Laplace resonance")
    }

    // MARK: Errors

    func testAFailureCarriesTheServersMessageElseTheStatus() async {
        let stub = Stub((409, ["message": "File already exists", "reason": "x"]))
        do {
            _ = try await source(stub).newFolder(in: url(""))
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error.localizedDescription, "File already exists")
        }
        let bare = Stub((502, nil))
        do {
            try await source(bare).delete(url("a"))
            XCTFail("expected an error")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("502"), error.localizedDescription)
        }
    }

    func testAnotherMachinesURLIsRefused() async {
        let stub = Stub((200, nil))
        let other = FolderEntry.machineURL("other", path: "a")!
        for url in [other, URL(fileURLWithPath: "/tmp/a")] {
            do {
                try await source(stub).delete(url)
                XCTFail("expected an error")
            } catch {
                XCTAssertEqual(error as? FileSourceError, .notThisMachine)
            }
        }
        XCTAssertTrue(stub.requests.isEmpty)
    }

    func testAMalformedMachineIDSendsNothing() async {
        let stub = Stub((200, nil))
        let bad = MachineFileSource(id: "../x", server: server, send: { stub.respond($0) })
        do {
            _ = try await bad.list(url(""))
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? FileSourceError, .badMachine("../x"))
        }
        XCTAssertTrue(stub.requests.isEmpty)
    }

    // MARK: Removing an item (#743)

    func testAMachineDeletesForGoodAndAlwaysAsks() throws {
        let action = RemoveAction(place: .machine(id))
        XCTAssertEqual(action.menuTitle, "Delete…")
        XCTAssertEqual(action.buttonTitle, "Delete")
        let file = try XCTUnwrap(FolderEntry.machineURL(id, path: "a/Io.ipynb"))
        let q = try XCTUnwrap(action.question(for: FolderEntry(url: file, isDirectory: false), holdsOpen: false, dirty: false))
        XCTAssertEqual(q.message, "Delete “Io”?")
        XCTAssertTrue(q.detail.contains("can’t be undone"))
        let folder = try XCTUnwrap(FolderEntry.machineURL(id, path: "a"))
        let open = try XCTUnwrap(action.question(for: FolderEntry(url: folder, isDirectory: true), holdsOpen: true, dirty: true))
        XCTAssertEqual(open.message, "“a” holds the open notebook.")
        XCTAssertTrue(open.detail.contains("everything in it"))
        XCTAssertTrue(open.detail.contains("unsaved changes. Delete and close it without saving?"))
    }

    // The iPad's and iPhone's alert (#758): its local words stay, a machine's are the Mac's.
    func testTheIPadsDeleteAlertKeepsThisDevicesWordsAndUsesTheMachinesOwn() throws {
        let note = FolderEntry(url: URL(fileURLWithPath: "/tmp/Io.ipynb"), isDirectory: false)
        let local = RemoveAction.deleteAlert(place: .thisDevice, for: note, holdsOpen: true, dirty: true)
        XCTAssertEqual(local.title, "Delete “Io”?")
        XCTAssertEqual(local.message, "This can't be undone.")
        let folder = FolderEntry(url: URL(fileURLWithPath: "/tmp/data", isDirectory: true), isDirectory: true)
        XCTAssertEqual(
            RemoveAction.deleteAlert(place: .thisDevice, for: folder, holdsOpen: false, dirty: false).title,
            "Delete “data”?")

        let file = try XCTUnwrap(FolderEntry.machineURL(id, path: "a/Io.ipynb"))
        let machine = RemoveAction.deleteAlert(
            place: .machine(id), for: FolderEntry(url: file, isDirectory: false), holdsOpen: false, dirty: false)
        XCTAssertEqual(machine.title, "Delete “Io”?")
        XCTAssertEqual(machine.message, "The machine deletes it for good. This can’t be undone.")
        let dir = try XCTUnwrap(FolderEntry.machineURL(id, path: "a"))
        let open = RemoveAction.deleteAlert(
            place: .machine(id), for: FolderEntry(url: dir, isDirectory: true), holdsOpen: true, dirty: true)
        XCTAssertEqual(open.title, "“a” holds the open notebook.")
        XCTAssertTrue(open.message.contains("unsaved changes. Delete and close it without saving?"))
    }

    func testThisDeviceMovesToTheTrashAndAsksOnlyForTheOpenNotebook() throws {
        let action = RemoveAction(place: .thisDevice)
        XCTAssertEqual(action.menuTitle, "Move to Trash")
        let entry = FolderEntry(url: URL(fileURLWithPath: "/tmp/Io.ipynb"), isDirectory: false)
        XCTAssertNil(action.question(for: entry, holdsOpen: false, dirty: true))
        let q = try XCTUnwrap(action.question(for: entry, holdsOpen: true, dirty: false))
        XCTAssertEqual(q.message, "“Io” is open in this window.")
        XCTAssertEqual(q.detail, "Move it to the Trash and close it?")
    }

    // MARK: Words for a machine that doesn't answer (#753)

    func testMachineMessageSaysDidntAnswerForGatewayStatusesAndNetworkErrors() {
        for status in [502, 503, 504] {
            XCTAssertEqual(
                FileSourceError.machineMessage(FileSourceError.server(status: status, message: "Bad Gateway"), machine: "Io"),
                "“Io” didn’t answer.", "status \(status)")
        }
        for code in [URLError.Code.timedOut, .cannotConnectToHost, .networkConnectionLost, .notConnectedToInternet] {
            XCTAssertEqual(
                FileSourceError.machineMessage(URLError(code), machine: "Io"), "“Io” didn’t answer.")
        }
    }

    func testMachineMessageSaysNotConnectedForTheMountsNotMounted404() {
        let error = FileSourceError.server(status: 404, message: "No machine abc is mounted")
        XCTAssertEqual(FileSourceError.machineMessage(error, machine: "Io"), "“Io” isn’t connected to this Mac.")
    }

    func testOnlyTheMountsOwnFormIsNotMounted() {
        XCTAssertTrue(FileSourceError.isNotMounted(#"No machine "abc" is mounted"#))
        XCTAssertTrue(FileSourceError.isNotMounted("No machine abc is mounted\n"))
        XCTAssertFalse(FileSourceError.isNotMounted("no such file or directory: notes/No machine logs.ipynb"))
        XCTAssertFalse(FileSourceError.isNotMounted(nil))
        let missing = FileSourceError.server(status: 404, message: "no such file or directory: No machine logs.ipynb")
        XCTAssertEqual(
            FileSourceError.machineMessage(missing, machine: "Io"), missing.localizedDescription)
        XCTAssertTrue(FileSourceError.isNotMounted(body: Data(#"{"message":"No machine \"abc\" is mounted"}"#.utf8)))
        XCTAssertFalse(FileSourceError.isNotMounted(body: Data(#"{"message":"Not Found"}"#.utf8)))
    }

    func testAnUnnamedMachineIsPlainWords() {
        let error = FileSourceError.server(status: 502, message: nil)
        XCTAssertEqual(
            FileSourceError.message(error, place: .machine(id), machineName: nil), "The machine didn’t answer.")
    }

    func testMachineMessageKeepsOtherErrorsAsTheyAre() {
        let others: [Error] = [
            FileSourceError.server(status: 404, message: "No such file or directory"),
            FileSourceError.server(status: 404, message: nil),
            FileSourceError.server(status: 403, message: "forbidden"),
            FileSourceError.server(status: 500, message: nil),
            FileSourceError.badName("a/b"),
            FileSourceError.notThisMachine,
            URLError(.cancelled),
        ]
        for error in others {
            XCTAssertEqual(FileSourceError.machineMessage(error, machine: "Io"), error.localizedDescription)
        }
    }

    func testThisDeviceErrorsAreNotRewritten() {
        let errors: [Error] = [
            FileSourceError.server(status: 502, message: nil),
            FileSourceError.server(status: 404, message: "No machine abc is mounted"),
            URLError(.timedOut),
        ]
        for error in errors {
            XCTAssertEqual(
                FileSourceError.message(error, place: .thisDevice, machineName: nil), error.localizedDescription)
        }
        XCTAssertEqual(
            FileSourceError.message(FileSourceError.server(status: 502, message: nil), place: .machine(id), machineName: "Io"),
            "“Io” didn’t answer.")
        XCTAssertEqual(
            FileSourceError.message(URLError(.timedOut), place: .machine(id), machineName: nil),
            "The machine didn’t answer.")
    }

    func testAPlainTextNotMounted404IsToldApart() async {
        let source = MachineFileSource(id: id, server: server, send: { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!
            return (Data("No machine abc is mounted".utf8), response)
        })
        var thrown: Error?
        do { _ = try await source.list(url("/")) } catch { thrown = error }
        let message = thrown.map { FileSourceError.machineMessage($0, machine: "Io") }
        XCTAssertEqual(message, "“Io” isn’t connected to this Mac.")
    }

    func testFileChangesWaitForABusyOperationAndAnOfflineMachine() {
        let machine = Place.machine(id)
        XCTAssertTrue(FileChanges.allowed(place: machine, reachable: true, busy: false))
        XCTAssertFalse(FileChanges.allowed(place: machine, reachable: false, busy: false))
        XCTAssertFalse(FileChanges.allowed(place: machine, reachable: true, busy: true))
        XCTAssertFalse(FileChanges.allowed(place: machine, reachable: false, busy: true))
        XCTAssertTrue(FileChanges.allowed(place: .thisDevice, reachable: true, busy: false))
        XCTAssertTrue(FileChanges.allowed(place: .thisDevice, reachable: false, busy: false))
        XCTAssertFalse(FileChanges.allowed(place: .thisDevice, reachable: true, busy: true))
    }
}
