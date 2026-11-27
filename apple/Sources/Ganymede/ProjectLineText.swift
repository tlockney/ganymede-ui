import Foundation

/// The two lines the sidebar's foot shows (#873): the window's folder, named,
/// and the folder it is in over the place's name — "moons", then
/// "~/notes · This Mac". Apart from the view, so a test can read them
/// without a window.
enum ProjectLineText {
    /// The folder's name, and its parent over the place's name. A folder
    /// under `home` reads "~" there; a machine's window passes no home, so
    /// its paths stay as its server reports them. A root (a machine's
    /// window opens on its root) has no parent: it reads "/" over the place.
    static func lines(folder: URL, home: URL?, placeName: String) -> (title: String, detail: String) {
        // Not `deletingLastPathComponent()`, which makes a root's parent "/..".
        let path = folder.path
        guard path != "/", !path.isEmpty else { return ("/", placeName) }
        let parent = (path as NSString).deletingLastPathComponent
        let shown = home.map { abbreviate(parent, home: $0.path) } ?? parent
        return ((path as NSString).lastPathComponent, "\(shown) · \(placeName)")
    }

    /// `path` with the home folder's part as "~".
    static func abbreviate(_ path: String, home: String) -> String {
        // A home at the root would make every path home.
        guard home != "/" else { return path }
        if path == home { return "~" }
        let base = home.hasSuffix("/") ? home : home + "/"
        if path + "/" == base { return "~" }
        return path.hasPrefix(base) ? "~/" + path.dropFirst(base.count) : path
    }
}
