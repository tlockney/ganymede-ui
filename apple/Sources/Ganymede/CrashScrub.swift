import Foundation

/// What may leave the app in a crash report (#318, tlockney/ganymede#384),
/// without Sentry, so the tests cover it.
enum CrashScrub {
    /// Longest message sent: a long one is more likely to quote content.
    static let maxMessage = 300

    /// `text` with home directories as `~`, URLs cut to their path (no
    /// scheme, host, port, query or fragment), and cut to `maxMessage`.
    static func text(_ text: String) -> String {
        var out = text
        let rules: [(String, String)] = [
            (#"\b(?:https?|wss?|file)://[^\s/'"`)]*([^\s?#'"`)]*)(?:[?#][^\s'"`)]*)?"#, "$1"),
            (#"(?:/private)?/var/mobile/Containers/Data/Application/[0-9A-Fa-f-]+"#, "~"),
            (#"/Users/[^/\s'"`)]+"#, "~"),
        ]
        for (pattern, template) in rules {
            out = out.replacingOccurrences(of: pattern, with: template, options: .regularExpression)
        }
        if out.count > maxMessage {
            out = String(out.prefix(maxMessage)) + "…"
        }
        return out
    }

    /// The contexts kept, and of each the keys: OS, device model and
    /// architecture, the app's version. No names, memory or storage.
    static let contexts: [String: Set<String>] = [
        "os": ["name", "version", "build", "kernel_version", "rooted"],
        "device": ["family", "model", "model_id", "arch", "simulator"],
        "app": ["app_version", "app_build", "app_identifier", "build_type"],
    ]

    static func context(_ context: [String: [String: Any]]?) -> [String: [String: Any]]? {
        guard let context else { return nil }
        var out: [String: [String: Any]] = [:]
        for (name, keys) in contexts {
            guard let values = context[name] else { continue }
            out[name] = values.filter { keys.contains($0.key) }
        }
        return out
    }
}
