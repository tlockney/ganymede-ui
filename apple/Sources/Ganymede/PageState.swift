import Foundation

/// What the page posts to the app's `state` message handler whenever it
/// changes (ganymede-ui's `src/lib/native.ts`, `PageState`, #205): enough
/// for native toolbars and menus to show and enable themselves.
struct PageState: Decodable, Equatable {
    struct Kernel: Decodable, Equatable, Hashable {
        var name: String
        var displayName: String
    }

    struct Backend: Decodable, Equatable {
        var label: String
        var detail: String
    }

    /// A notebook with a running kernel on the page's backend (#225).
    struct Session: Decodable, Equatable, Identifiable {
        var id: String
        /// The notebook's server path.
        var path: String
        /// The kernel's display name.
        var kernel: String?
        /// The kernel's execution state as the server last reported it.
        var state: String?
        /// The kernel's id; absent from a page older than #248.
        var kernelID: String?

        enum CodingKeys: String, CodingKey {
            case id, path, kernel, state
            case kernelID = "kernelId"
        }

        /// The notebook's name without `.ipynb`.
        var title: String {
            let name = path.split(separator: "/").last.map(String.init) ?? path
            return name.hasSuffix(".ipynb") ? String(name.dropLast(6)) : name
        }
    }

    /// The app's sidebar search and what it found (#240).
    struct Search: Decodable, Equatable {
        struct Match: Decodable, Equatable, Identifiable {
            var path: String
            var name: String
            var type: String
            /// The line that matched, for a content match.
            var snippet: String?

            var id: String { path + "\n" + (snippet ?? "") }
            var isNotebook: Bool { type == "notebook" }
            var isDirectory: Bool { type == "directory" }
            /// The name without `.ipynb`.
            var title: String { isNotebook && name.hasSuffix(".ipynb") ? String(name.dropLast(6)) : name }
            /// The folder it is in, for the row's second line; "" at the root.
            var folder: String {
                guard let slash = path.lastIndex(of: "/") else { return "" }
                return String(path[..<slash])
            }
        }

        var query: String
        var matches: [Match]
        var searching: Bool
        /// A limit stopped the search short.
        var truncated: Bool
        var error: String?
        /// Whether a file that isn't a notebook opens in the app's editor:
        /// only from the app's own server.
        var opensFiles: Bool?

        /// Whether tapping `match` opens it.
        func opens(_ match: Match) -> Bool {
            match.isNotebook || (!match.isDirectory && opensFiles == true)
        }
    }

    /// A heading of the open notebook, for the Outline (#212).
    struct Heading: Decodable, Equatable {
        /// 1 to 6, as `#` to `######`.
        var level: Int
        var text: String
        /// The index of the cell it is in: the `go-to-cell` command's argument.
        var cell: Int
    }

    /// The kernel's variables, as the inspector's Variables view shows
    /// them (#249): rows in order, members under their object.
    struct Variables: Decodable, Equatable {
        struct Row: Decodable, Equatable, Identifiable {
            var name: String
            var type: String
            var value: String
            /// Its names from the top: the `toggle-variable` command's argument.
            var path: [String]
            var depth: Int
            var expandable: Bool
            var expanded: Bool

            var id: String { path.joined(separator: "\u{0}") }
        }

        /// `no-kernel`, `unsupported`, `loading`, `error` or `ready`.
        var state: String
        var message: String?
        var rows: [Row]
    }

    /// The `toggle-variable` command's argument: `row`'s path as JSON.
    static func variablePath(_ row: Variables.Row) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: row.path) else { return "[]" }
        return String(decoding: data, as: UTF8.self)
    }

    /// The `file-moved` command's argument: a file or folder the app
    /// renamed (`to`) or deleted (`to` nil) itself, for the page's Recents.
    static func fileMoved(from: String, to: String?) -> String {
        let move: [String: Any] = ["from": from, "to": to ?? NSNull()]
        guard let data = try? JSONSerialization.data(withJSONObject: move, options: [.sortedKeys]) else {
            return "{}"
        }
        return String(decoding: data, as: UTF8.self)
    }

    /// The `search` command's argument: what to look for, in which folder
    /// (a server path, "" for the root), and whether to read notebooks.
    static func searchRequest(_ query: String, in folder: String = "", contents: Bool = false) -> String {
        let request: [String: Any] = ["query": query, "dir": folder, "contents": contents]
        guard let data = try? JSONSerialization.data(withJSONObject: request, options: [.sortedKeys]) else {
            return "{}"
        }
        return String(decoding: data, as: UTF8.self)
    }

    /// The open notebook's server path; nil when none is open.
    var path: String?
    var dirty = false
    /// The kernel's state (`idle`, `busy`, `none`, …); nil with no notebook.
    var status: String?
    var kernel: String?
    var kernelDisplayName: String?
    var kernelMissing = false
    var trusted = true
    /// The active cell's type: `code`, `markdown` or `raw`.
    var cellType: String?
    var kernels: [Kernel] = []
    var backend: Backend?
    /// Running sessions; absent from a page older than #225.
    var running: [Session]?
    /// The notebooks opened last, newest first; absent before #240.
    var recents: [String]?
    /// The sidebar search, while there is one (#240).
    var search: Search?
    /// The open notebook's headings; absent from a page older than #212.
    var outline: [Heading]?
    /// The kernel's variables while the inspector asks for them
    /// (`inspect-variables`, #249); nil otherwise and from older pages.
    var variables: Variables?

    init() {}

    var sessions: [Session] { running ?? [] }
    var headings: [Heading] { outline ?? [] }
    /// Whether a kernel runs for the notebook at `path`.
    func isRunning(_ path: String) -> Bool { sessions.contains { $0.path == path } }
    /// The open notebook's kernel id, for its log (#248).
    var kernelID: String? { sessions.first { $0.path == path }?.kernelID }
    /// Sessions other than the open notebook's.
    var otherSessions: [Session] { sessions.filter { $0.path != path } }

    /// From a message body as WebKit hands it over (dictionaries, arrays,
    /// strings, numbers, NSNull); nil for anything else.
    init?(body: Any) {
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body),
              let state = try? JSONDecoder().decode(PageState.self, from: data)
        else { return nil }
        self = state
    }

    var hasNotebook: Bool { path != nil }
    var isCode: Bool { cellType == "code" }

    /// The window's subtitle: the kernel and what it is doing, as the
    /// page's own toolbar showed it.
    var subtitle: String {
        guard hasNotebook else { return "" }
        let kernel = kernelDisplayName.map { kernelMissing ? "\($0) (not installed)" : $0 } ?? "No kernel"
        return "\(kernel) · \(Self.statusLabel(status))"
    }

    static func statusLabel(_ status: String?) -> String {
        switch status {
        case "idle": "Idle"
        case "busy": "Running"
        case "starting": "Starting"
        case "restarting", "autorestarting": "Restarting"
        case "connecting": "Connecting"
        case "dead": "Stopped"
        case "terminating": "Stopping"
        case "none", nil: "Starts when you run a cell"
        case let other?: other.capitalized
        }
    }
    var isBusy: Bool { status == "busy" }
    /// Whether there is a kernel to restart: one has started, even if it
    /// has since died (when Restart is most needed).
    var hasKernel: Bool { status != nil && status != "none" }
}

/// The page's commands, as `window.ganymede.command(id, arg)` runs them
/// (`PAGE_COMMANDS` and the shortcuts table's ids in `src/`).
enum PageCommand {
    /// The script that runs `id` with `arg`; the result is the page's
    /// answer, true when it ran. Both are JSON-encoded, so any string is safe.
    static func script(_ id: String, arg: String? = nil) -> String {
        let args = [id] + (arg.map { [$0] } ?? [])
        let data = (try? JSONSerialization.data(withJSONObject: args)) ?? Data("[]".utf8)
        let list = String(decoding: data, as: UTF8.self)
        return "window.ganymede ? window.ganymede.command(...\(list)) : false"
    }
}
