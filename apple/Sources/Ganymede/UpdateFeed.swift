#if os(macOS)
import Foundation

/// Where a build looks for updates (#411): the feed in its Info.plist,
/// when it also has the key updates must be signed with. Release builds
/// have both (`release-app.sh`); other builds have neither and don't
/// update themselves.
enum UpdateFeed {
    static func url(in info: [String: Any]) -> URL? {
        func value(_ key: String) -> String? {
            let text = (info[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return text.isEmpty ? nil : text
        }
        guard let feed = value("SUFeedURL"), value("SUPublicEDKey") != nil,
              let url = URL(string: feed), url.scheme == "https", url.host != nil
        else { return nil }
        return url
    }
}
#endif
