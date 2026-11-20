import XCTest

/// Connected machines as places (#701): ids and keys, what a machine's
/// window may ask the app for, its target and page, and the switcher.
final class PlaceTests: XCTestCase {
    private let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"
    private let server = URL(string: "http://127.0.0.1:8123/?token=abc")!

    private func query(_ url: URL) -> [String: String] {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
    }

    // MARK: ids and keys

    func testOnlyWellFormedMachineIDsMakeAPlace() {
        XCTAssertEqual(Place(machine: id), .machine(id))
        XCTAssertEqual(Place(machine: "a_b-9"), .machine("a_b-9"))
        XCTAssertNotNil(Place(machine: String(repeating: "x", count: 64)))
        for bad in ["", "..", "a/b", "a b", "../x", "a%2Fb", "é", String(repeating: "x", count: 65)] {
            XCTAssertNil(Place(machine: bad), bad)
        }
    }

    func testAnSSHOnlyRemoteIsNotAPlace() {
        var ssh = Remote()
        ssh.ssh = Remote.SSH(host: "box")
        XCTAssertNil(Place(remote: ssh))
        let withServer = Remote(name: "mini", serverURL: "http://mini:8888")
        XCTAssertEqual(Place(remote: withServer), .machine(withServer.id.uuidString))
    }

    func testAPlaceIsMountedOnTheAppsOwnServer() {
        XCTAssertEqual(Place.thisDevice.mountPath, "/")
        XCTAssertEqual(Place.machine("a").mountPath, "/machines/a/")
    }

    func testAPlaceRoundTripsThroughCodable() throws {
        for place in [Place.thisDevice, .machine(id)] {
            let data = try JSONEncoder().encode(place)
            XCTAssertEqual(try JSONDecoder().decode(Place.self, from: data), place)
        }
    }

    // MARK: what a window of a place gets

    func testThisDeviceGetsEverythingButTheMachineSwitcher() {
        for capability in Place.Capability.allCases where capability != .switchPlace {
            XCTAssertTrue(Place.thisDevice.allows(capability), "\(capability)")
        }
        XCTAssertFalse(Place.thisDevice.allows(.switchPlace))
    }

    func testAMachineWindowGetsNoBridgeGrantsShortcutsEditorKeysOrAppLinks() {
        let machine = Place.machine(id)
        for capability in [
            Place.Capability.deviceBridge, .openFile, .nativeChrome, .agentKeys, .personName, .appLinks,
        ] {
            XCTAssertFalse(machine.allows(capability), "\(capability)")
        }
        // Only what the machine's own page needs; a new capability must be
        // considered here.
        let allowed = Place.Capability.allCases.filter { machine.allows($0) }
        XCTAssertEqual(Set(allowed.map { "\($0)" }), ["settings", "switchPlace"])
    }

    func testTheWebViewIsMadeFromThePlacesHandlerTable() {
        let machine = Place.machine(id).handlerNames
        XCTAssertEqual(Set(machine), ["settings", "place"])
        for name in ["kernelRelay", "deviceRemote", "openFile", "state", "document", "agentKeys"] {
            XCTAssertFalse(machine.contains(name), name)
            XCTAssertTrue(Place.thisDevice.handlerNames.contains(name), name)
        }
        XCTAssertFalse(Place.thisDevice.handlerNames.contains("place"))
    }

    func testAMachinePageOpensWebLinksButNotAppLinks() throws {
        let web = try XCTUnwrap(URL(string: "https://example.com/a"))
        let app = try XCTUnwrap(URL(string: "ganymede://open?path=/a"))
        let file = try XCTUnwrap(URL(string: "file:///etc/hosts"))
        XCTAssertTrue(Place.machine(id).opensExternally(web))
        XCTAssertFalse(Place.machine(id).opensExternally(app))
        XCTAssertFalse(Place.machine(id).opensExternally(file))
        XCTAssertTrue(Place.thisDevice.opensExternally(app))
    }

    func testAMachineWindowStaysOnItsMountOrItsOwnPage() throws {
        let machine = Place.machine(id)
        func url(_ path: String) throws -> URL {
            try XCTUnwrap(URL(string: "http://127.0.0.1:8123" + path))
        }
        XCTAssertTrue(machine.allowsFollowing(try url("/machines/\(id)/files/a.png")))
        XCTAssertTrue(machine.allowsFollowing(try url("/machines/\(id)")))
        XCTAssertTrue(machine.allowsFollowing(try url("/?kernels=server&machine=\(id)&open=/a.ipynb")))
        XCTAssertFalse(machine.allowsFollowing(try url("/")))
        XCTAssertFalse(machine.allowsFollowing(try url("/?machine=other")))
        // Only the first `machine=` counts, as the page reads it.
        XCTAssertFalse(machine.allowsFollowing(try url("/?machine=&machine=\(id)")))
        XCTAssertFalse(machine.allowsFollowing(try url("/?machine=bad!&machine=\(id)")))
        XCTAssertTrue(machine.allowsFollowing(try url("/?machine=\(id)&machine=other")))
        XCTAssertFalse(machine.allowsFollowing(try url("/api/contents/")))
        XCTAssertFalse(machine.allowsFollowing(try url("/machines/other/api/status")))
        XCTAssertFalse(machine.allowsFollowing(try url("/files/secret.txt")))
        XCTAssertTrue(Place.thisDevice.allowsFollowing(try url("/api/contents/")))
    }

    func testMachineNotebooksStayOutOfNativeRecentsAndSpotlight() {
        XCTAssertTrue(Place.thisDevice.indexesLocally)
        XCTAssertFalse(Place.machine(id).indexesLocally)
    }

    // MARK: window targets

    func testAMachineTargetRoundTripsThroughSceneStorage() throws {
        let notebook = try XCTUnwrap(WindowTarget.machine(id, path: "notes//a.ipynb", isFolder: false))
        XCTAssertEqual(notebook, .machineFile(machine: id, path: "/notes/a.ipynb"))
        let folder = try XCTUnwrap(WindowTarget.machine(id, path: "", isFolder: true))
        XCTAssertEqual(folder, .machineFolder(machine: id, path: "/"))
        let local = WindowTarget.folder(URL(fileURLWithPath: "/tmp", isDirectory: true))
        for target in [notebook, folder, local] {
            let saved = WindowTarget.saved(target)
            XCTAssertFalse(saved.isEmpty)
            XCTAssertEqual(WindowTarget(saved: saved), target)
        }
        XCTAssertNil(WindowTarget.machine("../x", path: "/", isFolder: true))
    }

    func testAMachineTargetKnowsItsPlace() {
        XCTAssertEqual(WindowTarget.machine(id, path: "/a.ipynb", isFolder: false)?.place, .machine(id))
        XCTAssertEqual(WindowTarget.file(URL(fileURLWithPath: "/a.ipynb")).place, .thisDevice)
        // The same path on this device and on a machine are different targets.
        XCTAssertNotEqual(
            WindowTarget.machine(id, path: "/tmp/a.ipynb", isFolder: false),
            WindowTarget.file(URL(fileURLWithPath: "/tmp/a.ipynb")))
    }

    func testAMachinePageGetsTheMachineAndNoNativeChrome() throws {
        let target = try XCTUnwrap(WindowTarget.machine(id, path: "/notes/Io & Europa.ipynb", isFolder: false))
        let page = target.pageURL(server: server, kernels: "server", nativeChrome: true, machineName: "m4 mini")
        XCTAssertEqual(page.port, 8123)
        XCTAssertEqual(
            query(page),
            [
                "token": "abc", "kernels": "server", "open": "/notes/Io & Europa.ipynb",
                "machine": id, "machine_name": "m4 mini",
            ])
        // This device's windows still draw the native chrome.
        let local = WindowTarget.folder(URL(fileURLWithPath: "/tmp", isDirectory: true))
        XCTAssertEqual(query(local.pageURL(server: server, kernels: "server", nativeChrome: true))["chrome"], "native")
    }

    func testAMachinePageURLReadsBackAsTheSameTarget() throws {
        let file = try XCTUnwrap(WindowTarget.machine(id, path: "/a/b c.ipynb", isFolder: false))
        XCTAssertEqual(WindowTarget(page: file.pageURL(server: server, kernels: "server", machineName: "mini")), file)
        let folder = try XCTUnwrap(WindowTarget.machine(id, path: "/a", isFolder: true))
        XCTAssertEqual(WindowTarget(page: folder.pageURL(server: server, kernels: "server")), folder)
        // A machine with no folder yet: its root.
        let root = try XCTUnwrap(URL(string: "http://127.0.0.1:8123/?kernels=server&machine=\(id)"))
        XCTAssertEqual(WindowTarget(page: root), .machineFolder(machine: id, path: "/"))
    }

    func testAMalformedMachineInAPageURLIsNotAMachine() throws {
        let url = try XCTUnwrap(URL(string: "http://127.0.0.1:8123/?machine=..%2Fx&open=/a.ipynb"))
        XCTAssertEqual(WindowTarget(page: url), .file(URL(fileURLWithPath: "/a.ipynb")))
    }

    func testAMachineWindowTitleNamesTheMachine() throws {
        let notebook = try XCTUnwrap(WindowTarget.machine(id, path: "/a/Orbits.ipynb", isFolder: false))
        XCTAssertEqual(notebook.displayTitle(machineName: "m4mini"), "Orbits · m4mini")
        let root = try XCTUnwrap(WindowTarget.machine(id, path: "/", isFolder: true))
        XCTAssertEqual(root.displayTitle(machineName: "m4mini"), "m4mini")
        let folder = try XCTUnwrap(WindowTarget.machine(id, path: "/work", isFolder: true))
        XCTAssertEqual(folder.displayTitle(machineName: "m4mini"), "work · m4mini")
        let local = WindowTarget.file(URL(fileURLWithPath: "/a/Orbits.ipynb"))
        XCTAssertEqual(local.displayTitle(machineName: "m4mini"), "Orbits")
    }

    // MARK: the switcher

    func testPlacesListThisDeviceThenRemotesWithAServer() {
        let mini = Remote(name: "mini", serverURL: "http://mini:8888")
        var ssh = Remote(name: "shell")
        ssh.ssh = Remote.SSH(host: "box")
        let entries = Places.entries(remotes: [ssh, mini], thisDevice: "This Mac", mounting: true)
        XCTAssertEqual(entries.map(\.title), ["This Mac", "mini"])
        XCTAssertEqual(entries.map(\.place), [.thisDevice, .machine(mini.id.uuidString)])
    }

    func testWithoutAMountThereAreNoMachinePlaces() {
        let mini = Remote(name: "mini", serverURL: "http://mini:8888")
        XCTAssertEqual(Places.entries(remotes: [mini], thisDevice: "This Mac", mounting: false).count, 1)
    }

    func testThePageGetsNamesAndIDsOnly() throws {
        let mini = Remote(name: "mini", serverURL: "http://mini:8888/?token=secret")
        let json = Places.pageJSON(Places.entries(remotes: [mini], thisDevice: "This Mac", mounting: true))
        XCTAssertFalse(json.contains("secret"))
        XCTAssertFalse(json.contains("8888"))
        let list = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [[String: Any]])
        XCTAssertTrue(list[0]["id"] is NSNull)
        XCTAssertEqual(list[0]["name"] as? String, "This Mac")
        XCTAssertEqual(list[1]["id"] as? String, mini.id.uuidString)
    }

    // MARK: reachability

    func testReachabilityPollsThenBacksOffTo30Seconds() {
        XCTAssertEqual(ReachabilitySchedule.delay(afterFailures: 0), 15)
        XCTAssertEqual((1...8).map { ReachabilitySchedule.delay(afterFailures: $0) }, [1, 2, 4, 8, 16, 30, 30, 30])
        // A long outage doesn't overflow the shift.
        XCTAssertEqual(ReachabilitySchedule.delay(afterFailures: 10_000), 30)
    }

    func testStatusIsAskedThroughTheMount() throws {
        let url = try XCTUnwrap(PlaceReachability.statusURL(id, server: server))
        XCTAssertEqual(url.path, "/machines/\(id)/api/status")
        XCTAssertEqual(url.port, 8123)
        // The app's token rides along, as the page's first load has it.
        XCTAssertEqual(query(url)["token"], "abc")
        XCTAssertNil(PlaceReachability.statusURL("../x", server: server))
    }
}
