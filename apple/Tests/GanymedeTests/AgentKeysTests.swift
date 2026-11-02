import XCTest

/// The agent's API keys in the app's secret store, for the page only (#166).
final class AgentKeysTests: XCTestCase {
    private final class Secrets: SecretStore {
        var items: [String: String] = [:]
        var failing = false
        func get(_ key: String) -> String? { items[key] }
        func set(_ key: String, _ value: String) throws {
            if failing && !value.isEmpty { throw CocoaError(.fileWriteUnknown) }
            items[key] = value.isEmpty ? nil : value
        }
    }

    private let page = URL(string: "http://127.0.0.1:49152/ui/?open=a.ipynb")!

    func testSetsGetsAndDeletesAKey() throws {
        let secrets = Secrets()
        let keys = AgentKeys(secrets: secrets)
        XCTAssertNil(try keys.handle(["op": "get", "provider": "anthropic"]))
        XCTAssertNil(try keys.handle(["op": "set", "provider": "anthropic", "key": "sk-ant"]))
        XCTAssertEqual(secrets.items, ["agent-key.anthropic": "sk-ant"])
        XCTAssertEqual(try keys.handle(["op": "get", "provider": "anthropic"]), "sk-ant")
        _ = try keys.handle(["op": "set", "provider": "anthropic", "key": ""])
        XCTAssertEqual(secrets.items, [:])
    }

    func testRefusesOtherProvidersAndMalformedMessages() {
        let secrets = Secrets()
        secrets.items["ssh.default"] = "private key"
        let keys = AgentKeys(secrets: secrets)
        for body: Any in [
            ["op": "get", "provider": "../ssh.default"],
            ["op": "get", "provider": "ssh.default"],
            ["op": "set", "provider": "openai"],
            ["op": "list", "provider": "openai"],
            "get",
        ] {
            XCTAssertThrowsError(try keys.handle(body)) { error in
                XCTAssertEqual(error as? AgentKeys.Failure, .badMessage)
            }
        }
    }

    func testPassesOnAKeychainFailure() {
        let secrets = Secrets()
        secrets.failing = true
        XCTAssertThrowsError(
            try AgentKeys(secrets: secrets).handle(["op": "set", "provider": "openai", "key": "sk"])
        )
    }

    func testTrustsOnlyThePagesMainFrame() {
        XCTAssertTrue(AgentKeys.trusted(isMainFrame: true, scheme: "http", host: "127.0.0.1", port: 49152, page: page))
        XCTAssertFalse(AgentKeys.trusted(isMainFrame: false, scheme: "http", host: "127.0.0.1", port: 49152, page: page))
        XCTAssertFalse(AgentKeys.trusted(isMainFrame: true, scheme: "http", host: "127.0.0.1", port: 8888, page: page))
        XCTAssertFalse(AgentKeys.trusted(isMainFrame: true, scheme: "https", host: "example.org", port: 0, page: page))
        XCTAssertFalse(AgentKeys.trusted(isMainFrame: true, scheme: "http", host: "127.0.0.1", port: 49152, page: nil))
        let https = URL(string: "https://example.org/ui/")!
        XCTAssertTrue(AgentKeys.trusted(isMainFrame: true, scheme: "https", host: "example.org", port: 0, page: https))
    }
}
