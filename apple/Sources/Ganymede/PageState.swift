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

    init() {}

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
