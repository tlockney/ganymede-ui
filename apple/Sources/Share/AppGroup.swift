import DeviceBridge
import Foundation

// The App Group the apps share with their extensions (#449). Its
// identifier is in each bundle's Info.plist as `GanymedeAppGroup`:
// `group.com.ganymede-server.Ganymede` on iOS, registered for the team
// with a profile per target, and the team-prefixed
// `<TeamID>.com.ganymede-server.Ganymede` on macOS, which a Developer ID
// build can use with no profile.

enum AppGroup {
    /// This bundle's group, or nil in a bundle without one (unit tests).
    static var id: String? {
        guard let id = Bundle.main.object(forInfoDictionaryKey: "GanymedeAppGroup") as? String, !id.isEmpty else { return nil }
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

    /// Copies `key` into `group` unless it's there already, so a later
    /// revoke in the group isn't undone by the old copy.
    static func copyOnce(_ key: String, from app: UserDefaults, to group: UserDefaults) {
        guard group.object(forKey: key) == nil, let rows = app.object(forKey: key) else { return }
        group.set(rows, forKey: key)
    }
}
