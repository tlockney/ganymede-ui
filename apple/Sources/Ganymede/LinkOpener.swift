import Foundation
import Observation

/// Does what a `ganymede://open` link asks on iPad and iPhone (#640), as
/// `AppURLHandler` does on the Mac: opens the notebook when it is in the
/// folder the app has open or one the person granted (`LinkFolders`), asks
/// before switching to another granted folder, and says how to grant a
/// folder when it isn't in any. `run` and `new` work only on the Mac. The
/// x-callback answers are never opened: nothing here runs code or has an
/// answer to give. Free of the app's model, so tests can run it; the app
/// gives it the open folder and the actions at each call.
@MainActor
@Observable
final class LinkOpener {
    /// A question or an error for the person, shown as an alert.
    struct Notice: Identifiable {
        enum Action {
            case dismiss
            case grant(AppURL)
            case switchFolder(FolderSwitch)
        }

        let id = UUID()
        var title: String
        var message: String
        var action: Action
    }

    /// A notebook in a granted folder other than the open one.
    struct FolderSwitch {
        /// The granted folder.
        var folder: URL
        /// The notebook's path in it, as the server rooted there takes it.
        var apiPath: String
    }

    var notice: Notice?

    /// Runs a closure once whatever is being dismissed is gone; for the
    /// notices posted after a picker or from an alert's own action, which
    /// SwiftUI drops if they come while another presentation closes.
    typealias Scheduler = @MainActor (@escaping @MainActor () -> Void) -> Void
    @ObservationIgnored var later: Scheduler

    @ObservationIgnored private let store: LinkFolderStore
    @ObservationIgnored private let isUbiquitous: (URL) -> Bool
    /// Starts an iCloud download (`checkNotebook`); replaced in tests.
    @ObservationIgnored private let startDownload: (URL) throws -> Void
    /// The link to open again once the person grants a folder.
    @ObservationIgnored private var grantFor: AppURL?
    /// The notebook to open once the page of the server on `folder` is up.
    @ObservationIgnored private(set) var pending: FolderSwitch?

    init(
        store: LinkFolderStore = .shared,
        isUbiquitous: @escaping (URL) -> Bool = LinkFolders.isUbiquitousItem,
        startDownload: @escaping (URL) throws -> Void = { try FileManager.default.startDownloadingUbiquitousItem(at: $0) },
        later: @escaping Scheduler = { work in work() }
    ) {
        self.store = store
        self.isUbiquitous = isUbiquitous
        self.startDownload = startDownload
        self.later = later
    }

    /// Whether `url` is a Shortcuts callback (ganymede-device#40), which
    /// `KernelHost.shortcuts` takes, not a link to open.
    nonisolated static func isShortcutsCallback(_ url: URL) -> Bool {
        url.host?.lowercased() == AppURL.shortcutsCallbackHost
    }

    /// A `ganymede://` URL that isn't a Shortcuts callback. `root` is the
    /// folder the app serves; `openFiles` lists the text files open for
    /// editing (a folder switch would break them); `show` opens a notebook
    /// in the folder the app serves, by its path.
    /// `root` is the folder the app serves, as last asked for; `served`
    /// the folder its running server was started on (nil while none is
    /// up). They differ during a restart.
    func handle(_ url: URL, root: URL, served: URL?, openFiles: () -> [String], show: (String) -> Void) {
        pending = nil
        let request: AppURL
        do {
            request = try AppURL(url)
        } catch {
            fail(error)
            return
        }
        open(request, root: root, served: served, openFiles: openFiles, deferNotices: false, show: show)
    }

    private func open(
        _ request: AppURL, root: URL, served: URL?, openFiles: () -> [String], deferNotices: Bool, show: (String) -> Void
    ) {
        let target: LinkFolders.Target
        switch request.command {
        case .open(let path): target = .path(path)
        case .openInFolder(let folder, let file): target = .inFolder(folder: folder, file: file)
        case .new: return fail(AppURLError.macOnly("new"), deferred: deferNotices)
        case .run: return fail(AppURLError.macOnly("run"), deferred: deferNotices)
        }

        // The open folder first, with no bookmark resolved: a file in it
        // needs no grant. A folder name a granted folder also has goes the
        // long way, to tell whether it is ambiguous.
        var namedByAGrant = false
        if case .inFolder(let name, _) = target { namedByAGrant = store.folders.contains { $0.name == name } }
        var inRoot: (folder: URL, file: URL)?
        if !namedByAGrant {
            do {
                inRoot = try LinkFolders.resolve(target, root: root, granted: [])
            } catch LinkFolderError.notGranted {
                // Not in the open folder: the granted ones, below.
            } catch {
                return fail(error, deferred: deferNotices)
            }
        }
        if let found = inRoot {
            do {
                try LinkFolders.checkNotebook(found.file, isUbiquitous: isUbiquitous, startDownload: startDownload)
                guard let path = LinkFolders.relativePath(of: found.file, in: root) else { throw LinkFolderError.notGranted }
                showWhenServed(path, root: root, served: served, show: show)
            } catch {
                fail(error, deferred: deferNotices)
            }
            return
        }

        let found: (folder: URL, file: URL, relative: String?)
        do {
            // Read inside the folders' access: the file is checked, and
            // its path in the folder worked out, there.
            found = try store.withAccess { granted -> (folder: URL, file: URL, relative: String?) in
                let found = try LinkFolders.resolve(target, root: root, granted: granted)
                try LinkFolders.checkNotebook(found.file, isUbiquitous: isUbiquitous, startDownload: startDownload)
                return (found.folder, found.file, LinkFolders.relativePath(of: found.file, in: found.folder))
            }
        } catch LinkFolderError.notGranted {
            post(Notice(
                title: "Ganymede can’t open this file",
                message: LinkFolderError.notGranted.localizedDescription,
                action: .grant(request)
            ), deferred: deferNotices)
            return
        } catch {
            fail(error, deferred: deferNotices)
            return
        }

        // In the open folder after all (a grant inside it holds the file too).
        if let path = LinkFolders.relativePath(of: found.file, in: root) {
            showWhenServed(path, root: root, served: served, show: show)
            return
        }
        guard let relative = found.relative else {
            fail(LinkFolderError.notGranted, deferred: deferNotices)
            return
        }
        // A switch restarts the server on the other folder, and an open
        // editor would save into it.
        if let openFile = openFiles().first {
            fail(LinkFolderError.openFile(URL(fileURLWithPath: openFile).lastPathComponent), deferred: deferNotices)
            return
        }
        let name = found.file.deletingPathExtension().lastPathComponent
        let folder = found.folder.lastPathComponent
        let current = root.lastPathComponent
        post(Notice(
            title: "Open “\(name)” from “\(folder)”?",
            message: "Ganymede will switch from the folder “\(current)” to “\(folder)”. Kernels running in “\(current)” stop.",
            action: .switchFolder(FolderSwitch(folder: found.folder, apiPath: relative))
        ), deferred: deferNotices)
    }

    /// The person said yes to switching: `openFolder` makes the server
    /// serve the folder, and the notebook opens once its page is up
    /// (`pageReady`). Not at once: the old page stays ready until the new
    /// one commits, and would take the command. A folder revoked since
    /// the question isn't opened.
    func confirm(_ change: FolderSwitch, openFolder: (URL) -> Void) {
        // Resolved again, in case the folder was revoked since the question.
        let switched = store.withAccess { granted -> Bool in
            guard let folder = granted.first(where: { AppURL.isSame($0, change.folder) }) else { return false }
            pending = FolderSwitch(folder: folder, apiPath: change.apiPath)
            openFolder(folder)
            return true
        }
        // From an alert's action: after that alert has closed.
        if !switched { fail(LinkFolderError.notGranted, deferred: true) }
    }

    /// The alert with `id` went away. A newer notice, posted by the action
    /// that closed it, stays.
    func dismiss(_ id: Notice.ID) {
        if notice?.id == id { notice = nil }
    }

    /// Drops a parked link switch when the person chose Keep Editing instead
    /// of switching to this device (#808).
    func cancelPending() {
        pending = nil
    }

    /// The page is ready and its server was started on `served`
    /// (`AppModel.servedRoot`, not the requested root): opens the notebook
    /// a folder switch waits for once that is its folder. A page of the
    /// old folder's server, ready after the switch was asked for (a start
    /// still queued at a cold launch), leaves it waiting.
    func pageReady(served: URL?, show: (String) -> Void) {
        guard let waiting = pending, let served, AppURL.isSame(waiting.folder, served) else { return }
        pending = nil
        show(waiting.apiPath)
    }

    /// Whether a link waits for this device's server while the scene shows
    /// `place` (#762). A machine's page never reports this device's
    /// readiness (`pageReady`), so the scene should switch to this device,
    /// whose page opens the link once ready.
    func waitsForThisDevice(showing place: Place) -> Bool {
        pending != nil && place.isMachine
    }

    /// The folder the app serves changed: a notebook waiting for another
    /// folder's server won't open.
    func rootChanged(to root: URL) {
        if let waiting = pending, !AppURL.isSame(waiting.folder, root) { pending = nil }
    }

    /// A start on `root` failed, or its folder couldn't be opened: a
    /// notebook waiting for that folder won't open, and says why, since
    /// the old folder's page may still show (`reason`: the app's error).
    /// An older start's failure (another folder) leaves it waiting.
    func startFailed(on root: URL?, reason: String? = nil) {
        guard let waiting = pending, let root, AppURL.isSame(waiting.folder, root) else { return }
        pending = nil
        post(
            Notice(
                title: "Ganymede couldn’t open “\(waiting.folder.lastPathComponent)”",
                message: reason ?? "Its server didn’t start.",
                action: .dismiss
            ),
            deferred: true
        )
    }

    /// A notebook in the open folder: shown now when the running server
    /// serves that folder, else once its page is ready (a restart on it is
    /// under way, and the old folder's page could take the command).
    private func showWhenServed(_ path: String, root: URL, served: URL?, show: (String) -> Void) {
        if let served, AppURL.isSame(served, root) {
            show(path)
        } else {
            pending = FolderSwitch(folder: root, apiPath: path)
        }
    }

    /// The person chose Grant Access…; `picked` follows from the picker.
    func beginGrant(for request: AppURL) {
        grantFor = request
    }

    /// The folder picker answered for a link: keeps the folder, and tries
    /// the link again once. Still in no granted folder, it asks again.
    /// What it says comes after the picker has gone.
    func picked(_ result: Result<URL, Error>, root: URL, served: URL?, openFiles: () -> [String], show: (String) -> Void) {
        let request = grantFor
        grantFor = nil
        switch store.add(picked: result) {
        case .cancelled:
            return
        case .failed(let message):
            post(Notice(title: LinkFolderStore.addFailureTitle, message: message, action: .dismiss), deferred: true)
        case .added:
            if let request {
                open(request, root: root, served: served, openFiles: openFiles, deferNotices: true, show: show)
            }
        }
    }

    private func fail(_ error: Error, deferred: Bool = false) {
        post(
            Notice(title: "Ganymede couldn’t open the link", message: error.localizedDescription, action: .dismiss),
            deferred: deferred
        )
    }

    private func post(_ notice: Notice, deferred: Bool) {
        if deferred {
            later { [weak self] in self?.notice = notice }
        } else {
            self.notice = notice
        }
    }
}

/// The text files open for editing in every window (#640): a folder
/// switch restarts the one server they all save through, so it waits
/// until none is open. Each window or editor scene reports its own.
@MainActor
final class OpenTextFiles {
    static let shared = OpenTextFiles()
    private var byOwner: [UUID: [String]] = [:]

    func set(_ paths: [String], for owner: UUID) {
        byOwner[owner] = paths.isEmpty ? nil : paths
    }

    /// Every window's, sorted, each once.
    var all: [String] {
        Array(Set(byOwner.values.joined())).sorted()
    }
}

#if os(iOS)
import SwiftUI
import UniformTypeIdentifiers

/// What the folder picker in `ContentView` is for: the Open Folder button,
/// or a link that needs a folder granted (#640).
enum FolderPick {
    case openFolder, grantForLink
}

/// The alert for `LinkOpener.notice`.
/// Attached to the window and to each full-screen cover, since an alert
/// can't present from under a cover; `isEnabled` is true for one of them
/// at a time, or the alert would show twice.
struct LinkAlert: ViewModifier {
    var links: LinkOpener
    var isEnabled = true
    var grant: (AppURL) -> Void
    var change: (LinkOpener.FolderSwitch) -> Void

    func body(content: Content) -> some View {
        content.alert(
            links.notice?.title ?? "",
            isPresented: Binding(
                get: { isEnabled && links.notice != nil },
                // Only the alert shown: an action may have posted another.
                set: { [shown = links.notice?.id, enabled = isEnabled] in
                    if enabled, !$0, let shown { links.dismiss(shown) }
                }
            ),
            presenting: isEnabled ? links.notice : nil
        ) { notice in
            switch notice.action {
            case .dismiss:
                Button("OK", role: .cancel) {}
            case .grant(let request):
                Button("Grant Access…") { grant(request) }
                Button("Cancel", role: .cancel) {}
            case .switchFolder(let switching):
                Button("Open") { change(switching) }
                Button("Cancel", role: .cancel) {}
            }
        } message: { notice in
            Text(notice.message)
        }
    }
}

/// Settings › Link Folders: the folders `ganymede://` links may open notebooks
/// in, besides the one Ganymede has open.
struct LinkFoldersSettings: View {
    @State private var store = LinkFolderStore.shared
    @State private var adding = false
    @State private var failure: String?

    var body: some View {
        List {
            Section {
                if store.folders.isEmpty {
                    Text("No folders").foregroundStyle(.secondary)
                }
                ForEach(store.folders) { folder in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(folder.name)
                        if !folder.isAvailable {
                            Text("Unavailable: the folder is gone or can’t be reached. Revoke it, or add the folder again.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { offsets in
                    let ids = offsets.map { store.folders[$0].id }
                    for id in ids { store.remove(id) }
                }
                Button("Add Folder…") { adding = true }
            } footer: {
                Text("Links from other apps open notebooks only in these folders and the folder Ganymede has open. Swipe a folder to revoke it. That stops links into it, unless it is the folder Ganymede has open, and doesn’t close it.")
            }
            if let problem = store.problem {
                Section { Text(problem) }
            }
        }
        .navigationTitle("Link Folders")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton() }
        .fileImporter(isPresented: $adding, allowedContentTypes: [.folder]) { result in
            if case .failed(let message) = store.add(picked: result) { failure = message }
        }
        .alert(
            LinkFolderStore.addFailureTitle,
            isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }
}
#endif
