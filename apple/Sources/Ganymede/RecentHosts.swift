import Foundation

/// Server URLs the remote form saved before, most recent first, so a
/// tailnet address typed once on a phone doesn't have to be typed again.
enum RecentHosts {
    static let key = "recentServerURLs"

    /// `url` at the front of `list`, trimmed and without its query or
    /// fragment, so a pasted `?token=` isn't kept. An empty `url` changes
    /// nothing; a URL already in the list moves to the front instead of
    /// repeating.
    static func adding(_ url: String, to list: [String], limit: Int = 8) -> [String] {
        let trimmed = withoutQuery(url.trimmingCharacters(in: .whitespacesAndNewlines))
        guard !trimmed.isEmpty else { return list }
        let rest = list.filter { $0.trimmingCharacters(in: .whitespacesAndNewlines) != trimmed }
        return Array(([trimmed] + rest).prefix(limit))
    }

    /// `list` without `url` (compared after trimming): the menu leaves out
    /// the address already in the field.
    static func excluding(_ url: String, from list: [String]) -> [String] {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        return list.filter { $0 != trimmed }
    }

    /// `url` without `?…` or `#…`; unchanged when it doesn't parse.
    static func withoutQuery(_ url: String) -> String {
        guard var parts = URLComponents(string: url), parts.query != nil || parts.fragment != nil
        else { return url }
        parts.query = nil
        parts.fragment = nil
        return parts.string ?? url
    }

    static func load(_ defaults: UserDefaults = .standard) -> [String] {
        defaults.stringArray(forKey: key) ?? []
    }

    /// Records `url` as the most recent one.
    static func record(_ url: String, _ defaults: UserDefaults = .standard) {
        defaults.set(adding(url, to: load(defaults)), forKey: key)
    }
}
