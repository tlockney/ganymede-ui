import XCTest

/// Remotes in UserDefaults with tokens in a secret store, and the move from
/// the single kernel server setting.
final class RemoteStoreTests: XCTestCase {
    private final class Secrets: SecretStore {
        var items: [String: String] = [:]
        var failing = false
        func get(_ key: String) -> String? { items[key] }
        func set(_ key: String, _ value: String) throws {
            if failing { throw CocoaError(.fileWriteUnknown) }
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

    func testAFailedMoveKeepsTheOldSetting() {
        defaults.set("https://example.org", forKey: "kernelServer")
        secrets.items["kernelServer"] = "secret"
        secrets.failing = true
        let loaded = store.load()
        XCTAssertEqual(loaded.remotes.count, 1)
        XCTAssertEqual(defaults.string(forKey: "kernelServer"), "https://example.org")
        XCTAssertEqual(secrets.items["kernelServer"], "secret")
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
}
