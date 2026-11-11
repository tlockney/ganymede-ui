#if os(macOS)
import AppKit
import OSLog

/// Does what a `ganymede://` URL asks (#303). The app delegate passes it
/// the Get URL Apple Event's URLs, at launch too.
///
/// `open` and `new` need no yes: they only show or create a notebook.
/// `run` runs code, and any app or web page can open a URL, so the first
/// run of each notebook asks, with "Always allow" (`URLRunPermissions`).
///
/// Without x-callback-url, `run` opens the notebook, so its window shows
/// the outputs arrive, and an error shows in an alert. With it, the
/// answer goes to `x-success` (`status`, `output`), `x-error`
/// (`errorCode`, `errorMessage`) or `x-cancel`, and no window opens.
@MainActor
enum AppURLHandler {
    private static let log = Logger(subsystem: "com.ganymede-server.Ganymede", category: "url")

    /// The URL string from a Get URL Apple Event.
    nonisolated static func url(in event: NSAppleEventDescriptor) -> URL? {
        event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue.flatMap(URL.init(string:))
    }

    static func handle(_ url: URL) {
        log.notice("url: \(url.host ?? "", privacy: .public)")
        let request: AppURL
        do {
            request = try AppURL(url)
        } catch {
            fail(error, callback: callbackOnly(url))
            return
        }
        Task { await perform(request) }
    }

    private static func perform(_ request: AppURL) async {
        let callback = request.callback
        do {
            let items = try await run(request)
            if let success = callback?.success {
                NSWorkspace.shared.open(AppURL.adding(items, to: success))
            }
        } catch AppURLError.cancelled where callback?.cancel != nil {
            if let cancel = callback?.cancel { NSWorkspace.shared.open(cancel) }
        } catch {
            fail(error, callback: callback)
        }
    }

    /// Does the command; returns what `x-success` gets.
    private static func run(_ request: AppURL) async throws -> [URLQueryItem] {
        let model = AppModel.shared
        let root = model.serverRootFolder
        let home = FileManager.default.homeDirectoryForCurrentUser
        switch request.command {
        case .open(let path):
            let url = AppURL.fileURL(path, root: root, home: home)
            guard FileManager.default.fileExists(atPath: url.path) else { throw NotebookActionError.notFound(path) }
            IntentServer.open(url)
            return []

        case .new(let dir, let name, let template):
            let folder = AppURL.fileURL(dir, root: root, home: home)
            let templateURL = template.map { AppURL.fileURL($0, root: root, home: home) }
            let actions = try await IntentServer.actions()
            let created = try await actions.notebookNew(
                dir: try IntentServer.path(folder), name: name,
                template: try templateURL.map(IntentServer.path)
            )
            let url = IntentServer.url(created)
            IntentServer.open(url)
            return [URLQueryItem(name: "path", value: url.path)]

        case .run(let path, let cell, let restart, let timeout):
            let url = AppURL.fileURL(path, root: root, home: home)
            guard FileManager.default.fileExists(atPath: url.path) else { throw NotebookActionError.notFound(path) }
            let apiPath = try IntentServer.path(url)
            try confirm(url, cell: cell)
            // A link run with no caller to answer shows the notebook.
            if request.callback == nil { IntentServer.open(url) }
            let actions = try await IntentServer.actions()
            let cells: [NotebookCell]
            if let cell {
                cells = try await actions.cellRun(path: apiPath, cell: cell, timeout: timeout)
            } else {
                cells = try await actions.notebookRunAll(path: apiPath, restart: restart, timeout: timeout)
            }
            return [
                URLQueryItem(name: "status", value: "ok"),
                URLQueryItem(name: "output", value: AppURL.outputText(cells)),
            ]
        }
    }

    /// Asks before a URL first runs a notebook; throws `cancelled` on no.
    private static func confirm(_ url: URL, cell: String?) throws {
        let permissions = URLRunPermissions.shared
        if permissions.allows(url) { return }
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Run “\(url.lastPathComponent)” from a link?"
        let what = cell.map { "the cell “\($0)” of" } ?? "every code cell of"
        alert.informativeText = "A link asked Ganymede to run \(what) this notebook:\n\n\(url.path)\n\n"
            + "Any app or web page can open a link. Run it only if you trust where the link came from."
        alert.addButton(withTitle: "Run")
        alert.addButton(withTitle: "Cancel")
        alert.showsSuppressionButton = true
        alert.suppressionButton?.title = "Always allow links to run this notebook"
        guard alert.runModal() == .alertFirstButtonReturn else { throw AppURLError.cancelled }
        if alert.suppressionButton?.state == .on { permissions.allow(url) }
    }

    private static func fail(_ error: Error, callback: AppURL.Callback?) {
        log.error("url failed: \(error.localizedDescription, privacy: .private)")
        if let target = callback?.error {
            NSWorkspace.shared.open(AppURL.adding(AppURL.errorItems(error), to: target))
            return
        }
        // With a callback but no x-error, the caller asked not to hear of it.
        if callback != nil { return }
        if case AppURLError.cancelled = error { return }
        NSApp.activate()
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Ganymede couldn’t open the link"
        alert.informativeText = error.localizedDescription
        alert.runModal()
    }

    /// The x-callback answers of a URL that didn't parse, so a bad route
    /// or parameter still reaches `x-error`.
    private static func callbackOnly(_ url: URL) -> AppURL.Callback? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.host?.lowercased() == "x-callback-url"
        else { return nil }
        let items = parts.queryItems ?? []
        func link(_ name: String) -> URL? {
            items.last { $0.name == name }?.value.flatMap(URL.init(string:)).flatMap { $0.scheme == nil || $0.isFileURL ? nil : $0 }
        }
        return AppURL.Callback(success: link("x-success"), error: link("x-error"), cancel: link("x-cancel"))
    }
}
#endif
