import DeviceBridge
import Foundation

// The App Group the apps share with their extensions (#449). Its
// identifier is in each bundle's Info.plist as `GanymedeAppGroup`:
// `group.com.ganymede-server.Ganymede` on iOS, registered for the team
// with a profile per target, and the team-prefixed
// `<TeamID>.com.ganymede-server.Ganymede` on macOS, which a Developer ID
// build can use with no profile.

enum AppGroup {
    /// This bundle's group, or nil in a bundle without one (unit tests)
    /// or in a build with no team.
    static var id: String? {
        usable(Bundle.main.object(forInfoDictionaryKey: "GanymedeAppGroup") as? String, bundleID: Bundle.main.bundleIdentifier)
    }

    /// `id` if it names a real group: not empty, and not the app's own
    /// bundle ID, which a Mac build with no team (CI's, an unsigned local
    /// one) gets from an empty team prefix. Defaults with that suite name
    /// would be the app's own, and moving the ledger into them would
    /// delete it.
    static func usable(_ id: String?, bundleID: String?) -> String? {
        guard let id, !id.isEmpty, id != bundleID else { return nil }
        #if os(macOS)
        // A team-prefixed group, as `<TeamID>.com.ganymede-server.Ganymede`.
        guard !id.hasPrefix("com.") else { return nil }
        #endif
        return id
    }

    /// The group's container, or nil when this build has no group.
    static func container() -> URL? {
        id.flatMap { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) }
    }

    /// The group's defaults, or nil when this build has no group.
    static func defaults() -> UserDefaults? {
        guard container() != nil, let id else { return nil }
        return UserDefaults(suiteName: id)
    }

    /// Settings › Device's share-sheet switch, in the group's defaults so
    /// the extension can read it; off by default while the runner is a
    /// spike.
    static let shareSheetKey = "ganymede.runner.shareSheet"

    /// Settings › Device › Notebook Widgets (#436), off by default: the
    /// app turns on `device.widget.update`, and the widget shows content.
    static let widgetsKey = "ganymede.runner.widgets"

    /// The notebook widget's kind, which the app asks WidgetKit to reload.
    static let widgetKind = "NotebookWidget"

    /// The permission ledger's store, shared with the extensions: the
    /// group's defaults, holding a copy of the app's own answers from
    /// before the group (#449). Nil without a group, which leaves the
    /// ledger in the app's defaults.
    @MainActor
    static func ledgerStore() -> LedgerStore? {
        guard let group = defaults() else { return nil }
        copyOnce(ledgerKey, from: .standard, to: group)
        return UserDefaultsLedgerStore(key: ledgerKey, defaults: group)
    }

    static let ledgerKey = "ganymede.device.ledger"

    /// Moves `key` into `group` unless it's there already, so a later
    /// revoke in the group isn't undone by the old copy. The app's rows
    /// are removed, so a build without the group, or with another one,
    /// starts empty rather than with answers since revoked.
    static func copyOnce(_ key: String, from app: UserDefaults, to group: UserDefaults) {
        guard let rows = app.object(forKey: key) else { return }
        if group.object(forKey: key) == nil { group.set(rows, forKey: key) }
        app.removeObject(forKey: key)
    }
}
