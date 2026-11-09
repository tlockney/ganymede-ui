import DeviceBridge
import SwiftUI

/// Settings › Device (#383): the answers kept in ganymede-device's
/// permission ledger, and the folders each notebook was given
/// (`device.folders`), by notebook, each with Revoke. A revoked notebook
/// asks again on its next call, and a revoked folder must be picked
/// again. Every window's bridge reads the same stores, so a revoke here
/// applies to open notebooks too.
struct DeviceSettings: View {
    /// A ledger of its own on the shared store (ganymede-device#86).
    @State private var model = DeviceGrants()

    var body: some View {
        Form {
            if model.notebooks.isEmpty {
                Section {
                    Text("No notebook has been allowed or denied anything, or given a folder, yet.")
                        .foregroundStyle(.secondary)
                } footer: {
                    footer
                }
            } else {
                ForEach(model.notebooks, id: \.path) { notebook in
                    Section {
                        ForEach(notebook.grants, id: \.capability) { grant in
                            LabeledContent {
                                Button("Revoke") { model.revoke(notebook.path, grant.capability) }
                                    .accessibilityLabel("Revoke \(DeviceGrants.name(grant.capability)) for \(notebook.name)")
                            } label: {
                                Text(DeviceGrants.name(grant.capability))
                                Text(grant.answer == .always ? "Allowed" : "Denied")
                            }
                        }
                        ForEach(notebook.folders, id: \.id) { folder in
                            LabeledContent {
                                Button("Revoke") { model.revokeFolder(folder.id) }
                                    .accessibilityLabel("Revoke folder \(folder.name) for \(notebook.name)")
                            } label: {
                                Label(folder.name, systemImage: "folder")
                                Text(folder.writable ? "Folder, read and write" : "Folder, read only")
                            }
                        }
                    } header: {
                        Text(notebook.name)
                    } footer: {
                        Text(notebook.path)
                    }
                }
                Section {
                    Button("Revoke All", role: .destructive) { model.revokeAll() }
                } footer: {
                    footer
                }
            }
        }
        .formStyle(.grouped)
        .onAppear { model.reload() }
        // A prompt in a notebook window may keep an answer while this
        // stays open; the ledger's store is UserDefaults.
        .task {
            for await _ in NotificationCenter.default.notifications(named: UserDefaults.didChangeNotification) {
                model.reload()
            }
        }
    }

    private var footer: some View {
        Text("When a notebook first uses something that needs your permission, such as notifications, Ganymede asks whether to allow it once, always, or never. “Always” and “never” are kept here until you revoke them, as are the folders you picked for a notebook.")
    }
}

/// The kept answers, grouped by notebook, for `DeviceSettings`.
@MainActor
@Observable
final class DeviceGrants {
    struct Notebook {
        let path: String
        let grants: [LedgerGrant]
        /// Folders it was given, in the order they were picked.
        let folders: [FolderGrant]
        var name: String { URL(fileURLWithPath: path).lastPathComponent }
    }

    @ObservationIgnored private let ledger: PermissionLedger
    @ObservationIgnored private let folders: FolderGrants
    private(set) var notebooks: [Notebook] = []

    init(ledger: PermissionLedger? = nil, folders: FolderGrants? = nil) {
        self.ledger = ledger ?? PermissionLedger()
        self.folders = folders ?? FolderGrants()
        reload()
    }

    /// Reads the stores again: a window may have kept an answer, or a
    /// folder, since.
    func reload() {
        let byPath = Dictionary(grouping: ledger.grants, by: \.notebook)
        let foldersByPath = Dictionary(grouping: folders.grants, by: \.notebook)
        notebooks = Set(byPath.keys).union(foldersByPath.keys).sorted().map { path in
            Notebook(
                path: path, grants: (byPath[path] ?? []).sorted { $0.capability < $1.capability },
                folders: foldersByPath[path] ?? [])
        }
    }

    func revokeFolder(_ id: String) {
        folders.revoke(id)
        reload()
    }

    func revoke(_ notebook: String, _ capability: String) {
        ledger.revoke(notebook: notebook, capability: capability)
        reload()
    }

    func revokeAll() {
        for notebook in notebooks {
            ledger.revoke(notebook: notebook.path)
            folders.revoke(notebook: notebook.path)
        }
        reload()
    }

    /// A capability's name in a list: “Location”.
    static func name(_ capability: String) -> String {
        switch capability {
        case "notifications": "Notifications"
        case "location": "Location"
        case "motion": "Motion & Fitness"
        case "camera": "Camera"
        case "photos": "Photos"
        case "contacts": "Contacts"
        case "reminders": "Reminders"
        case "calendar": "Calendars"
        case "microphone": "Microphone"
        case "bluetooth": "Bluetooth"
        default: capability
        }
    }
}
