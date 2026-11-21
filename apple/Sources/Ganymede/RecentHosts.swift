import Foundation

/// Server URLs the remote form saved before, most recent first, so a
/// tailnet address typed once on a phone doesn't have to be typed again.
enum RecentHosts {
    static let key = "recentServerURLs"

    /// `url` at the front of `list` in its `normalized` form, so a pasted
    /// `?token=` isn't kept and `https://a.ts.net` and `https://a.ts.net/`
    /// are one entry. An empty `url` changes nothing; an entry that
    /// normalizes to the same URL moves to the front instead of repeating.
    static func adding(_ url: String, to list: [String], limit: Int = 8) -> [String] {
        let new = normalized(url)
        guard !new.isEmpty else { return list }
        let rest = list.filter { normalized($0) != new }
        return Array(([new] + rest).prefix(limit))
    }

    /// `list` without the entries that name the same server as `url`
    /// (`sameServer`): the menu leaves out the address already in the
    /// field, even when the field carries a `?token=` or no trailing `/`.
    static func excluding(_ url: String, from list: [String]) -> [String] {
        list.filter { !sameServer($0, url) }
    }

    /// `url` trimmed, without its query, fragment or credentials, with a
    /// lowercase scheme and host, and with a path that ends in `/` (as
    /// `ServerEndpoint` takes it), when it is a URL with a scheme and a
    /// host. A string that doesn't parse as such a URL is only trimmed.
    static func normalized(_ url: String) -> String {
        let trimmed = withoutQuery(url.trimmingCharacters(in: .whitespacesAndNewlines))
        guard var parts = URLComponents(string: trimmed),
              let scheme = parts.scheme, let host = parts.host, !host.isEmpty
        else { return trimmed }
        parts.scheme = scheme.lowercased()
        // An IPv6 literal is left as typed: setting it back could lose its
        // brackets. Its case then only makes two entries, never a match.
        if !host.contains(":") { parts.host = host.lowercased() }
        // A pasted `user:password@` isn't kept or shown either.
        parts.user = nil
        parts.password = nil
        if !parts.percentEncodedPath.hasSuffix("/") { parts.percentEncodedPath += "/" }
        return parts.string ?? trimmed
    }

    /// Whether `a` and `b` are the same address once `normalized`. The
    /// form's field and a saved or offered URL then name the same server,
    /// so its token stays.
    static func sameServer(_ a: String, _ b: String) -> Bool {
        normalized(a) == normalized(b)
    }

    /// The token the form keeps when `picked` (from the Recent or Tailnet
    /// Device menu) replaces `field`: kept for the same server, cleared
    /// for another, since another server's token isn't for it.
    static func tokenAfterPicking(_ picked: String, field: String, token: String) -> String {
        sameServer(picked, field) ? token : ""
    }

    /// `url` without `?…` or `#…`; unchanged when it doesn't parse.
    static func withoutQuery(_ url: String) -> String {
        guard var parts = URLComponents(string: url), parts.query != nil || parts.fragment != nil
        else { return url }
        parts.query = nil
        parts.fragment = nil
        return parts.string ?? url
    }

    /// The stored list, normalized and without repeats, most recent
    /// first: entries saved by an older build may still carry a
    /// `user:password@` or name one server twice.
    static func load(_ defaults: UserDefaults = .standard) -> [String] {
        let stored = defaults.stringArray(forKey: key) ?? []
        return stored.reversed().reduce(into: [String]()) { list, url in
            list = adding(url, to: list, limit: max(stored.count, 1))
        }
    }

    /// Records `url` as the most recent one.
    static func record(_ url: String, _ defaults: UserDefaults = .standard) {
        defaults.set(adding(url, to: load(defaults)), forKey: key)
    }
}
