import XCTest

/// Remotes in UserDefaults with tokens in a secret store, and the move from
/// the single kernel server setting.
final class RemoteStoreTests: XCTestCase {
    private final class Secrets: SecretStore {
        var items: [String: String] = [:]
        var failing = false
        func get(_ key: String) -> String? { items[key] }
        func set(_ key: String, _ value: String) throws {
            if failing && !value.isEmpty { throw CocoaError(.fileWriteUnknown) }
            items[key] = value.isEmpty ? nil : value
        }
    }

    private var suite: String!
    private var defaults: UserDefaults!
    private var secrets: Secrets!
    private var store: RemoteStore { RemoteStore(defaults: defaults, secrets: secrets) }

    override func setUp() {
        suite = "RemoteStoreTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
        secrets = Secrets()
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
    }

    func testNothingSavedLoadsNoRemotes() {
        let loaded = store.load()
        XCTAssertEqual(loaded.remotes, [])
        XCTAssertNil(loaded.kernels)
    }

    func testTheKernelServerBecomesTheKernelRemote() throws {
        defaults.set(" https://example.org:8888 ", forKey: "kernelServer")
        secrets.items["kernelServer"] = "secret"
        let loaded = store.load()
        let remote = try XCTUnwrap(loaded.remotes.first)
        XCTAssertEqual(loaded.remotes.count, 1)
        XCTAssertEqual(remote.serverURL, "https://example.org:8888")
        XCTAssertEqual(remote.title, "example.org")
        XCTAssertEqual(loaded.kernels, remote.id)
        XCTAssertEqual(store.token(for: remote.id), "secret")
        // The old items are gone, and a second load reads the new ones.
        XCTAssertNil(defaults.string(forKey: "kernelServer"))
        XCTAssertNil(secrets.items["kernelServer"])
        let again = store.load()
        XCTAssertEqual(again.remotes, loaded.remotes)
        XCTAssertEqual(again.kernels, remote.id)
    }

    func testAFailedMoveKeepsTheOldTokenInUseAndRetries() throws {
        defaults.set("https://example.org", forKey: "kernelServer")
        secrets.items["kernelServer"] = "secret"
        secrets.failing = true
        let loaded = store.load()
        let remote = try XCTUnwrap(loaded.remotes.first)
        // The remote is saved, and its token is read from the old item.
        XCTAssertEqual(store.token(for: remote.id), "secret")
        XCTAssertEqual(secrets.items["kernelServer"], "secret")
        // Saving the list (an edit that session) doesn't stop the retry.
        try store.save(loaded.remotes, kernels: nil)
        secrets.failing = false
        let again = store.load()
        XCTAssertEqual(again.remotes, loaded.remotes)
        XCTAssertEqual(secrets.items["remote.\(remote.id.uuidString)"], "secret")
        XCTAssertNil(secrets.items["kernelServer"])
        XCTAssertEqual(store.token(for: remote.id), "secret")
    }

    func testANewTokenReplacesTheOneNotYetMoved() throws {
        defaults.set("https://example.org", forKey: "kernelServer")
        secrets.items["kernelServer"] = "old"
        secrets.failing = true
        let remote = try XCTUnwrap(store.load().remotes.first)
        secrets.failing = false
        try store.setToken("new", for: remote.id)
        XCTAssertEqual(store.token(for: remote.id), "new")
        XCTAssertNil(secrets.items["kernelServer"])
        XCTAssertEqual(store.load().remotes.count, 1)
        XCTAssertEqual(store.token(for: remote.id), "new")
    }

    func testUnreadableRemotesAreKeptAside() {
        let junk = Data("not json".utf8)
        defaults.set(junk, forKey: "remotes")
        let loaded = store.load()
        XCTAssertEqual(loaded.remotes, [])
        XCTAssertNotNil(loaded.problem)
        XCTAssertEqual(defaults.data(forKey: "remotes.unreadable"), junk)
    }

    func testRemotesRoundTrip() throws {
        let both = Remote(name: "Lab", serverURL: "http://lab:8888", ssh: .init(host: "lab", user: "me", port: 2222))
        let sshOnly = Remote(ssh: .init(host: "box"))
        try store.save([both, sshOnly], kernels: both.id)
        try store.setToken("t", for: both.id)
        let loaded = store.load()
        XCTAssertEqual(loaded.remotes, [both, sshOnly])
        XCTAssertEqual(loaded.kernels, both.id)
        XCTAssertEqual(store.token(for: both.id), "t")
        XCTAssertEqual(store.token(for: sshOnly.id), "")
    }

    func testARemoteSavedByAnOlderBuildSharesItsName() throws {
        // JSON as an older build wrote it, with no `sharesName` key.
        let old = """
        [{"id":"D1A0E1C8-9B54-4A11-9DA3-2F3B8C1E0001","name":"mini","serverURL":"http://mini:8888","ssh":null}]
        """
        let decoded = try XCTUnwrap(JSONDecoder().decode([Remote].self, from: Data(old.utf8)).first)
        XCTAssertNil(decoded.sharesName)
        XCTAssertTrue(decoded.shares)
        XCTAssertTrue(Remote(name: "mini", serverURL: "http://mini:8888").shares)
        XCTAssertTrue(Remote(name: "mini", serverURL: "http://mini:8888", sharesName: true).shares)
        XCTAssertFalse(Remote(name: "mini", serverURL: "http://mini:8888", sharesName: false).shares)
        // Off round-trips through the store, and is kept across launches.
        var off = Remote(name: "mini", serverURL: "http://mini:8888")
        off.sharesName = false
        try store.save([off], kernels: nil)
        XCTAssertEqual(store.load().remotes, [off])
        XCTAssertFalse(store.load().remotes.first?.shares ?? true)
    }

    func testWhichWindowsGetTheName() {
        let on = Remote(name: "on", serverURL: "http://on:8888")
        let off = Remote(name: "off", serverURL: "http://off:8888", sharesName: false)
        let sshOnly = Remote(name: "ssh", ssh: .init(host: "box"))
        let remotes = [on, off, sshOnly]
        // This device always; a machine by its remote's setting.
        XCTAssertTrue(Remote.sharesName(for: .thisDevice, in: remotes))
        XCTAssertTrue(Remote.sharesName(for: .thisDevice, in: []))
        XCTAssertTrue(Remote.sharesName(for: .machine(on.id.uuidString), in: remotes))
        XCTAssertFalse(Remote.sharesName(for: .machine(off.id.uuidString), in: remotes))
        // A removed or unknown machine, or a remote with no server, never.
        XCTAssertFalse(Remote.sharesName(for: .machine(on.id.uuidString), in: [off]))
        XCTAssertFalse(Remote.sharesName(for: .machine(UUID().uuidString), in: remotes))
        XCTAssertFalse(Remote.sharesName(for: .machine(sshOnly.id.uuidString), in: remotes))
    }

    func testTheEditorsToggleSavesOnAsUnset() {
        XCTAssertNil(Remote.sharesNameSetting(true))
        XCTAssertEqual(Remote.sharesNameSetting(false), false)
    }

    func testARemoteSavedByAnOlderBuildDoesNotUseTheDevice() throws {
        // JSON as an older build wrote it, with no `usesDevice` key (#877):
        // it still decodes, and means off.
        let old = """
        [{"id":"D1A0E1C8-9B54-4A11-9DA3-2F3B8C1E0001","name":"mini","serverURL":"http://mini:8888","ssh":null}]
        """
        let decoded = try XCTUnwrap(JSONDecoder().decode([Remote].self, from: Data(old.utf8)).first)
        XCTAssertNil(decoded.usesDevice)
        XCTAssertFalse(decoded.letsNotebooksUseDevice)
        XCTAssertFalse(Remote(name: "mini", serverURL: "http://mini:8888").letsNotebooksUseDevice)
        // On round-trips through the store, and off is kept as no key.
        var on = Remote(name: "mini", serverURL: "http://mini:8888")
        on.usesDevice = Remote.usesDeviceSetting(true)
        try store.save([on], kernels: nil)
        XCTAssertTrue(try XCTUnwrap(store.load().remotes.first).letsNotebooksUseDevice)
    }

    func testWhichMachinesNotebooksMayUseThisDevice() {
        let on = Remote(name: "on", serverURL: "http://on:8888", usesDevice: true)
        let off = Remote(name: "off", serverURL: "http://off:8888")
        let sshOnly = Remote(name: "ssh", ssh: .init(host: "box"))
        let remotes = [on, off, sshOnly]
        // This device's own notebooks always may; a machine's by its
        // remote's setting.
        XCTAssertTrue(Remote.usesDevice(for: .thisDevice, in: remotes))
        XCTAssertTrue(Remote.usesDevice(for: .thisDevice, in: []))
        XCTAssertTrue(Remote.usesDevice(for: .machine(on.id.uuidString), in: remotes))
        XCTAssertFalse(Remote.usesDevice(for: .machine(off.id.uuidString), in: remotes))
        // A removed or unknown machine, or a remote with no server, never.
        XCTAssertFalse(Remote.usesDevice(for: .machine(on.id.uuidString), in: [off]))
        XCTAssertFalse(Remote.usesDevice(for: .machine(UUID().uuidString), in: remotes))
        XCTAssertFalse(Remote.usesDevice(for: .machine(sshOnly.id.uuidString), in: remotes))
    }

    func testTheDeviceToggleSavesOffAsUnset() {
        XCTAssertEqual(Remote.usesDeviceSetting(true), true)
        XCTAssertNil(Remote.usesDeviceSetting(false))
    }

    func testKernelsOnARemoteWithoutAServerFallBackToThisDevice() throws {
        let sshOnly = Remote(ssh: .init(host: "box"))
        try store.save([sshOnly], kernels: sshOnly.id)
        XCTAssertNil(store.load().kernels)
    }

    func testValidation() {
        XCTAssertFalse(Remote().isValid)
        XCTAssertTrue(Remote(serverURL: "https://host:8888").isValid)
        XCTAssertFalse(Remote(serverURL: "ftp://host").isValid)
        XCTAssertFalse(Remote(serverURL: "not a url").isValid)
        XCTAssertTrue(Remote(ssh: .init(host: "alias")).isValid)
        XCTAssertFalse(Remote(ssh: .init(host: " ")).isValid)
        XCTAssertFalse(Remote(ssh: .init(host: "h", port: 70000)).isValid)
        XCTAssertFalse(Remote(serverURL: "https://host", ssh: .init(host: "")).isValid)
    }

    // MARK: - Where kernels can run (#473)

    func testKernelLocationsListThisDeviceThenRemotesWithServers() {
        let server = Remote(name: "lab", serverURL: "http://lab:8888")
        let sshOnly = Remote(name: "box", ssh: .init(host: "box"))
        let both = Remote(serverURL: "https://gpu.example:8888", ssh: .init(host: "gpu"))
        let locations = KernelLocations(remotes: [server, sshOnly, both], selected: nil)
        XCTAssertEqual(locations.choices.map(\.id), [nil, server.id, both.id])
        XCTAssertEqual(locations.choices.map(\.title), [KernelLocations.thisDevice, "lab", "gpu.example"])
        XCTAssertNil(locations.selected)
        XCTAssertEqual(locations.title, KernelLocations.thisDevice)
        XCTAssertTrue(locations.hasRemotes)
    }

    func testKernelLocationsNameTheChosenRemote() {
        let server = Remote(name: "lab", serverURL: "http://lab:8888")
        let locations = KernelLocations(remotes: [server], selected: server.id)
        XCTAssertEqual(locations.selected, server.id)
        XCTAssertEqual(locations.title, "lab")
    }

    func testKernelLocationsFallBackToThisDeviceForAnUnknownOrServerlessRemote() {
        let sshOnly = Remote(name: "box", ssh: .init(host: "box"))
        for selected in [sshOnly.id, UUID()] {
            let locations = KernelLocations(remotes: [sshOnly], selected: selected)
            XCTAssertNil(locations.selected)
            XCTAssertEqual(locations.title, KernelLocations.thisDevice)
            XCTAssertFalse(locations.hasRemotes)
        }
    }
}
