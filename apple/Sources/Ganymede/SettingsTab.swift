import Foundation

/// The tabs of the app's one Settings (#332): the Mac's Settings window
/// and the iPad and iPhone's Settings screen. The page asks for one by
/// name (`settings` message, `showAppSettings` in `native.ts`) where it
/// would otherwise show a sheet of its own.
enum SettingsTab: String, CaseIterable, Identifiable {
    case general, appearance, kernels, remotes, agent, shortcuts, device, developer

    var id: String { rawValue }

    /// The tab the Settings window shows, kept across launches.
    static let defaultsKey = "settingsTab"

    /// Whether Settings shows the Developer tab (General's "Show Developer
    /// Settings", #698), off by default.
    static let developerKey = "showDeveloperSettings"

    /// Whether the Mac app prototypes the Step 6 custom tab strip in place
    /// of AppKit window tabs (#903), off by default.
    static let customTabsKey = "customTabStrip"

    /// Whether the custom tab strip prototype includes sample machine and
    /// terminal tabs for visual layout checks (#903), off by default.
    static let customTabsSamplesKey = "customTabStripSamples"

    /// The tab to show: Developer falls back to General while it's hidden,
    /// as when the tab kept from the last launch is Developer and the
    /// switch has since been turned off.
    func shown(developer: Bool) -> SettingsTab {
        self == .developer && !developer ? .general : self
    }

    /// A tab the page names, or nil for anything else. Not Developer:
    /// that is for the person to turn on.
    init?(message body: Any) {
        guard let name = body as? String, let tab = SettingsTab(rawValue: name), tab != .developer else {
            return nil
        }
        self = tab
    }
}

extension Notification.Name {
    /// A page asked for Settings at a tab (`SettingsTab` is the userInfo's
    /// `tab`); on iOS, for the scene whose page is the object.
    static let showAppSettings = Notification.Name("GanymedeShowAppSettings")
}
