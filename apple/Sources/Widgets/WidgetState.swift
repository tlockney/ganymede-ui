import DeviceBridge
import Foundation

// What a notebook widget shows (#436), apart from WidgetKit so the unit
// tests can check it: a run publishes content per notebook and kind with
// `device.widget.update`, the app keeps it in the App Group's defaults,
// and the widget shows the one it was configured with.

enum WidgetState: Equatable {
    /// Settings › Device › Notebook Widgets is off.
    case off
    /// The widget hasn't been given a notebook and kind yet.
    case unset
    /// The configured notebook and kind aren't published (any more).
    case missing(notebook: String, kind: String)
    case shown(PublishedWidget)

    /// One published widget's identity, for the widget's configuration.
    static func id(notebook: String, kind: String) -> String {
        "\(kind)\n\(notebook)"
    }

    /// The notebook and kind an `id` names. A kind has no newline.
    static func parse(_ id: String) -> (notebook: String, kind: String)? {
        guard let split = id.firstIndex(of: "\n") else { return nil }
        return (String(id[id.index(after: split)...]), String(id[..<split]))
    }

    static func resolve(enabled: Bool, published: [PublishedWidget], selection: String?) -> WidgetState {
        guard enabled else { return .off }
        guard let selection, let (notebook, kind) = parse(selection) else { return .unset }
        if let widget = published.first(where: { $0.notebook == notebook && $0.kind == kind }) {
            return .shown(widget)
        }
        return .missing(notebook: notebook, kind: kind)
    }

    /// What the App Group holds, newest first, from any thread.
    static func published(in defaults: UserDefaults?) -> [PublishedWidget] {
        guard let defaults else { return [] }
        return UserDefaultsWidgetStore.read(defaults).sorted { $0.updated > $1.updated }
    }

    /// The notebook's file name, without `.ipynb`.
    static func name(_ notebook: String) -> String {
        let file = URL(fileURLWithPath: notebook).lastPathComponent
        return file.hasSuffix(".ipynb") ? String(file.dropLast(6)) : file
    }
}
