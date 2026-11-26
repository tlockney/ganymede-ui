import XCTest

/// Opening a text file in the app's editor (#855): the request that names
/// the file's place, the endpoint it is read through, and the words a
/// machine that doesn't answer gives.
final class EditorRequestTests: XCTestCase {
    private let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"

    // MARK: the request

    func testARequestSavedByAnOlderBuildIsThisDevices() throws {
        let old = Data(#"{"path":"/a.txt"}"#.utf8)
        let request = try JSONDecoder().decode(EditorRequest.self, from: old)
        XCTAssertEqual(request.path, "/a.txt")
        XCTAssertNil(request.machine)
        XCTAssertEqual(request.id, "/a.txt")
        XCTAssertEqual(request.thisDevicePath, "/a.txt")
    }

    func testTheSamePathOnThisDeviceAndOnAMachineAreTwoFiles() throws {
        let local = EditorRequest(path: "/a.txt")
        let remote = EditorRequest(path: "/a.txt", machine: id)
        XCTAssertNotEqual(local, remote)
        XCTAssertNotEqual(local.id, remote.id)
        XCTAssertNotEqual(remote.id, EditorRequest(path: "/a.txt", machine: "other").id)
        // Only this device's file is one a folder switch of this device waits on.
        XCTAssertEqual(local.thisDevicePath, "/a.txt")
        XCTAssertNil(remote.thisDevicePath)
    }

    func testAMachinesRequestRoundTripsThroughCodable() throws {
        let remote = EditorRequest(path: "/notes/a b.txt", machine: id)
        let data = try JSONEncoder().encode(remote)
        XCTAssertEqual(try JSONDecoder().decode(EditorRequest.self, from: data), remote)
    }

    func testARequestNamesItsPlacesFile() {
        let here = EditorRequest(path: "/a.txt", place: .thisDevice)
        XCTAssertEqual(here.path, "/a.txt")
        XCTAssertNil(here.machine)
        XCTAssertEqual(here.thisDevicePath, "/a.txt")
        let there = EditorRequest(path: "/a.txt", place: .machine(id))
        XCTAssertEqual(there.path, "/a.txt")
        XCTAssertEqual(there.machine, id)
        XCTAssertNil(there.thisDevicePath)
        XCTAssertNotEqual(here, there)
    }

    // MARK: where it reads its file

    func testThisDevicesFileIsOnThisDevicesServer() throws {
        let server = try XCTUnwrap(ServerEndpoint(string: "http://127.0.0.1:8123", token: "abc"))
        let request = EditorRequest(path: "/a.txt", place: .thisDevice)
        XCTAssertNil(request.endpoint(local: nil))
        XCTAssertEqual(request.endpoint(local: server), server)
    }

    func testAMachinesFileIsOnTheAppsMountOfIt() throws {
        let server = try XCTUnwrap(ServerEndpoint(string: "http://127.0.0.1:8123", token: "abc"))
        let mounted = try XCTUnwrap(EditorRequest(path: "notes/a.txt", place: .machine(id)).endpoint(local: server))
        XCTAssertEqual(mounted.base.absoluteString, "http://127.0.0.1:8123/machines/\(id)/")
        XCTAssertEqual(mounted.token, "abc")
        XCTAssertEqual(
            mounted.request("api/contents/notes/a.txt").url?.path,
            "/machines/\(id)/api/contents/notes/a.txt")
        // The mount's root: a leading slash adds no segment.
        XCTAssertNotNil(EditorRequest(path: "/notes/a.txt", place: .machine(id)).endpoint(local: server))
        // No server, nowhere to read it.
        XCTAssertNil(EditorRequest(path: "notes/a.txt", place: .machine(id)).endpoint(local: nil))
    }

    func testAMachineIDTheAppDoesntKnowGetsNoEndpoint() throws {
        let server = try XCTUnwrap(ServerEndpoint(string: "http://127.0.0.1:8123", token: "abc"))
        // A request saved by another build can name an id `Place` refuses,
        // and the mount would be asked for a path that isn't a machine's.
        for bad in ["", "a/b", "../x", "a b", String(repeating: "x", count: 65)] {
            XCTAssertNil(EditorRequest(path: "/a.txt", machine: bad).endpoint(local: server), bad)
        }
        // Never this device's server instead, which would open a path of
        // this Mac's.
        XCTAssertNil(EditorRequest(path: "/a.txt", machine: "a/b").endpoint(local: server))
    }

    func testAMachinePathThatLeavesItsRootGetsNoEndpoint() throws {
        let server = try XCTUnwrap(ServerEndpoint(string: "http://127.0.0.1:8123", token: "abc"))
        for bad in ["a/../b", "./a", "a//b", "", "/a/../b", "a/"] {
            XCTAssertNil(EditorRequest(path: bad, place: .machine(id)).endpoint(local: server), bad)
        }
    }

    func testAMachinesFileIsReadThroughTheAppsMount() throws {
        let server = try XCTUnwrap(ServerEndpoint(string: "http://127.0.0.1:8123", token: "abc"))
        let mounted = try XCTUnwrap(server.mounted(machine: id))
        let client = TextFileClient(endpoint: mounted, path: "notes/a b.txt")
        let url = try XCTUnwrap(client.readRequest(content: true).url)
        XCTAssertEqual(url.path, "/machines/\(id)/api/contents/notes/a b.txt")
        XCTAssertEqual(url.port, 8123)
        // The app server's token, as every request to it carries it.
        XCTAssertEqual(client.readRequest(content: false).value(forHTTPHeaderField: "Authorization"), "token abc")
    }

    // MARK: what a machine that doesn't answer says

    private func failure(status: Int, body: String) throws -> TextFileClient.Failure {
        let url = try XCTUnwrap(URL(string: "http://127.0.0.1:8123/machines/\(id)/api/contents/a.txt"))
        let response = try XCTUnwrap(HTTPURLResponse(
            url: url, statusCode: status, httpVersion: nil, headerFields: nil))
        do {
            _ = try TextFileClient.snapshot(
                from: Data(body.utf8), response: response, expectingText: true)
        } catch let failure as TextFileClient.Failure {
            return failure
        }
        throw XCTSkip("a \(status) answer is not a failure")
    }

    func testAMachineThatIsNotMountedSaysSoAsTheSidebarDoes() throws {
        // The mount's 404 is JSON, as the sidebar's reads find it (#855).
        let mount = try failure(
            status: 404,
            body: #"{"message": "No machine \#(id) is mounted", "reason": null}"#)
        XCTAssertEqual(mount.status, 404)
        XCTAssertEqual(
            FileSourceError.textFileMessage(mount, machine: id, name: "m4mini"),
            "“m4mini” isn’t connected to this Mac.")
        // With the remote gone, the words still name no file: the sidebar says
        // "The machine".
        XCTAssertEqual(
            FileSourceError.textFileMessage(mount, machine: id, name: nil),
            "The machine isn’t connected to this Mac.")
    }

    func testAMachineThatDoesntAnswerSaysSoAsTheSidebarDoes() throws {
        let gateway = try failure(status: 502, body: "")
        XCTAssertEqual(
            FileSourceError.textFileMessage(gateway, machine: id, name: "m4mini"),
            "“m4mini” didn’t answer.")
        // A file that is gone is still a file that is gone.
        let gone = try failure(status: 404, body: #"{"message": "a.txt does not exist"}"#)
        XCTAssertEqual(
            FileSourceError.textFileMessage(gone, machine: id, name: "m4mini"),
            "a.txt does not exist")
        // This device's words are its own, as before.
        XCTAssertEqual(FileSourceError.textFileMessage(gone, machine: nil, name: nil), "a.txt does not exist")
    }
}

/// The app's server with a machine's mount as its root (#855).
final class ServerEndpointMountedTests: XCTestCase {
    private let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"

    func testAMachinesEndpointIsItsMountOnTheSameServer() throws {
        let server = try XCTUnwrap(ServerEndpoint(serverURL: URL(string: "http://127.0.0.1:8123/?token=abc")!))
        let mounted = try XCTUnwrap(server.mounted(machine: id))
        XCTAssertEqual(mounted.base.absoluteString, "http://127.0.0.1:8123/machines/\(id)/")
        XCTAssertEqual(mounted.token, "abc")
        // A server in a folder keeps it.
        let inFolder = try XCTUnwrap(ServerEndpoint(string: "https://example.org/jupyter", token: "t"))
        XCTAssertEqual(
            inFolder.mounted(machine: id)?.base.absoluteString,
            "https://example.org/jupyter/machines/\(id)/")
    }

    func testAMalformedMachineNeverBecomesAURL() throws {
        let server = try XCTUnwrap(ServerEndpoint(string: "http://127.0.0.1:8123", token: "abc"))
        for bad in ["", "a/b", "../x", "a b", "é", String(repeating: "x", count: 65)] {
            XCTAssertNil(server.mounted(machine: bad), bad)
        }
    }
}
