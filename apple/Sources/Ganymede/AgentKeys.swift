import Foundation

/// The page's `agentKeys` messages: the optional agent's API keys, one per
/// provider, kept in the Keychain instead of the page's web storage
/// (ganymede-ui#166). The page's `KeychainCredentialStore` sends them.
struct AgentKeys {
    /// The providers the Settings sheet offers (`PROVIDERS` in
    /// packages/agent/src/settings.ts). Nothing else gets an item.
    static let providers: Set<String> = ["anthropic", "openai", "google", "local"]

    let secrets: SecretStore

    enum Failure: LocalizedError, Equatable {
        case notThePage
        case badMessage

        var errorDescription: String? {
            switch self {
            case .notThePage: return "only the app's own page may use the agent's keys"
            case .badMessage: return "not an agentKeys message"
            }
        }
    }

    /// The Keychain item holding a provider's key.
    static func account(_ provider: String) -> String { "agent-key.\(provider)" }

    /// Whether a message comes from the page the app loaded: its main
    /// frame (not an output frame) on the page's own origin. WebKit gives a
    /// default port as 0.
    static func trusted(isMainFrame: Bool, scheme: String, host: String, port: Int, page: URL?) -> Bool {
        guard isMainFrame, let page, let pageScheme = page.scheme?.lowercased(),
              let pageHost = page.host?.lowercased()
        else { return false }
        let defaultPort = pageScheme == "https" ? 443 : 80
        return scheme.lowercased() == pageScheme
            && host.lowercased() == pageHost
            && (port == 0 ? defaultPort : port) == (page.port ?? defaultPort)
    }

    /// Answers one message. `{op: "get", provider}` returns the key, or nil
    /// when there is none; `{op: "set", provider, key}` stores it (an empty
    /// key deletes it) and returns nil. Throws on anything else, or when the
    /// Keychain refuses.
    func handle(_ body: Any) throws -> String? {
        guard let fields = body as? [String: Any],
              let op = fields["op"] as? String,
              let provider = fields["provider"] as? String,
              Self.providers.contains(provider)
        else { throw Failure.badMessage }
        switch op {
        case "get":
            return secrets.get(Self.account(provider))
        case "set":
            guard let key = fields["key"] as? String else { throw Failure.badMessage }
            try secrets.set(Self.account(provider), key)
            return nil
        default:
            throw Failure.badMessage
        }
    }
}
