import DeviceBridge
import WebKit

/// A notebook page's side of the app's kernels and `device` (ganymede-ui#99,
/// #383). The kernels themselves run in `AppKernels`, one kernel web view
/// for the app, as kernels of its server; the page reaches them through the
/// server's API like any other kernel.
///
/// What stays per page: the page's messages for the permission ledger
/// (`kernelRelay`: renames, a notebook's declared capabilities), and the
/// `device` calls of its server kernels' comm (#568): the
/// page answers that comm and posts to the bridge's `deviceRemote` handler,
/// which takes only the methods that need no permission, and only from the
/// page's main frame at the server's origin. Only main-frame messages are
/// taken, since WebKit gives subframes, the UI's sandboxed output frames
/// among them, the same message handlers.
@MainActor
final class KernelHost: NSObject {
    static let relayHandler = "kernelRelay"

    /// ganymede-device's bridge, for the page's remote calls.
    private let device: DeviceBridge
    /// The folders notebooks picked, in the store the bridge and Settings
    /// share: a rename moves them even for a notebook with no kept answer.
    private let folders: FolderGrants
    /// The kernels the page's notebooks run on: told of renames.
    private let kernels: AppKernels
    private weak var ui: WKWebView?
    private var pageURL: URL?
    /// The permission ledger's prompt (#383); the bridge holds it weakly.
    let prompter: AppLedgerPrompter
    /// What notebook paths from the UI page are under: the app server's
    /// root folder, so the ledger keeps each notebook by its absolute path,
    /// which stays the same across launches. Paths are used as given
    /// without one.
    var notebookRoot: URL?
    /// Open-time prompts queued or showing, so a notebook opened twice
    /// asks once.
    private struct OpenAsk: Hashable {
        let notebook: String
        let capability: String
    }
    private var openAsks: Set<OpenAsk> = []

    /// `device` is the bridge the page's remote calls reach (the system's
    /// when nil); tests pass one with a fake presenter, `prompts`, a
    /// presenter for the ledger's prompts, `folders`, the grants that
    /// bridge was given, and `kernels`, the app's kernels.
    init(
        device: DeviceBridge? = nil, prompts: DialogPresenter? = nil, folders: FolderGrants? = nil,
        kernels: AppKernels? = nil
    ) {
        // Every window's bridge keeps its answers in one store, which
        // Settings reads too (ganymede-device#86).
        let folders = folders ?? FolderGrants()
        self.folders = folders
        self.device = device ?? Self.systemBridge(folders: folders)
        self.kernels = kernels ?? AppKernels.shared
        prompter = AppLedgerPrompter(presenter: prompts, host: { nil })
        super.init()
        prompter.host = { [weak self] in self?.ui }
        if self.device.ledgerPrompter == nil {
            self.device.ledgerPrompter = prompter
        }
    }

    /// One scheduler for every window: the first one made becomes the
    /// notification center's (weak) delegate, which shows notifications
    /// while the app is in front, so it must outlive any one window.
    private static let notifications = SystemNotificationScheduler()

    /// The Shortcuts `device.shortcuts.run` started and waits on
    /// (ganymede-device#40), one for every bridge: the Shortcuts app calls
    /// back to a `ganymede://device-callback/shortcuts/...` URL, which the
    /// app hands to `shortcuts.handle(_:)` before anything else sees it.
    static let shortcuts = ShortcutCalls(callback: URL(string: "ganymede://\(AppURL.shortcutsCallbackHost)/shortcuts")!)

    /// The bridge cells get by default: every namespace ganymede-device
    /// has, with the permissioned ones (#569, #422) turned
    /// on, host events (`device.on`), and folders the person picks
    /// (`device.folders`). Each permissioned one asks the
    /// app's ledger, then the system, on first use; one the device lacks
    /// (motion and the camera on a Mac) stays out of `hello`.
    static func systemBridge(folders: FolderGrants) -> DeviceBridge {
        // The ledger is shared with the share extension (#449).
        let bridge = DeviceBridge(ledger: PermissionLedger(store: AppGroup.ledgerStore()))
        // The notification center throws outside an app bundle, such as
        // the unit tests' runner.
        if Bundle.main.bundleURL.pathExtension == "app" {
            bridge.addNotifications(notifications)
        }
        bridge.addLocation()
        bridge.addMotion()
        bridge.addPhotoSaving()
        bridge.addCameraCapture()
        bridge.addContacts()
        bridge.addReminders()
        bridge.addBluetooth()
        bridge.addFolders(folders)
        bridge.addHostEvents()
        bridge.addShortcuts(shortcuts)
        // Notebook widgets (#436), off until Settings › Device turns them
        // on: what a run publishes goes to the App Group, where the
        // widget reads it. The switch is read on each call (#494), so it
        // applies to notebooks already open.
        if let group = AppGroup.defaults() {
            bridge.addWidgets(
                PublishedWidgets(store: UserDefaultsWidgetStore(defaults: group, widgetKind: AppGroup.widgetKind)),
                enabled: { group.bool(forKey: AppGroup.widgetsKey) }
            )
        }
        return bridge
    }

    /// Takes `ui`'s messages for the app, answers its remote `device`
    /// calls, and lends it to the app's kernels, whose web view must be in
    /// a window to keep running.
    func attach(to ui: WKWebView) {
        self.ui = ui
        ui.configuration.userContentController.add(WeakHandler(self), name: Self.relayHandler)
        device.registerRemote(in: ui.configuration.userContentController) { [weak self, weak ui] message in
            guard let self, let ui, message.webView === ui else { return false }
            return self.fromPage(message)
        }
        kernels.lend(ui)
    }

    /// Takes `ui`'s remote `device` calls for a machine's kernels (#877),
    /// and nothing else of this device's. The ledger's messages aren't
    /// taken: it keeps this device's notebooks by their absolute paths, and
    /// a machine's notebooks aren't this device's to keep. Nor is the web
    /// view lent to `AppKernels`, which a machine's window doesn't run its
    /// kernels in. Every dialog and clipboard prompt says `asker`, the
    /// machine's name, because what a call reads leaves this device.
    func attachRemote(to ui: WKWebView, asker: String?) {
        self.ui = ui
        let options = RemoteOptions(asker: asker, confirmClipboardReads: true)
        device.registerRemote(in: ui.configuration.userContentController, options) { [weak self, weak ui] message in
            guard let self, let ui, message.webView === ui else { return false }
            return self.fromPage(message)
        }
    }

    /// Attaches the device handlers a window of `place` gets (#877): this
    /// device's `kernelRelay`, the full bridge and the lend (`attach`), or
    /// a machine's `deviceRemote` alone when its remote's setting says so
    /// (`attachRemote`), and neither with that setting off. The one
    /// decision a window's place makes about them, so `WindowWiringTests`
    /// builds a page and asks this.
    func attach(to ui: WKWebView, place: Place, settings: PlaceSettings, asker: String?) {
        if place.allows(.deviceLedger, settings) {
            attach(to: ui)
        } else if place.allows(.deviceRemote, settings) {
            attachRemote(to: ui, asker: asker)
        }
    }

    /// The UI page is `url`.
    func uiWillLoad(_ url: URL) {
        pageURL = url
        reset()
    }

    /// The UI page navigated: what it asked for server kernels has no one
    /// to answer it. The kernels are the server's and keep running.
    func reset() {
        device.dropRemote()
    }

    /// The UI page's process died: no one answers what it asked for server
    /// kernels.
    func uiPageEnded() {
        device.dropRemote()
    }

    /// The message comes from a page of ours: the main frame, at the UI
    /// page's server.
    private func fromPage(_ message: WKScriptMessage) -> Bool {
        message.frameInfo.isMainFrame
            && message.frameInfo.securityOrigin.host == pageURL?.host
            && message.frameInfo.securityOrigin.port == pageURL?.port ?? 0
    }

    fileprivate func received(_ message: WKScriptMessage) {
        guard fromPage(message), message.name == Self.relayHandler, message.webView === ui,
              let m = message.body as? [String: Any]
        else { return }
        // The page's messages for the permission ledger (#383): a rename,
        // a notebook's declared capabilities.
        switch m["op"] as? String {
        case "moved":
            if let from = m["from"] as? String, let to = m["to"] as? String {
                moved(from: resolve(from), to: resolve(to))
            }
        case "declared":
            if let path = m["path"] as? String, let declared = m["capabilities"] as? [String] {
                askAtOpen(declared, notebook: resolve(path))
            }
        default:
            break
        }
    }

    /// A server path from the UI page as the ledger keeps it.
    private func resolve(_ path: String) -> String {
        guard let notebookRoot else { return path }
        let relative = path.hasPrefix("/") ? String(path.dropFirst()) : path
        return notebookRoot.appendingPathComponent(relative).standardizedFileURL.path
    }

    /// A file or folder moved: every notebook at or under `old` follows,
    /// with its kept answers, its folders and its kernels.
    private func moved(from old: String, to new: String) {
        guard old != new else { return }
        let rename: (String) -> String? = { path in
            if path == old { return new }
            if path.hasPrefix(old + "/") { return new + path.dropFirst(old.count) }
            return nil
        }
        let paths = Set(device.ledger.grants.map(\.notebook)).union(folders.grants.map(\.notebook))
        for path in paths.sorted() {
            if let to = rename(path) { device.notebookMoved(from: path, to: to) }
        }
        kernels.moved(from: old, to: new)
    }

    /// Asks, one at a time, about each declared capability this app has
    /// and nothing has decided.
    private func askAtOpen(_ declared: [String], notebook: String) {
        for capability in device.undecided(declared, notebook: notebook) {
            // Opened again (another tab, a reload) before the person
            // answered: the prompt already up or waiting covers it.
            let key = OpenAsk(notebook: notebook, capability: capability)
            guard openAsks.insert(key).inserted else { continue }
            // The file as the person is asked about it: an answer is kept
            // only if it is still that file when they answer (#584).
            let seen = device.ledger.currentStamp(ofNotebook: notebook)
            prompter.askAtOpen(capability, notebook: notebook) { [weak self] answer in
                self?.openAsks.remove(key)
                guard let self, let answer, answer != .once,
                      // Answered meanwhile, by a call's prompt.
                      self.device.ledger.answer(notebook: notebook, capability: capability) == nil
                else { return }
                self.device.ledger.record(answer, notebook: notebook, capability: capability, unlessChangedSince: seen)
            }
        }
    }
}

/// WKUserContentController keeps its handlers alive; this keeps the host
/// from keeping itself alive through them.
@MainActor
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var host: KernelHost?

    init(_ host: KernelHost) {
        self.host = host
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        host?.received(message)
    }
}
