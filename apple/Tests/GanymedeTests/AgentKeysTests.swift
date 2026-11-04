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

    // MARK: - The Settings screen's agent (#210)

    private let answer: [String: Any] = [
        "enabled": true, "provider": "anthropic", "model": "claude-sonnet-5-5",
        "baseUrl": "http://localhost:11434/v1",
        "providers": [
            ["id": "anthropic", "name": "Anthropic", "defaultModel": "claude-sonnet-5-5", "needsKey": true],
            ["id": "local", "name": "Local server", "defaultModel": "llama3.1", "needsKey": false],
        ],
    ]

    func testReadsThePagesAgentSettings() throws {
        let panel = try XCTUnwrap(AgentPanel(body: answer))
        XCTAssertTrue(panel.enabled)
        XCTAssertEqual(panel.providers.map(\.id), ["anthropic", "local"])
        XCTAssertEqual(panel.current?.needsKey, true)
        XCTAssertNil(AgentPanel(body: nil))
        XCTAssertNil(AgentPanel(body: ["enabled": true]))
        var noProviders = answer
        noProviders["providers"] = [[String: Any]]()
        XCTAssertNil(AgentPanel(body: noProviders))
    }

    func testPicksAProviderWithItsDefaultModel() throws {
        var panel = try XCTUnwrap(AgentPanel(body: answer))
        panel.model = "claude-opus-5-5"
        panel.pick("local")
        XCTAssertEqual(panel.provider, "local")
        XCTAssertEqual(panel.model, "llama3.1")
        XCTAssertEqual(panel.current?.needsKey, false)
        // An unknown provider, or the same one, changes nothing.
        panel.model = "mistral"
        panel.pick("elsewhere")
        panel.pick("local")
        XCTAssertEqual(panel.provider, "local")
        XCTAssertEqual(panel.model, "mistral")
    }

    func testWritesTheSettingsForThePage() throws {
        let panel = try XCTUnwrap(AgentPanel(body: answer))
        let saved = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(panel.json().utf8)) as? [String: Any])
        XCTAssertEqual(Set(saved.keys), ["enabled", "provider", "model", "baseUrl"])
        XCTAssertEqual(saved["model"] as? String, "claude-sonnet-5-5")
        let test = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(panel.json(key: "sk-1").utf8)) as? [String: Any])
        XCTAssertEqual(test["key"] as? String, "sk-1")
    }
}
