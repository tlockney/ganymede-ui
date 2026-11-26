import Foundation

/// Where a terminal window's shell runs.
enum TerminalTarget: Codable, Hashable {
    /// The app's own server, on this Mac, starting in `folder` (the
    /// default folder when nil). The iOS server has no terminals.
    case local(folder: URL?)
    /// A remote's server, from Settings, or the machine a window shows
    /// (#858): its shell starts in `folder`, a path on that server which the
    /// Ganymede server resolves against its root (the root when nil, or when
    /// the folder isn't there).
    case server(UUID, folder: String? = nil)
    /// A remote over SSH: /usr/bin/ssh on the Mac, swift-nio-ssh on iOS.
    case ssh(UUID)
}

/// What a terminal window is opened with. `openWindow` brings a window
/// whose value equals the one asked for to the front instead of opening
/// another, so each request has its own id.
struct TerminalRequest: Codable, Hashable, Identifiable {
    var id = UUID()
    var target: TerminalTarget
}
