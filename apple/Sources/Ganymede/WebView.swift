import SwiftUI
import WebKit

/// ganymede-ui, loaded from the in-process server.
#if os(macOS)
struct WebView: NSViewRepresentable {
    let url: URL
    /// The page's URL after each change, including the page's own
    /// `history.replaceState` (the notebook it has open, #129).
    var onNavigate: ((URL?) -> Void)? = nil
    /// The window's document, which the page keeps up to date (#132).
    var document: PageDocument? = nil
    /// What the page shows and the commands it runs, for native chrome (#205).
    var page: PageModel? = nil
    /// Opens a tab the page asked for (`openTab`, #729).
    var onOpenTab: ((TabRequest) -> Void)? = nil
    /// Opens a text file from the sidebar, by its path on the server (#122).
    var onOpenFile: ((String) -> Void)? = nil
    /// Where the window's notebooks live (#701): a machine's window gets
    /// none of the app's native handlers.
    var place: Place = .thisDevice
    /// Whether the page gets the person's name (#842): always on this
    /// device; on a machine, its remote's setting.
    var sharesName: Bool
    /// Whether a machine's notebooks may use this device's `device` API
    /// (#877): its remote's setting. This device's page always may.
    var usesDevice: Bool
    /// The folder the window's page paths are from (#883): this Mac's own
    /// server's `root_dir` in its window, the app server's root in every
    /// other, for the ledger's notebook paths and a `document` message's.
    var pageRoot: PageRoot
    /// A load of the page committed (#883): the window reads its place
    /// again, so a check that verified its machine applies on this load and
    /// not under the page that was showing.
    var onLoad: (() -> Void)? = nil

    func makeCoordinator() -> WebViewCoordinator {
        WebViewCoordinator(
            place: place, sharesName: sharesName, usesDevice: usesDevice, pageRoot: pageRoot)
    }

    func makeNSView(context: Context) -> WKWebView {
        context.coordinator.makeWebView()
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        context.coordinator.update(place: place, pageRoot: pageRoot, sharesName: sharesName)
        context.coordinator.onNavigate = onNavigate
        context.coordinator.document = document
        context.coordinator.page = page
        context.coordinator.onOpenTab = onOpenTab
        context.coordinator.onOpenFile = onOpenFile
        context.coordinator.onLoad = onLoad
        context.coordinator.load(url, in: view)
    }
}
#else
struct WebView: UIViewRepresentable {
    let url: URL
    /// What the page shows and the commands it runs, for native chrome (#205).
    var page: PageModel? = nil
    /// Opens a text file from the sidebar, by its path on the server (#122).
    var onOpenFile: ((String) -> Void)? = nil
    /// Keeps the page alive while it is off screen (the iPhone, #209).
    var store: WebViewStore? = nil
    /// Where the window's notebooks live (#701).
    var place: Place = .thisDevice
    /// Whether the page gets the person's name (#842): always on this
    /// device; on a machine, its remote's setting.
    var sharesName: Bool
    /// Whether a machine's notebooks may use this device's `device` API
    /// (#877): its remote's setting. This device's page always may.
    var usesDevice: Bool
    /// The folder the window's page paths are from (#883): this Mac's own
    /// server's `root_dir` in its window, the app server's root in every
    /// other. On iOS, where nothing verifies, always the app server's.
    var pageRoot: PageRoot

    func makeCoordinator() -> WebViewCoordinator {
        store?.coordinator
            ?? WebViewCoordinator(
                place: place, sharesName: sharesName, usesDevice: usesDevice, pageRoot: pageRoot)
    }

    func makeUIView(context: Context) -> WKWebView {
        store?.webView ?? context.coordinator.makeWebView()
    }

    /// A stored page goes back to its parking place once its screen has
    /// let it go.
    static func dismantleUIView(_ view: WKWebView, coordinator: WebViewCoordinator) {
        // A page the scene dropped (another place, #758) must not write into
        // the shared `PageModel`. A stored page (the iPhone's) is only
        // parked: its coordinator keeps its model.
        if coordinator.park == nil {
            coordinator.page = nil
        }
        // After SwiftUI has taken the screen's views out of the window, and
        // again once a pop's animation is surely over; the list's
        // `onAppear` parks it too.
        DispatchQueue.main.async { coordinator.park?() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { coordinator.park?() }
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.update(place: place, pageRoot: pageRoot, sharesName: sharesName)
        context.coordinator.page = page
        context.coordinator.onOpenFile = onOpenFile
        context.coordinator.load(url, in: view)
    }
}
#endif

#if os(iOS)
/// One page that outlives the views showing it. On the iPhone the notebook
/// is pushed onto the folder list and popped off it again (#209); the page,
/// its state and the app's commands go on while the list shows, so popping
/// doesn't reload it and the list can read `PageModel` and open notebooks.
///
/// WebKit suspends a web view that is in no window (see `KernelHost`), so
/// while the notebook screen isn't showing, the web view waits in
/// `parking`, a hidden view behind the list (`ParkedPage`).
@MainActor
final class WebViewStore {
    /// Where the page's notebooks live (#701, #758). Fixed, as the
    /// coordinator's: another place gets a store of its own.
    let place: Place
    /// Whether the page gets the person's name (#842): the machine's
    /// remote's setting when the page is made. A later change goes through
    /// the coordinator's `update(sharesName:)`.
    let sharesName: Bool
    /// Whether the page may use this device's `device` API (#877): the
    /// machine's remote's setting when the page is made. Its handlers are
    /// fixed then, so a later change waits for the next page.
    let usesDevice: Bool

    init(place: Place = .thisDevice, sharesName: Bool, usesDevice: Bool) {
        self.place = place
        self.sharesName = sharesName
        self.usesDevice = usesDevice
    }

    private(set) lazy var coordinator: WebViewCoordinator = {
        let coordinator = WebViewCoordinator(place: place, sharesName: sharesName, usesDevice: usesDevice)
        coordinator.park = { [weak self] in self?.park() }
        return coordinator
    }()
    /// Made on first use; `retire` leaves one that was never made alone.
    private var made: WKWebView?
    var webView: WKWebView {
        if let made { return made }
        let view = coordinator.makeWebView(keepRunning: true)
        made = view
        return view
    }
    /// Holds the web view while no screen shows it. Lazy, like the rest:
    /// `@State` makes a store on every `ContentView` init and keeps only
    /// the first (#357).
    private(set) lazy var parking: UIView = {
        let view = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        view.alpha = 0
        view.isUserInteractionEnabled = false
        return view
    }()

    /// Loads the page off screen, if it isn't already.
    func load(_ url: URL, page: PageModel, onOpenFile: @escaping (String) -> Void) {
        let view = webView
        // After the view exists: setting `page` hands it the view.
        coordinator.page = page
        coordinator.onOpenFile = onOpenFile
        coordinator.load(url, in: view)
        park()
    }

    /// The server stopped (a restart reuses its port, so the page's URL
    /// comes back the same): the next `load` loads the page again. The
    /// window's `PageModel.reset(forStart:)` makes its commands wait.
    func forget() {
        coordinator.forget()
    }

    /// The scene shows another place (#758): this store's page stops, and
    /// nothing it posts reaches the window's `PageModel` any more. The
    /// store is dropped by the caller.
    func retire() {
        // A store whose page was never made has nothing to stop.
        guard let view = made else { return }
        coordinator.page = nil
        coordinator.onOpenFile = nil
        view.stopLoading()
        view.removeFromSuperview()
    }

    /// Puts the web view back in `parking` when no screen in the window
    /// holds it.
    func park() {
        guard webView.window == nil || webView.superview == nil else { return }
        parking.addSubview(webView)
    }
}

/// The hidden view behind the iPhone's list that keeps its page in the
/// window (`WebViewStore.parking`).
struct ParkedPage: UIViewRepresentable {
    let store: WebViewStore

    func makeUIView(context: Context) -> UIView { store.parking }
    func updateUIView(_ view: UIView, context: Context) {}
}
#endif

#if os(macOS)
/// The windows that show a notebook page, for the Settings window's
/// Agent tab (#332), which asks a page for the agent's settings.
@MainActor
enum NotebookWindows {
    /// Every notebook page's model.
    static let pages = NSHashTable<PageModel>.weakObjects()

    /// The page of the frontmost window showing a notebook page, if any.
    static var frontPage: PageModel? {
        let shown = pages.allObjects.filter { $0.webView?.window != nil }
        for window in NSApp.orderedWindows {
            if let page = shown.first(where: { $0.webView?.window === window }) { return page }
        }
        return nil
    }
}
#endif

@MainActor
final class WebViewCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    /// The app's page loads: which URL for which server start (#640).
    private var loads = PageLoads()
    /// The page's URL, the in-app server's.
    private var loaded: URL? { loads.url }
    private weak var webView: WKWebView?
    private let agentKeys = AgentKeys(secrets: KeychainStore())
    private var urlObservation: NSKeyValueObservation?
    /// Where this window's notebooks live. Fixed for the window's life: a
    /// machine's window never becomes a local one, so what it was given
    /// (or not given) at creation can't be undone by a later load. What a
    /// page may ask the app for follows this, never its origin, which a
    /// machine's page shares with this device's (#701). A this-Mac window
    /// whose verified server is gone becomes a machine's here (#883),
    /// without the web view being made again.
    private(set) var place: Place
    /// Whether the page gets the person's name (#842): always on this
    /// device; on a machine, its remote's setting. On this device it is
    /// ignored; a change reaches the open page through `update`.
    private(set) var sharesName: Bool
    /// Whether a machine's notebooks may use this device's `device` API
    /// (#877): its remote's setting when the window was made. Fixed, as
    /// the place is: the handlers are registered with the web view, so a
    /// later change applies to the machine's windows opened after it.
    let usesDevice: Bool
    /// The folder the window's page paths are from (#883): this Mac's own
    /// server's `root_dir` in its window, the app server's root in every
    /// other, since the page's paths are from it.
    private(set) var pageRoot: PageRoot
    /// The page's own settings, as `Place` takes them (#842, #877). On this
    /// device both are ignored.
    private var settings: PlaceSettings { PlaceSettings(sharesName: sharesName, usesDevice: usesDevice) }
    var onNavigate: ((URL?) -> Void)?
    var onOpenFile: ((String) -> Void)?
    /// The page's `openTab` message (#729). Only the Mac's windows set it,
    /// and only they register the handler.
    var onOpenTab: ((TabRequest) -> Void)?
    /// A load committed (#883): the Mac window reads its place again.
    var onLoad: (() -> Void)?

    init(place: Place = .thisDevice, sharesName: Bool, usesDevice: Bool, pageRoot: PageRoot? = nil) {
        self.place = place
        self.sharesName = sharesName
        self.usesDevice = usesDevice
        // The app's own server's root, which this device's page paths are
        // from, until the window passes its own (#883).
        self.pageRoot = pageRoot ?? PageRoot(url: AppModel.shared.serverRootFolder)
        super.init()
    }

    /// What the window passes each time it lays the page out: its place
    /// (#883), the folder its page paths are from, and whether the page gets
    /// the person's name (#842). A downgrade — this Mac's own server is gone
    /// — applies here and now: the page's elevated handlers go and what it
    /// asks next answers as a machine's window's would, without the web view
    /// being made again, so the page keeps what it has open and its unsaved
    /// edits. An upgrade, and the window's identity, wait for its next load.
    /// A change of the name setting alone reloads the page, when it changes
    /// whether the page gets it; its commands wait for the reloaded page.
    func update(place new: Place, pageRoot root: PageRoot, sharesName name: Bool) {
        if place != new {
            // A downgrade is the page's to take now. Anything else is
            // another web view's: this one keeps the place, and the
            // handlers, it has.
            guard place.takesInPlace(new) else { return }
            place = new
            pageRoot = root
            sharesName = name
            if let view = webView { downgrade(view) }
            return
        }
        let nameBefore = place.allows(.personName, settings)
        pageRoot = root
        sharesName = name
        guard place.allows(.personName, settings) != nameBefore,
              PersonName.name != nil, let view = webView, loaded != nil
        else { return }
        Self.installPageScripts(on: view, loaded: loaded, place: place, settings: settings)
        page?.reset(forStart: AppModel.shared.serverStart)
        view.reload()
    }

    /// The window's trust was dropped (#883): this Mac's own server is gone,
    /// so the page's ledger, the kernel relay and the full device bridge go
    /// with it, and the page gets what a machine's window gets: the device
    /// API only with the remote's "use this device" setting on (#877), its
    /// dialogs naming the machine and a clipboard read asking first. The web view is not made again: a window made again would load
    /// the page again, and its unsaved edits would go with it. The window's
    /// identity changes on its next load instead.
    private func downgrade(_ view: WKWebView) {
        kernels.downgrade(
            to: view, place: place, settings: settings,
            asker: place.asker { AppModel.shared.machineName($0) })
        Self.installPageScripts(on: view, loaded: loaded, place: place, settings: settings)
    }
    #if os(iOS)
    /// Puts a stored page back where it waits off screen (`WebViewStore`).
    var park: (() -> Void)?
    #endif
    var page: PageModel? {
        didSet {
            page?.webView = webView
            #if os(macOS)
            if let page { NotebookWindows.pages.add(page) }
            #endif
        }
    }
    #if os(macOS)
    var document: PageDocument? {
        didSet { document?.webView = webView }
    }
    #endif
    /// The page's side of the app's kernels and `device` (ganymede-ui#99).
    private let kernels = KernelHost()
    private var codeFontObserver: CodeFontObserver?
    #if os(iOS)
    /// Where each download is written before the share sheet offers it.
    private var destinations: [ObjectIdentifier: URL] = [:]
    #endif

    /// Every user script the page gets, replacing any already there: add
    /// a new one here, since a code font change reinstalls them all.
    /// `loaded`: the page's URL, the in-app server's, whose origin alone
    /// gets the person's name. `settings`: the window's, for whether a
    /// machine's window gets the name (#842) and what else a place grants
    /// it (#877).
    private static func installPageScripts(
        on view: WKWebView, loaded: URL?, place: Place, settings: PlaceSettings
    ) {
        let scripts = view.configuration.userContentController
        scripts.removeAllUserScripts()
        // The page's error reports follow the app's choice (#318, #319).
        scripts.addUserScript(CrashReports.shared.pageScript)
        // The code font (#354), before the page loads.
        scripts.addUserScript(CodeFont.pageScript)
        // The person's name for the notebook rooms (#606): a machine's
        // window only when its remote's setting says so (#842).
        if let script = PersonName.pageScript(for: loaded, place: place, settings: settings) {
            scripts.addUserScript(script)
        }
    }

    /// `keepRunning`: the page runs at full speed while it isn't visible
    /// (the iPhone's page while its list shows, #209).
    func makeWebView(keepRunning: Bool = false) -> WKWebView {
        let config = WKWebViewConfiguration()
        if keepRunning {
            config.preferences.inactiveSchedulingPolicy = .none
        }
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = self
        view.uiDelegate = self
        webView = view
        // What this window's place gets (`Place.handlerNames`, #701, #877).
        let names = place.handlerNames(settings)
        // The device bridge, ledger prompts and Shortcuts: this device's
        // windows get them all, a machine's the remote subset alone, every
        // dialog naming the machine (#877).
        kernels.attach(
            to: view, place: place, settings: settings,
            asker: place.asker { AppModel.shared.machineName($0) })
        urlObservation = view.observe(\.url, options: [.new]) { [weak self] _, change in
            let url = change.newValue ?? nil
            Task { @MainActor in self?.onNavigate?(url) }
        }
        Self.installPageScripts(on: view, loaded: loaded, place: place, settings: settings)
        // The code font (#354) as it changes: a reload must get the new
        // setting too, so the scripts are installed again.
        codeFontObserver = observeCodeFont(markdown: true) { [weak self, weak view] in
            guard let view else { return }
            guard let self else { return }
            Self.installPageScripts(on: view, loaded: self.loaded, place: self.place, settings: self.settings)
            view.evaluateJavaScript(CodeFont.updateScript, completionHandler: nil)
        }
        let handlers = view.configuration.userContentController
        // The page's sidebar opens text files in the app's editor (#122).
        if names.contains("openFile") { handlers.add(OpenFileHandler(self), name: "openFile") }
        // What the page shows, for native toolbars and menus (#205).
        if names.contains("state") { handlers.add(StateHandler(self), name: "state") }
        // The agent's API keys, in the Keychain (#166).
        if names.contains("agentKeys") {
            handlers.addScriptMessageHandler(
                AgentKeysHandler(self), contentWorld: .page, name: "agentKeys"
            )
        }
        // The page's Settings, Keyboard Shortcuts and Connect open the
        // app's Settings at a tab (#332).
        if names.contains("settings") { handlers.add(SettingsHandler(self), name: "settings") }
        #if os(macOS)
        if names.contains("document") { handlers.add(DocumentHandler(self), name: "document") }
        // Notebooks, data files and DuckDB consoles open as tabs (#729).
        if names.contains("openFile") { handlers.add(OpenTabHandler(self), name: "openTab") }
        #endif
        // Safari's Web Inspector can attach (Develop menu).
        view.isInspectable = true
        return view
    }

    /// The next `load` loads even the same URL: the server restarted.
    func forget() {
        loads.forget()
    }

    /// Loads `url` when it changed, or the server restarted.
    func load(_ url: URL, in view: WKWebView) {
        let start = AppModel.shared.serverStart
        guard loads.shouldLoad(url, start: start) else { return }
        startLoad(url, start: start, in: view)
    }

    private func startLoad(_ url: URL, start: Int, in view: WKWebView) {
        // The person's name, for this server's origin only (#606).
        Self.installPageScripts(on: view, loaded: url, place: place, settings: settings)
        // The ledger keeps notebooks by absolute path (#383): this device's,
        // and this Mac's own server's under its `root_dir` (#883), since
        // those notebooks are this Mac's too. A machine's aren't (#877).
        if place.allows(.deviceLedger, settings) {
            kernels.notebookRoot = pageRoot.url
        }
        // The page a machine's kernel calls must come from, and what it
        // asked goes when it loads again (#877). This device's windows
        // always; a machine's when its setting says so.
        if place.tracksPageURL(settings) { kernels.uiWillLoad(url) }
        PageModel.startLoad({ view.load(URLRequest(url: url)) }, on: page, start: start)
    }

    /// The app's load failed before it committed: loaded again, so the
    /// page can still become ready for this start (#640). Each time
    /// another navigation, such as the old page reloading, cancelled it;
    /// once when the server didn't answer.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let cancelled = (error as NSError).domain == NSURLErrorDomain && (error as NSError).code == NSURLErrorCancelled
        guard page?.loadFailed(navigation) == true, let again = loads.retry(cancelled: cancelled) else { return }
        startLoad(again.url, start: again.start, in: webView)
    }

    /// A reload or another page: the old page's remote `device` calls go
    /// with it. Its kernels are the server's and keep running.
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if place.allows(.deviceRemote, settings) { kernels.reset() }
        // The new page takes commands once it has posted its state.
        page?.committed(navigation)
        // A load of this window's page: the place it was loaded with is
        // read again (#883), so a check that verified its machine applies
        // here, on this load.
        onLoad?()
    }

    /// The UI page's process died: its dialogs and sounds for server
    /// kernels have no one to answer.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if place.allows(.deviceRemote, settings) { kernels.uiPageEnded() }
    }

    /// Links to other hosts open in the default browser.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.shouldPerformDownload {
            // `<a download>`, including the blob: and data: links outputs
            // and widgets make for files.
            decisionHandler(.download)
        } else if navigationAction.targetFrame?.isMainFrame ?? true,
                  let target = navigationAction.request.url, !isExternal(target),
                  Self.isWebURL(target), !place.allowsLoading(target) {
            // A window never becomes another place's page (#842): its handlers
            // and the person's name are its own place's.
            decisionHandler(.cancel)
        } else if let target = navigationAction.request.url, isExternal(target) {
            // A link (#868): a machine's app link is the machine's, read
            // there and only when it was clicked, never by this device's
            // `AppURL`, whose commands act on this Mac; a web link goes to
            // the browser, and a navigation nothing clicked loads here.
            switch place.linkAction(
                for: target, clicked: navigationAction.navigationType == .linkActivated
            ) {
            case .allow:
                decisionHandler(.allow)
            case .cancel:
                decisionHandler(.cancel)
            case .openExternally:
                openExternally(target)
                decisionHandler(.cancel)
            case .openOnMachine(let path):
                page?.run("open", arg: path)
                decisionHandler(.cancel)
            case .refuse:
                showMachineLinkNotice()
                decisionHandler(.cancel)
            }
        } else {
            decisionHandler(.allow)
        }
    }

    /// Responses WebKit can't show, or that ask to be saved, download.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        let disposition = (navigationResponse.response as? HTTPURLResponse)?
            .value(forHTTPHeaderField: "Content-Disposition") ?? ""
        if !navigationResponse.canShowMIMEType
            || disposition.lowercased().hasPrefix("attachment") {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    #if os(macOS)
    /// Asks where to save, as Safari does with "Ask for each download".
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        let done: (NSApplication.ModalResponse) -> Void = { result in
            guard result == .OK, let url = panel.url else {
                completionHandler(nil)
                return
            }
            // The panel already asked to replace it; WebKit won't overwrite.
            try? FileManager.default.removeItem(at: url)
            completionHandler(url)
        }
        if let window = webView?.window {
            panel.beginSheetModal(for: window, completionHandler: done)
        } else {
            done(panel.runModal())
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        // Cancelling the save panel ends the download this way too.
        if (error as? URLError)?.code == .cancelled { return }
        let alert = NSAlert(error: error)
        alert.messageText = "The download failed."
        alert.informativeText = error.localizedDescription
        alert.runModal()
    }
    #else
    /// iOS has no save panel: write to a temporary folder, then offer the
    /// file in the share sheet (Save to Files, AirDrop, other apps).
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("Downloads", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            completionHandler(nil)
            return
        }
        let url = folder.appendingPathComponent(suggestedFilename)
        destinations[ObjectIdentifier(download)] = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = destinations.removeValue(forKey: ObjectIdentifier(download)),
              let webView else { return }
        let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = webView
        share.popoverPresentationController?.sourceRect = CGRect(
            x: webView.bounds.midX, y: webView.bounds.midY, width: 0, height: 0)
        share.completionWithItemsHandler = { _, _, _, _ in
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
        }
        present(share, from: webView) {}
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinations.removeValue(forKey: ObjectIdentifier(download))
        guard (error as? URLError)?.code != .cancelled, let webView else { return }
        let alert = UIAlertController(
            title: "The download failed.", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, from: webView) {}
    }
    #endif

    /// `window.open` and `target="_blank"`: the browser for other hosts,
    /// this view for the server's own pages. A link that is the page's own
    /// server's, or this Mac's own server's relative `open`, shows its
    /// notebook in this window, as a click does (#868, #883): the page
    /// asked for a window, and it gets none, so it can't be the way round
    /// `decidePolicyFor` and into this device's `AppURL`.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let target = navigationAction.request.url {
            if isExternal(target) {
                switch place.newWindowAction(for: target) {
                case .openOnMachine(let path):
                    page?.run("open", arg: path)
                case .refuse:
                    showMachineLinkNotice()
                case .openExternally:
                    openExternally(target)
                case .allow, .cancel:
                    // Nothing is loaded: an external link is one of the
                    // three above, and a new window is not this view's.
                    break
                }
            } else if place.isMachine, Self.isWebURL(target), !place.allowsFollowing(target) {
                // As in `decidePolicyFor`: not one of this device's pages.
            } else {
                webView.load(navigationAction.request)
            }
        }
        return nil
    }

    nonisolated private static func isWebURL(_ url: URL) -> Bool {
        ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    }

    private func isExternal(_ url: URL) -> Bool {
        guard let host = loaded?.host, let port = loaded?.port else { return true }
        return !(url.host == host && url.port == port) && url.scheme != "about"
            && url.scheme != "blob" && url.scheme != "data"
    }

    private func openExternally(_ url: URL) {
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }

    /// Says a link in a machine's window names a file elsewhere (#868), in
    /// a sheet on this window rather than one the app runs modally, so the
    /// window it belongs to is the one that shows it.
    private func showMachineLinkNotice() {
        let message = "This link names a file on another computer."
        #if os(macOS)
        guard let window = webView?.window else { return }
        let alert = NSAlert()
        alert.messageText = message
        alert.beginSheetModal(for: window)
        #else
        guard let view = webView else { return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, from: view) {}
        #endif
    }

    #if os(macOS)
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
    }
    #else
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, from: webView, orElse: completionHandler)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, from: webView) { completionHandler(false) }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text ?? "")
        })
        present(alert, from: webView) { completionHandler(nil) }
    }

    /// Shows `controller` over the view controller holding `webView`;
    /// calls `fallback` when there is none, since WebKit requires the
    /// handler.
    private func present(_ controller: UIViewController, from webView: WKWebView, orElse fallback: () -> Void) {
        var top = webView.window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        if let top {
            top.present(controller, animated: true)
        } else {
            fallback()
        }
    }
    #endif
}

extension WebViewCoordinator {
    /// The page's `openFile` message, `{ path: string }`. Only the page
    /// itself may send it: output frames see the same handlers.
    func received(openFile message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let fields = message.body as? [String: Any], let path = fields["path"] as? String,
              !path.isEmpty
        else { return }
        onOpenFile?(path)
    }
}

/// The `openFile` handler; weak, since the content controller keeps its
/// handlers.
private final class OpenFileHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        coordinator?.received(openFile: message)
    }
}

#if os(macOS)
extension WebViewCoordinator {
    /// The page's `openTab` message (#729): `{ path }` for a notebook or
    /// data file, `{ console: "duckdb", folder }` for a new DuckDB console,
    /// by server paths (`TabRequest`). Only the page itself may send it:
    /// output frames see the same handlers.
    func received(openTab message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let request = TabRequest(body: message.body) else { return }
        onOpenTab?(request)
    }
}

/// The `openTab` handler; weak, since the content controller keeps its
/// handlers.
private final class OpenTabHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        coordinator?.received(openTab: message)
    }
}
#endif

extension WebViewCoordinator {
    /// The page's `agentKeys` message (#166). Only the page the app loaded
    /// may read or set keys: not output frames, and not another site.
    func received(
        agentKeys message: WKScriptMessage, reply: @escaping (Any?, String?) -> Void
    ) {
        let origin = message.frameInfo.securityOrigin
        guard AgentKeys.trusted(
            isMainFrame: message.frameInfo.isMainFrame,
            scheme: origin.protocol, host: origin.host, port: origin.port,
            page: loaded
        ) else {
            reply(nil, AgentKeys.Failure.notThePage.localizedDescription)
            return
        }
        do {
            reply(try agentKeys.handle(message.body), nil)
        } catch {
            reply(nil, error.localizedDescription)
        }
    }
}

/// The `agentKeys` handler, which answers each message; weak, since the
/// content controller keeps its handlers.
private final class AgentKeysHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let coordinator else {
            replyHandler(nil, "the window is closing")
            return
        }
        coordinator.received(agentKeys: message, reply: replyHandler)
    }
}

extension WebViewCoordinator {
    /// The page's `state` message. Only the page itself may send it.
    func received(state message: WKScriptMessage) {
        if message.frameInfo.isMainFrame, let state = PageState(body: message.body) {
            page?.update(state)
        }
    }
}

extension WebViewCoordinator {
    /// The page's `settings` message: a `SettingsTab` to show. Only the
    /// page itself may send it, not an output's frame.
    func received(settings message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let tab = SettingsTab(message: message.body) else { return }
        NotificationCenter.default.post(name: .showAppSettings, object: page, userInfo: ["tab": tab])
    }
}

/// The `settings` handler; weak, since the content controller keeps its
/// handlers.
private final class SettingsHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        coordinator?.received(settings: message)
    }
}

/// The `state` handler; weak, since the content controller keeps its
/// handlers.
private final class StateHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        coordinator?.received(state: message)
    }
}

#if os(macOS)
extension WebViewCoordinator {
    /// The page's `document` message: its notebook and unsaved edits. Only
    /// the page itself may send it.
    func received(document message: WKScriptMessage) {
        // This Mac's own server's notebooks are this Mac's, under its
        // `root_dir` (#883), so Recents and Spotlight keep them: the same
        // folder the ledger keeps them under (`pageRoot`).
        if message.frameInfo.isMainFrame,
           let update = DocumentMessage(body: message.body, root: pageRoot.url, place: place) {
            document?.update(update, in: place)
        }
    }
}

/// The `document` handler; weak, since the content controller keeps its
/// handlers.
private final class DocumentHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        coordinator?.received(document: message)
    }
}
#endif
