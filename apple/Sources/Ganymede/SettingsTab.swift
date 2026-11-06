import Foundation

/// The tabs of the app's one Settings (#332): the Mac's Settings window
/// and the iPad and iPhone's Settings screen. The page asks for one by
/// name (`settings` message, `showAppSettings` in `native.ts`) where it
/// would otherwise show a sheet of its own.
enum SettingsTab: String, CaseIterable, Identifiable {
    case general, kernels, remotes, agent, shortcuts

    var id: String { rawValue }

    /// The tab the Settings window shows, kept across launches.
    static let defaultsKey = "settingsTab"

    /// A tab the page names, or nil for anything else.
    init?(message body: Any) {
        guard let name = body as? String, let tab = SettingsTab(rawValue: name) else { return nil }
        self = tab
    }
}

extension Notification.Name {
    /// A page asked for Settings at a tab (`SettingsTab` is the userInfo's
    /// `tab`); on iOS, for the scene whose page is the object.
    static let showAppSettings = Notification.Name("GanymedeShowAppSettings")
}
