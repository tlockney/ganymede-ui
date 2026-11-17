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

/// Whether a check the person starts needs a new updater (#666). Sparkle
/// keeps an update it found for the rest of the process and shows it
/// again without reading the feed, so a release found before a newer one
/// came out would be the one installed; a new updater holds nothing.
///
/// With no session open, whatever the old updater holds may be out of
/// date. In an open session, only the update behind the toolbar button,
/// not yet downloaded, is dropped: a check, a download, a downloaded
/// update or a window the person has seen carries on.
/// `toolbarUpdateDownloaded` is nil when the toolbar shows no update.
enum UpdateCheck {
    static func startsFresh(sessionInProgress: Bool, toolbarUpdateDownloaded: Bool?) -> Bool {
        guard sessionInProgress else { return true }
        return toolbarUpdateDownloaded == false
    }
}
#endif
