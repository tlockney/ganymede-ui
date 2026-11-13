#if os(macOS)
import AppKit
import OSLog

/// Does what a `ganymede://` URL asks (#303). The app delegate passes it
/// the Get URL Apple Event's URLs, at launch too.
///
/// `open` needs no yes: it only shows a notebook. `run` runs code, and
/// any app or web page can open a URL, so the first run of each notebook
/// asks, with "Always allow" (`URLRunPermissions`), before it looks for
/// the file, so a page can't learn whether a file exists (#586). `new`
/// writes a file, so it asks unless the folder and template are in
/// Settings' folders.
///
/// Shortcuts' run actions ask the same way (`confirmRun`), kept apart
/// from links by their destination.
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
            // Under the server root, as `new` and `run` are (the Mac serves `/`).
            _ = try IntentServer.path(url)
            IntentServer.open(url)
            return []

        case .new(let dir, let name, let template):
            let folder = AppURL.fileURL(dir, root: root, home: home)
            let templateURL = template.map { AppURL.fileURL($0, root: root, home: home) }
            if AppURL.newNeedsConfirmation(folder: folder, template: templateURL, trusted: SpotlightSettings.shared.folders) {
                try confirmNew(in: folder, name: name, template: templateURL)
            }
            let actions = try await IntentServer.actions()
            let created = try await actions.notebookNew(
                dir: try IntentServer.path(folder), name: name,
                template: try templateURL.map(IntentServer.path)
            )
            let url = IntentServer.url(created)
            IntentServer.open(url)
            return [URLQueryItem(name: "path", value: url.path)]

        case .run(let path, let cell, let restart, let timeout, let params):
            let url = AppURL.fileURL(path, root: root, home: home)
            // The yes first: a missing file and a refused one look alike
            // to the page that sent the link.
            try confirmRun(url, cell: cell, params: params, sendingTo: request.callback?.destination, from: .link)
            guard FileManager.default.fileExists(atPath: url.path) else { throw NotebookActionError.notFound(path) }
            let apiPath = try IntentServer.path(url)
            if let params {
                // A fresh kernel with the parameters (ganymede#652): the
                // notebook's window, if open, is left alone.
                let result = try await IntentServer.actions()
                    .notebookRunWithParams(path: apiPath, params: params, timeout: timeout)
                if result.status != "ok" {
                    throw NotebookActionError.runFailed(result.error ?? "no message")
                }
                if request.callback == nil { showResults(of: url, result.results) }
                return [
                    URLQueryItem(name: "status", value: "ok"),
                    URLQueryItem(name: "results", value: result.results),
                ]
            }
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

    /// What asked to run a notebook.
    enum RunSource {
        case link, shortcut
    }

    /// Asks before a link or a Shortcuts action first runs a notebook,
    /// saying where its output goes; throws `cancelled` on no. Always
    /// allow covers that notebook with that destination only.
    static func confirmRun(_ url: URL, cell: String?, params: String?, sendingTo destination: String?, from source: RunSource) throws {
        let permissions = URLRunPermissions.shared
        if permissions.allows(url, sendingTo: destination, withParameters: params != nil) { return }
        NSApp.activate()
        let alert = NSAlert()
        let what = cell.map { "the cell “\($0)” of" } ?? "every code cell of"
        var text: String
        switch source {
        case .link:
            alert.messageText = "Run “\(url.lastPathComponent)” from a link?"
            text = "A link asked Ganymede to run \(what) this notebook:\n\n\(url.path)\n\n"
        case .shortcut:
            alert.messageText = "Run “\(url.lastPathComponent)” from a Shortcut?"
            text = "A Shortcut asked Ganymede to run \(what) this notebook:\n\n\(url.path)\n\n"
        }
        if let params {
            text += "With parameters \(params), in a new kernel.\n\n"
        }
        if source == .link, let destination {
            text += "Its output will be sent to \(destination).\n\n"
        }
        alert.informativeText = text + (source == .link
            ? "Any app or web page can open a link. Run it only if you trust where the link came from."
            : "The Shortcut gets its output. Run it only if you trust the Shortcut.")
        alert.addButton(withTitle: "Run")
        alert.addButton(withTitle: "Cancel")
        alert.showsSuppressionButton = true
        let allowed = params == nil ? "run this notebook" : "run this notebook with any parameters"
        switch source {
        case .link:
            alert.suppressionButton?.title = destination.map { "Always allow links to \(allowed) and send its output to \($0)" }
                ?? "Always allow links to \(allowed)"
        case .shortcut:
            alert.suppressionButton?.title = "Always allow Shortcuts to \(allowed)"
        }
        guard alert.runModal() == .alertFirstButtonReturn else { throw AppURLError.cancelled }
        if alert.suppressionButton?.state == .on {
            permissions.allow(url, sendingTo: destination, withParameters: params != nil)
        }
    }

    /// Asks before a `new` link writes a notebook outside Settings'
    /// folders, naming the folder and template; throws `cancelled` on no.
    private static func confirmNew(in folder: URL, name: String?, template: URL?) throws {
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Create a notebook from a link?"
        var text = "A link asked Ganymede to create \(name.map { "“\($0)”" } ?? "a notebook") in:\n\n\(folder.path)\n\n"
        if let template {
            text += "As a copy of:\n\n\(template.path)\n\n"
        }
        alert.informativeText = text
            + "Any app or web page can open a link. Links that write into the folders under Settings › General › Spotlight, from a template there, don’t ask."
        alert.addButton(withTitle: "Create")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { throw AppURLError.cancelled }
    }

    /// A plain link's parameterized run has no window to show it: its
    /// named results go in an alert.
    private static func showResults(of url: URL, _ results: String) {
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "“\(url.lastPathComponent)” ran"
        alert.informativeText = results == "{}" ? "It published no named results." : "Named results:\n\n\(results)"
        alert.runModal()
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
