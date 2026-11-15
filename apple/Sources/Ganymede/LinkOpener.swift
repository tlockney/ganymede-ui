#if os(iOS)
import Observation
import SwiftUI
import UniformTypeIdentifiers

/// What the folder picker in `ContentView` is for: the Open Folder button,
/// or a link that needs a folder granted (#640).
enum FolderPick {
    case openFolder, grantForLink
}

/// Does what a `ganymede://open` link asks on iPad and iPhone (#640), as
/// `AppURLHandler` does on the Mac: opens the notebook when it is in the
/// folder the app has open or one the person granted (`LinkFolders`), asks
/// before switching to another granted folder, and says how to grant a
/// folder when it isn't in any. `run` and `new` work only on the Mac. The
/// x-callback answers are never opened: nothing here runs code or has an
/// answer to give.
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

    /// The link to open again once the person grants a folder.
    @ObservationIgnored private var grantFor: AppURL?
    /// The notebook to open once the page of the server on `folder` is up.
    @ObservationIgnored private var pending: FolderSwitch?

    /// A `ganymede://` URL, other than Shortcuts' callbacks. `show` opens
    /// a notebook in the folder the app serves, by its path there.
    func handle(_ url: URL, model: AppModel, show: (String) -> Void) {
        pending = nil
        let request: AppURL
        do {
            request = try AppURL(url)
        } catch {
            fail(error)
            return
        }
        open(request, model: model, show: show)
    }

    private func open(_ request: AppURL, model: AppModel, show: (String) -> Void) {
        let target: LinkFolders.Target
        switch request.command {
        case .open(let path): target = .path(path)
        case .openInFolder(let folder, let file): target = .inFolder(folder: folder, file: file)
        case .new: return fail(AppURLError.macOnly("new"))
        case .run: return fail(AppURLError.macOnly("run"))
        }
        let root = model.serverRootFolder
        let found: (folder: URL, file: URL)
        do {
            // Read inside the folders' access: the file is checked there.
            found = try LinkFolderStore.shared.withAccess { granted -> (folder: URL, file: URL) in
                let found = try LinkFolders.resolve(target, root: root, granted: granted)
                try LinkFolders.checkNotebook(found.file)
                return found
            }
        } catch LinkFolderError.notGranted {
            notice = Notice(
                title: "Ganymede can’t open this file",
                message: LinkFolderError.notGranted.localizedDescription,
                action: .grant(request)
            )
            return
        } catch {
            fail(error)
            return
        }

        // In the open folder, whatever grants hold it as well.
        if AppURL.isInside(found.file, anyOf: [root]) {
            if let path = NotebookActions.apiPath(for: found.file, root: root) {
                show(path)
            } else {
                fail(LinkFolderError.notGranted)
            }
            return
        }
        let name = found.file.deletingPathExtension().lastPathComponent
        let folder = found.folder.lastPathComponent
        let current = root.lastPathComponent
        notice = Notice(
            title: "Open “\(name)” from “\(folder)”?",
            message: "Ganymede will switch from the folder “\(current)” to “\(folder)”. Kernels running in “\(current)” stop.",
            action: .switchFolder(FolderSwitch(
                folder: found.folder, apiPath: FolderEntry.serverPath(found.file, root: found.folder)
            ))
        )
    }

    /// The person said yes to switching: the server restarts on the
    /// folder, and the notebook opens once its page is up (`pageReady`).
    /// Not at once: the old page stays ready until the new one commits,
    /// and would take the command.
    func confirm(_ change: FolderSwitch, model: AppModel) {
        // Resolved again, in case the folder was revoked since the question.
        let switched = LinkFolderStore.shared.withAccess { granted -> Bool in
            guard let folder = granted.first(where: { Self.same($0, change.folder) }) else { return false }
            pending = FolderSwitch(folder: folder, apiPath: change.apiPath)
            model.open(folder: folder)
            return true
        }
        if !switched {
            // After the alert that asked has gone, or it would clear this one.
            Task { self.fail(LinkFolderError.notGranted) }
        }
    }

    /// The page reports ready (again): opens the notebook a folder switch
    /// waits for, if the server now serves that folder.
    func pageReady(model: AppModel, show: (String) -> Void) {
        guard let waiting = pending else { return }
        pending = nil
        guard Self.same(waiting.folder, model.serverRootFolder) else { return }
        show(waiting.apiPath)
    }

    /// The folder the app serves changed: a notebook waiting for another
    /// folder's server won't open.
    func rootChanged(to root: URL) {
        if let waiting = pending, !Self.same(waiting.folder, root) { pending = nil }
    }

    /// The server didn't start on the folder.
    func startFailed() {
        pending = nil
    }

    /// The person chose Grant Access…; `picked` follows from the picker.
    func beginGrant(for request: AppURL) {
        grantFor = request
    }

    /// The folder picker answered for a link: keeps the folder, and tries
    /// the link again once. Still in no granted folder, it asks again.
    func picked(_ result: Result<URL, Error>, model: AppModel, show: (String) -> Void) {
        let request = grantFor
        grantFor = nil
        switch result {
        case .failure(let error):
            if (error as? CocoaError)?.code == .userCancelled { return }
            notice = Notice(title: "Ganymede couldn’t use that folder", message: error.localizedDescription, action: .dismiss)
        case .success(let folder):
            do {
                try LinkFolderStore.shared.add(folder)
            } catch {
                notice = Notice(
                    title: "Ganymede couldn’t keep access to that folder",
                    message: error.localizedDescription, action: .dismiss
                )
                return
            }
            if let request { open(request, model: model, show: show) }
        }
    }

    private func fail(_ error: Error) {
        notice = Notice(title: "Ganymede couldn’t open the link", message: error.localizedDescription, action: .dismiss)
    }

    /// The same folder, by whatever spelling of its path.
    private static func same(_ a: URL, _ b: URL) -> Bool {
        AppURL.isInside(a, anyOf: [b]) && AppURL.isInside(b, anyOf: [a])
    }
}

/// The alert for `LinkOpener.notice`.
struct LinkAlert: ViewModifier {
    var links: LinkOpener
    var grant: (AppURL) -> Void
    var change: (LinkOpener.FolderSwitch) -> Void

    func body(content: Content) -> some View {
        content.alert(
            links.notice?.title ?? "",
            isPresented: Binding(
                get: { links.notice != nil },
                set: { if !$0 { links.notice = nil } }
            ),
            presenting: links.notice
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

/// Settings › Links: the folders `ganymede://` links may open notebooks
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
                Text("Links from other apps open notebooks only in these folders and the folder Ganymede has open. Swipe a folder to revoke it: that stops links, and doesn’t close a folder that is open.")
            }
            if let problem = store.problem {
                Section { Text(problem) }
            }
        }
        .navigationTitle("Links")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton() }
        .fileImporter(isPresented: $adding, allowedContentTypes: [.folder]) { result in
            switch result {
            case .success(let folder):
                do {
                    try store.add(folder)
                } catch {
                    failure = error.localizedDescription
                }
            case .failure(let error):
                if (error as? CocoaError)?.code != .userCancelled { failure = error.localizedDescription }
            }
        }
        .alert(
            "Ganymede couldn’t keep access to that folder",
            isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }
}
#endif
