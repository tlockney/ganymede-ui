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

    func testThisDeviceGetsEveryCapability() {
        for capability in Place.Capability.allCases {
            XCTAssertTrue(Place.thisDevice.allows(capability), "\(capability)")
        }
    }

    func testAMachineWindowGetsNoBridgeGrantsShortcutsOrAppLinks() {
        let machine = Place.machine(id)
        for capability in [
            Place.Capability.deviceLedger, .deviceRemote, .personName, .appLinks,
        ] {
            XCTAssertFalse(machine.allows(capability), "\(capability)")
        }
        // Only what the machine's own page needs; a new capability must be
        // considered here.
        let allowed = Place.Capability.allCases.filter { machine.allows($0) }
        XCTAssertEqual(Set(allowed.map { "\($0)" }), ["settings", "nativeChrome", "agentKeys", "openFile"])
    }

    func testKernelLocationAndLocalTerminalAreThisDevicesOnly() {
        for capability in [Place.Capability.kernelLocation, .localTerminal] {
            XCTAssertTrue(Place.thisDevice.allows(capability), "\(capability)")
            XCTAssertFalse(Place.machine(id).allows(capability), "\(capability)")
        }
    }

    func testAMachineGetsThePersonsNameOnlyWhenItsRemoteSaysSo() {
        let machine = Place.machine(id)
        XCTAssertTrue(machine.allows(.personName, PlaceSettings(sharesName: true)))
        XCTAssertFalse(machine.allows(.personName, PlaceSettings(sharesName: false)))
        // Without its setting, a machine still gets no name.
        XCTAssertFalse(machine.allows(.personName))
        // This device always gets it, whatever the setting would say.
        for shares in [true, false] {
            XCTAssertTrue(Place.thisDevice.allows(.personName, PlaceSettings(sharesName: shares)))
        }
        // The setting changes nothing else: with it on, a machine gets
        // `personName` beside what it always did, no more.
        XCTAssertEqual(
            Set(Place.Capability.allCases.filter { machine.allows($0, PlaceSettings(sharesName: true)) }
                .map { "\($0)" }),
            ["settings", "nativeChrome", "agentKeys", "openFile", "personName"])
        for capability in Place.Capability.allCases where capability != .personName {
            XCTAssertEqual(
                machine.allows(capability, PlaceSettings(sharesName: true)),
                machine.allows(capability),
                "\(capability)")
        }
    }

    /// A machine's notebooks get this device's `device` API only when the
    /// machine's setting says so, and never the ledger beside it (#877).
    func testAMachineGetsDeviceRemoteOnlyWhenItsRemoteSaysSo() {
        let machine = Place.machine(id)
        XCTAssertTrue(machine.allows(.deviceRemote, PlaceSettings(usesDevice: true)))
        XCTAssertFalse(machine.allows(.deviceRemote, PlaceSettings(usesDevice: false)))
        // Off by default: without its settings, a machine gets neither half.
        XCTAssertFalse(machine.allows(.deviceRemote))
        XCTAssertFalse(machine.allows(.deviceLedger))
        // The ledger is this device's alone, whatever the setting says.
        for uses in [true, false] {
            XCTAssertFalse(machine.allows(.deviceLedger, PlaceSettings(usesDevice: uses)))
            XCTAssertTrue(Place.thisDevice.allows(.deviceLedger, PlaceSettings(usesDevice: uses)))
        }
        // This device's windows get both, whatever the setting would say.
        for uses in [true, false] {
            XCTAssertTrue(Place.thisDevice.allows(.deviceRemote, PlaceSettings(usesDevice: uses)))
        }
        // The setting changes nothing else: with it on and the name's off,
        // a machine's window gets `deviceRemote` beside what it always did,
        // no more.
        let onlyDevice = PlaceSettings(sharesName: false, usesDevice: true)
        XCTAssertEqual(
            Set(Place.Capability.allCases.filter { machine.allows($0, onlyDevice) }
                .map { "\($0)" }),
            ["settings", "nativeChrome", "agentKeys", "openFile", "deviceRemote"])
        for capability in Place.Capability.allCases where capability != .deviceRemote {
            XCTAssertEqual(
                machine.allows(capability, onlyDevice),
                machine.allows(capability),
                "\(capability)")
        }
    }

    func testNewTabOpensOnTheWindowsOwnMachineOrFolder() {
        let root = URL(fileURLWithPath: "/Users/me/notebooks", isDirectory: true)
        let folder = URL(fileURLWithPath: "/Users/me/moons", isDirectory: true)
        // A machine's window: that machine's root, never this device's folder.
        XCTAssertEqual(
            WindowTarget.newTab(place: .machine(id), folder: nil, root: root),
            .machineFolder(machine: id, path: "/"))
        XCTAssertEqual(
            WindowTarget.newTab(place: .machine(id), folder: folder, root: root),
            .machineFolder(machine: id, path: "/"))
        XCTAssertEqual(WindowTarget.newTab(place: .thisDevice, folder: folder, root: root), .folder(folder))
        XCTAssertEqual(WindowTarget.newTab(place: .thisDevice, folder: nil, root: root), .folder(root))
        XCTAssertEqual(WindowTarget.newTab(place: nil, folder: nil, root: root), .folder(root))
        // A machine target keeps its place, so the new window loads that machine.
        XCTAssertEqual(
            WindowTarget.newTab(place: .machine(id), folder: nil, root: root).place, .machine(id))
    }

    func testANewWindowShowsItsValueElseTheRequestElseTheRoot() {
        let root = URL(fileURLWithPath: "/Users/me/notebooks", isDirectory: true)
        let machine = WindowTarget.machineFolder(machine: id, path: "/")
        let file = WindowTarget.file(URL(fileURLWithPath: "/Users/me/a.ipynb"))
        XCTAssertEqual(WindowTarget.opening(nil, requested: machine, root: root), machine)
        XCTAssertEqual(WindowTarget.opening(file, requested: machine, root: root), file)
        XCTAssertEqual(WindowTarget.opening(nil, requested: nil, root: root), .folder(root))
    }

    func testTheWebViewIsMadeFromThePlacesHandlerTable() {
        // Off, a machine's page has no bridge of this device's (#877).
        let off = Place.machine(id).handlerNames(PlaceSettings())
        // The native window reads a machine's page through `state` and `document` (#740).
        // The agent's keys too, from the Keychain (#849), and its files through
        // the app's editor (#855).
        XCTAssertEqual(off.count, 5)
        XCTAssertEqual(Set(off), ["settings", "state", "document", "agentKeys", "openFile"])
        for name in ["kernelRelay", "deviceRemote"] {
            XCTAssertFalse(off.contains(name), name)
            XCTAssertTrue(Place.thisDevice.handlerNames(PlaceSettings()).contains(name), name)
        }
        // On, the remote handler alone is added: a machine's window never
        // registers the ledger's (#877).
        let on = Place.machine(id).handlerNames(PlaceSettings(usesDevice: true))
        XCTAssertEqual(on.count, 6)
        XCTAssertTrue(on.contains("deviceRemote"))
        XCTAssertFalse(on.contains("kernelRelay"))
        for name in ["openFile", "state", "document", "agentKeys"] {
            XCTAssertTrue(Place.thisDevice.handlerNames(PlaceSettings()).contains(name), name)
        }
        // This device's table is the same with either setting.
        for uses in [true, false] {
            XCTAssertEqual(
                Place.thisDevice.handlerNames(PlaceSettings(usesDevice: uses)),
                ["kernelRelay", "deviceRemote", "openFile", "state", "document", "agentKeys", "settings"])
        }
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

    // MARK: app links (#868)

    private func link(_ text: String) throws -> URL {
        try XCTUnwrap(URL(string: text), text)
    }

    func testAMachineOpensALinksNotebookOnTheMachine() throws {
        let machine = Place.machine(id)
        XCTAssertEqual(
            machine.machineLink(try link("ganymede://open?path=a/b.ipynb")),
            .open(path: "a/b.ipynb")
        )
        XCTAssertEqual(
            machine.machineLink(try link("ganymede://open?path=notes.ipynb")),
            .open(path: "notes.ipynb")
        )
        // A percent-encoded path is read as the path it spells.
        XCTAssertEqual(
            machine.machineLink(try link("ganymede://open?path=a%2Fb%20c.ipynb")),
            .open(path: "a/b c.ipynb")
        )
    }

    func testAMachineKeepsWebLinksAndThisDevicesAppLinks() throws {
        let machine = Place.machine(id)
        XCTAssertEqual(machine.machineLink(try link("https://example.com/a")), .notApp)
        XCTAssertEqual(machine.machineLink(try link("file:///etc/hosts")), .notApp)
        // Not a machine's link: this device's app links are `AppURL`'s.
        XCTAssertEqual(
            Place.thisDevice.machineLink(try link("ganymede://open?path=a.ipynb")),
            .notApp
        )
    }

    func testAMachineRefusesPathsOutsideItsRoot() throws {
        let machine = Place.machine(id)
        for path in [
            "/a.ipynb", "~/a.ipynb", "~",
            "a/../b.ipynb", "a/./b.ipynb", "a//b.ipynb", "a/",
        ] {
            let encoded = path.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? path
            XCTAssertEqual(machine.machineLink(try link("ganymede://open?path=" + encoded)), .refused, path)
        }
        // Empty and missing paths name no notebook.
        XCTAssertEqual(machine.machineLink(try link("ganymede://open?path=")), .refused)
        XCTAssertEqual(machine.machineLink(try link("ganymede://open")), .refused)
    }

    func testAMachineRefusesAppLinksThatActOnThisDevice() throws {
        let machine = Place.machine(id)
        for text in [
            "ganymede://run?path=a.ipynb",
            "ganymede://new?dir=a",
            "ganymede://open?folder=work&file=a.ipynb",
            "ganymede://x-callback-url/open?path=a.ipynb&x-success=shortcuts://x",
            "ganymede://open?path=a.ipynb&x-success=shortcuts://x",
            "ganymede://device-callback/run?path=a",
            "ganymede://nope",
            "ganymede://",
        ] {
            XCTAssertEqual(machine.machineLink(try link(text)), .refused, text)
        }
    }

    // MARK: what a link in a window does (#868)

    func testAMachinesAppLinkIsFollowedOnlyWhenClicked() throws {
        let machine = Place.machine(id)
        let open = try link("ganymede://open?path=a.ipynb")
        XCTAssertEqual(machine.linkAction(for: open, clicked: true), .openOnMachine(path: "a.ipynb"))
        // A script's navigation, or a frame's: dropped without a word, so
        // an output can't make the window follow it or show the notice.
        XCTAssertEqual(machine.linkAction(for: open, clicked: false), .cancel)
        XCTAssertEqual(
            machine.linkAction(for: try link("ganymede://run?path=a.ipynb"), clicked: true), .refuse)
        XCTAssertEqual(
            machine.linkAction(for: try link("ganymede://run?path=a.ipynb"), clicked: false), .cancel)
        XCTAssertEqual(
            machine.linkAction(for: try link("ganymede://open?path=/etc/hosts"), clicked: true),
            .refuse)
    }

    func testAMachinesOtherLinksAreAsTheyWere() throws {
        let machine = Place.machine(id)
        let web = try link("https://example.com/a")
        // A clicked web link goes to the browser; one nothing clicked is
        // still a navigation the window loads.
        XCTAssertEqual(machine.linkAction(for: web, clicked: true), .openExternally)
        XCTAssertEqual(machine.linkAction(for: web, clicked: false), .allow)
        // A file link is neither, and nothing acts on this Mac.
        XCTAssertEqual(machine.linkAction(for: try link("file:///etc/hosts"), clicked: true), .cancel)
    }

    func testThisDevicesLinksAreUnchanged() throws {
        let device = Place.thisDevice
        for text in ["ganymede://open?path=/a.ipynb", "https://example.com/a"] {
            XCTAssertEqual(device.linkAction(for: try link(text), clicked: true), .openExternally, text)
            // A navigation nothing clicked loads here, as it did.
            XCTAssertEqual(device.linkAction(for: try link(text), clicked: false), .allow, text)
        }
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

    func testAWindowLoadsOnlyItsOwnPlacesPages() throws {
        func url(_ path: String) throws -> URL {
            try XCTUnwrap(URL(string: "http://127.0.0.1:8123" + path))
        }
        for path in ["/", "/?open=/a.ipynb", "/api/contents/", "/?machine=bad!"] {
            XCTAssertTrue(Place.thisDevice.allowsLoading(try url(path)), path)
        }
        for path in [
            "/?machine=\(id)", "/index.html?machine=\(id)",
            "/x/y.html?kernels=server&machine=\(id)",
        ] {
            XCTAssertFalse(Place.thisDevice.allowsLoading(try url(path)), path)
        }
        let machine = Place.machine(id)
        for path in ["/?kernels=server&machine=\(id)&open=/a.ipynb", "/machines/\(id)/files/a.png"] {
            XCTAssertTrue(machine.allowsLoading(try url(path)), path)
        }
        for path in [
            "/?machine=other1", "/index.html?machine=other1",
            "/machines/\(id)/index.html?machine=other1", "/", "/files/secret.txt",
        ] {
            XCTAssertFalse(machine.allowsLoading(try url(path)), path)
        }
        // The first `machine=` is the page's, as the page reads it.
        XCTAssertEqual(Place.shown(by: try url("/?machine=\(id)&machine=other1")), .machine(id))
        XCTAssertEqual(Place.shown(by: try url("/index.html?machine=\(id)")), .machine(id))
        XCTAssertEqual(Place.shown(by: try url("/?open=/a.ipynb")), .thisDevice)
        XCTAssertEqual(Place.shown(by: try url("/?machine=bad!")), .thisDevice)
    }

    func testMachineNotebooksStayOutOfNativeRecentsAndSpotlight() {
        XCTAssertTrue(Place.thisDevice.indexesLocally)
        XCTAssertFalse(Place.machine(id).indexesLocally)
        XCTAssertTrue(Place.thisDevice.isThisDevice)
        XCTAssertFalse(Place.machine(id).isThisDevice)
    }

    // MARK: terminals (#858)

    func testAWindowsTerminalStartsInItsNotebooksFolderElseTheWindows() {
        let mini = Remote(name: "mini", serverURL: "http://mini:8888")
        let remotes = [mini]
        let machine = Place.machine(mini.id.uuidString)
        // A machine's window runs its terminal on the machine, in the folder
        // of the notebook it shows, which the machine's server resolves
        // against its root.
        for notebook in ["a/b/nb.ipynb", "/a/b/nb.ipynb"] {
            XCTAssertEqual(
                machine.terminalTarget(notebook: notebook, fallbackFolder: "x", remotes: remotes),
                .server(mini.id, folder: "a/b"), notebook)
        }
        // With no notebook open, the folder the window is on.
        XCTAssertEqual(
            machine.terminalTarget(notebook: nil, fallbackFolder: "x", remotes: remotes),
            .server(mini.id, folder: "x"))
        // A notebook at the machine's root, and a window on the root: the
        // root itself.
        XCTAssertEqual(
            machine.terminalTarget(notebook: "nb.ipynb", fallbackFolder: "x", remotes: remotes),
            .server(mini.id))
        XCTAssertEqual(
            machine.terminalTarget(notebook: nil, fallbackFolder: "", remotes: remotes),
            .server(mini.id))
        // This device's window still has a shell of its own, here and on this
        // Mac's disk, whose paths start at `/`. A window on the root starts
        // there, as before: not in the app's own folder.
        XCTAssertEqual(
            Place.thisDevice.terminalTarget(notebook: "Users/me/nb.ipynb", fallbackFolder: "", remotes: remotes),
            .local(folder: URL(fileURLWithPath: "/Users/me", isDirectory: true)))
        XCTAssertEqual(
            Place.thisDevice.terminalTarget(notebook: nil, fallbackFolder: "Users/me/notes", remotes: remotes),
            .local(folder: URL(fileURLWithPath: "/Users/me/notes", isDirectory: true)))
        XCTAssertEqual(
            Place.thisDevice.terminalTarget(notebook: "nb.ipynb", fallbackFolder: "", remotes: remotes),
            .local(folder: URL(fileURLWithPath: "/", isDirectory: true)))
        XCTAssertEqual(
            Place.thisDevice.terminalTarget(notebook: nil, fallbackFolder: "", remotes: remotes),
            .local(folder: URL(fileURLWithPath: "/", isDirectory: true)))
    }

    func testAMachinesTerminalNeedsItsRemoteAndItsServer() {
        let mini = Remote(name: "mini", serverURL: "http://mini:8888")
        var shell = Remote(name: "shell")
        shell.ssh = Remote.SSH(host: "box")
        // The remote was removed, or saved again with SSH only: there is
        // nowhere on it to run a terminal.
        XCTAssertNil(Place.machine(mini.id.uuidString).terminalTarget(notebook: nil, fallbackFolder: "notes", remotes: []))
        XCTAssertNil(Place.machine(mini.id.uuidString).terminalTarget(notebook: nil, fallbackFolder: "", remotes: [shell]))
        // Another machine's terminal is not this one's, whatever it offers.
        XCTAssertNil(Place.machine(mini.id.uuidString).terminalTarget(
            notebook: nil, fallbackFolder: "", remotes: [shell, Remote(serverURL: "http://other:8888")]))
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

    func testAMachinePageGetsTheMachineAndNativeChrome() throws {
        let target = try XCTUnwrap(WindowTarget.machine(id, path: "/notes/Io & Europa.ipynb", isFolder: false))
        let page = target.pageURL(server: server, kernels: "server", nativeChrome: true, machineName: "m4 mini")
        XCTAssertEqual(page.port, 8123)
        XCTAssertEqual(
            query(page),
            [
                "token": "abc", "kernels": "server", "open": "/notes/Io & Europa.ipynb",
                "machine": id, "machine_name": "m4 mini", "chrome": "native",
            ])
        // Without it the page draws its own chrome.
        XCTAssertNil(query(target.pageURL(server: server, kernels: "server", machineName: "m"))["chrome"])
        // This device's windows draw the native chrome too.
        let local = WindowTarget.folder(URL(fileURLWithPath: "/tmp", isDirectory: true))
        XCTAssertEqual(query(local.pageURL(server: server, kernels: "server", nativeChrome: true))["chrome"], "native")
    }

    func testEveryPlaceDrawsNativeChromeOnTheMacAndWhereTheIOSIdiomDoes() {
        for place in [Place.thisDevice, .machine(id)] {
            XCTAssertTrue(place.drawsNativeChrome(onMac: true, iosDraws: false), "\(place)")
            XCTAssertTrue(place.drawsNativeChrome(onMac: false, iosDraws: true), "\(place) on the iPad or iPhone")
            XCTAssertFalse(place.drawsNativeChrome(onMac: false, iosDraws: false), "\(place)")
        }
    }

    func testAMachineTargetsFolderIsItsLocationNotAFileURL() throws {
        let notebook = try XCTUnwrap(WindowTarget.machine(id, path: "/a b/Io.ipynb", isFolder: false))
        XCTAssertEqual(notebook.folder, FolderEntry.machineURL(id, path: "a b"))
        XCTAssertFalse(notebook.folder.isFileURL)
        let root = try XCTUnwrap(WindowTarget.machine(id, path: "/", isFolder: true))
        XCTAssertEqual(root.folder, FolderEntry.machineURL(id, path: ""))
        let inFolder = try XCTUnwrap(WindowTarget.machine(id, path: "/work/x", isFolder: true))
        XCTAssertEqual(FolderEntry.serverPath(inFolder.folder), "work/x")
        // A malformed id never becomes a location on this device.
        let bad = WindowTarget.machineFolder(machine: "../x", path: "/tmp")
        XCTAssertFalse(bad.folder.isFileURL)
        XCTAssertNil(FolderEntry.machineLocation(bad.folder))
    }

    func testAMachineWindowsSavedStateRoundTripsWithItsSidebar() throws {
        let target = try XCTUnwrap(WindowTarget.machine(id, path: "/a b/Io.ipynb", isFolder: false))
        XCTAssertEqual(WindowTarget(saved: WindowTarget.saved(target)), target)
        let sidebar = try XCTUnwrap(FolderEntry.machineURL(id, path: "a b/c;d"))
        let key = FolderEntry.storageKey(sidebar)
        XCTAssertEqual(FolderEntry.location(storageKey: key), sidebar)
        XCTAssertTrue(FolderEntry.isLocation(sidebar, in: .machine(id)))
        XCTAssertFalse(FolderEntry.isLocation(sidebar, in: .thisDevice))
        XCTAssertFalse(FolderEntry.isLocation(sidebar, in: .machine("other")))
        // Case of the id isn't relied on.
        XCTAssertTrue(FolderEntry.isLocation(sidebar, in: .machine(id.lowercased())))
        // This device keeps what was saved before: a path.
        let local = URL(fileURLWithPath: "/Users/me/notes", isDirectory: true)
        XCTAssertEqual(FolderEntry.storageKey(local), "/Users/me/notes")
        XCTAssertEqual(FolderEntry.location(storageKey: "/Users/me/notes"), local)
        XCTAssertTrue(FolderEntry.isLocation(local, in: .thisDevice))
        XCTAssertFalse(FolderEntry.isLocation(local, in: .machine(id)))
        XCTAssertNil(FolderEntry.location(storageKey: ""))
        XCTAssertNil(FolderEntry.location(storageKey: "ganymede-machine://../x/a"))
    }

    func testTheSameFolderOnThisMacAndAMachineAreExpandedApart() throws {
        let local = URL(fileURLWithPath: "/work", isDirectory: true)
        let remote = try XCTUnwrap(FolderEntry.machineURL(id, path: "work"))
        XCTAssertNotEqual(FolderEntry.storageKey(local), FolderEntry.storageKey(remote))
        let stored = FolderEntry.expandedPaths("", setting: FolderEntry.storageKey(remote), to: true)
        XCTAssertFalse(FolderEntry.expandedPaths(stored).contains(FolderEntry.storageKey(local)))
    }

    func testOpeningAMachinesItemOpensItsTarget() throws {
        let notebook = FolderEntry(url: try XCTUnwrap(FolderEntry.machineURL(id, path: "a b/Io.ipynb")), isDirectory: false)
        XCTAssertEqual(WindowTarget(opening: notebook), .machineFile(machine: id, path: "/a b/Io.ipynb"))
        let folder = FolderEntry(url: try XCTUnwrap(FolderEntry.machineURL(id, path: "work")), isDirectory: true)
        XCTAssertEqual(WindowTarget(opening: folder), .machineFolder(machine: id, path: "/work"))
        // A machine URL with a bad id opens nothing, never a local path.
        let bad = try XCTUnwrap(URL(string: "ganymede-machine://bad!/tmp"))
        XCTAssertNil(WindowTarget(opening: FolderEntry(url: bad, isDirectory: true)))
    }

    func testAMachineTargetNeverHasADotSegment() {
        for bad in ["../x", "a/../../b", "./a", "a/%2e%2E/b", "a\\..\\b"] {
            XCTAssertNil(WindowTarget.machine(id, path: bad, isFolder: false), bad)
            XCTAssertNil(WindowTarget.machine(id, path: bad, isFolder: true), bad)
        }
        XCTAssertNotNil(WindowTarget.machine(id, path: "a/..b/.c", isFolder: false))
    }

    func testThePlaceMenuOpensEachPlacesRoot() {
        let device = URL(fileURLWithPath: "/Users/me", isDirectory: true)
        XCTAssertEqual(WindowTarget.root(of: .thisDevice, device: device), .folder(device))
        XCTAssertEqual(WindowTarget.root(of: .machine(id), device: device), .machineFolder(machine: id, path: "/"))
        XCTAssertNil(WindowTarget.root(of: .machine("../x"), device: device))
    }

    /// The subtitle is the save state alone (#867): where it runs and the
    /// kernel are the toolbar's chip.
    func testAWindowSubtitleIsTheSaveStateOrWhereTheMachineIs() {
        var header = HeaderStatus(
            savedOn: "mini", runsOn: "mini", dirty: false, locked: false,
            kernel: "Python 3", kernelMissing: false, status: "busy")
        XCTAssertEqual(WindowTarget.subtitle(header: header, machineName: "mini"), "Saved on mini")
        header.dirty = true
        XCTAssertEqual(WindowTarget.subtitle(header: header, machineName: "mini"), "Edited")
        header.locked = true
        XCTAssertEqual(
            WindowTarget.subtitle(header: header, machineName: "mini"), "Edited · Locked: changed on disk")
        header.dirty = false
        XCTAssertEqual(
            WindowTarget.subtitle(header: header, machineName: "mini"), "Locked: changed on disk")
        // Without a notebook, a machine's window says where it is.
        XCTAssertEqual(WindowTarget.subtitle(header: nil, machineName: "mini"), "on mini")
        XCTAssertEqual(WindowTarget.subtitle(header: nil, machineName: ""), "")
        XCTAssertEqual(WindowTarget.subtitle(header: nil, machineName: nil), "")
    }

    func testNotebooksDataAndTextFilesOpenInAMachineWindow() throws {
        let note = FolderEntry(url: try XCTUnwrap(FolderEntry.machineURL(id, path: "a.ipynb")), isDirectory: false)
        let data = FolderEntry(url: try XCTUnwrap(FolderEntry.machineURL(id, path: "a.csv")), isDirectory: false)
        let text = FolderEntry(url: try XCTUnwrap(FolderEntry.machineURL(id, path: "a.py")), isDirectory: false)
        // A machine's text file opens in the app's editor through its mount (#855).
        for entry in [note, data, text] { XCTAssertTrue(entry.canOpen(in: .machine(id))) }
        XCTAssertTrue(text.canOpen(in: .thisDevice))
    }

    func testSearchResultsAreRelativeToTheWindowsFolderOnAMachineToo() throws {
        let root = try XCTUnwrap(FolderEntry.machineURL(id, path: ""))
        let work = try XCTUnwrap(FolderEntry.machineURL(id, path: "work"))
        func item(_ path: String) throws -> URL { try XCTUnwrap(FolderEntry.machineURL(id, path: path)) }
        XCTAssertEqual(FileSearch.relativeFolder(of: try item("a.ipynb"), in: root), "/")
        XCTAssertEqual(FileSearch.relativeFolder(of: try item("work/a.ipynb"), in: work), "work")
        XCTAssertEqual(FileSearch.relativeFolder(of: try item("work/x/y/a.ipynb"), in: work), "work/x/y")
        XCTAssertEqual(FileSearch.relativeFolder(of: try item("other/a.ipynb"), in: work), "/other")
        // This device, as before.
        let base = URL(fileURLWithPath: "/Users/me/work", isDirectory: true)
        XCTAssertEqual(FileSearch.relativeFolder(of: URL(fileURLWithPath: "/Users/me/work/a.ipynb"), in: base), "work")
        XCTAssertEqual(FileSearch.relativeFolder(of: URL(fileURLWithPath: "/Users/me/work/x/a.ipynb"), in: base), "work/x")
        XCTAssertEqual(FileSearch.relativeFolder(of: URL(fileURLWithPath: "/Users/you/a.ipynb"), in: base), "/Users/you")
    }

    func testAMachinesDocumentIsNeverAFileOnThisMac() throws {
        let body: [String: Any] = ["path": "notes/Io.ipynb", "dirty": true]
        let message = try XCTUnwrap(DocumentMessage(body: body, place: .machine(id)))
        XCTAssertEqual(message.file, FolderEntry.machineURL(id, path: "notes/Io.ipynb"))
        XCTAssertEqual(message.file?.isFileURL, false)
        XCTAssertTrue(message.isNotebook)
        XCTAssertEqual(message.file?.deletingPathExtension().lastPathComponent, "Io")
        XCTAssertNil(DocumentMessage(body: ["path": "a.ipynb", "dirty": false], place: .machine("../x"))?.file)
        XCTAssertEqual(DocumentMessage(body: body)?.file, URL(fileURLWithPath: "/notes/Io.ipynb"))
    }

    @MainActor
    func testAMachineTabShowsANotebookBeforeThePageReports() throws {
        let state = PageState()
        func shows(_ target: WindowTarget) -> Bool {
            InspectorController.showsNotebook(state: state, pageReported: false, target: target)
        }
        XCTAssertTrue(shows(.machineFile(machine: id, path: "/a.ipynb")))
        XCTAssertFalse(shows(.machineFile(machine: id, path: "/a.csv")))
        XCTAssertFalse(shows(.machineFolder(machine: id, path: "/")))
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
