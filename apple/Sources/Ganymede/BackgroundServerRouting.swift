#if os(macOS)
import Foundation
import ServiceManagement

/// Pure routing, tailnet ownership, and status-notice decisions for routing
/// local notebooks through the verified background LaunchAgent server (#954).
/// Kept apart from `AppModel` and SwiftUI views so unit tests cover every
/// state without AppKit, launchd, or live servers.
enum BackgroundServerRouting {
    /// Where a local folder or notebook target should open.
    enum Decision: Equatable {
        /// Open on the embedded server (`.thisDevice`), with an optional
        /// one-line notice (nil when the background server is off; non-nil
        /// when the background server is enabled or needs approval but is
        /// unavailable, unverified, or does not cover the requested path).
        case embedded(target: WindowTarget, notice: String?)
        /// Route through the verified background server as
        /// `.thisMac(BackgroundServer.mountID)`.
        case background(target: WindowTarget, server: ThisMacServer)

        var target: WindowTarget {
            switch self {
            case .embedded(let target, _), .background(let target, _): target
            }
        }

        var notice: String? {
            switch self {
            case .embedded(_, let notice): notice
            case .background: nil
            }
        }
    }

    /// Picks the verified background server to mount for local routing:
    /// prefers the server covering `preferredRoot` with the deepest root path,
    /// else falls back to the verified server with the broadest root.
    static func selectPrimaryServer(
        from verified: [ThisMacServer],
        preferredRoot: URL? = nil
    ) -> ThisMacServer? {
        guard !verified.isEmpty else { return nil }
        if let preferredRoot {
            let covering = verified.filter {
                NotebookActions.apiPath(for: preferredRoot, root: $0.root) != nil
            }
            if let best = covering.max(by: { $0.root.standardizedFileURL.path.count < $1.root.standardizedFileURL.path.count }) {
                return best
            }
        }
        return verified.min(by: { $0.root.standardizedFileURL.path.count < $1.root.standardizedFileURL.path.count })
    }

    /// Decides how to open `target` given the background LaunchAgent status,
    /// the verified mounted background server (if any), and the latest
    /// `ThisMacVerifier` scan (#954).
    static func route(
        _ target: WindowTarget,
        backgroundStatus: SMAppService.Status,
        backgroundServer: ThisMacServer?,
        lastScan: ThisMacScanResult
    ) -> Decision {
        let localURL: URL
        let isFolder: Bool
        switch target {
        case .file(let url):
            localURL = url
            isFolder = false
        case .folder(let url):
            localURL = url
            isFolder = true
        case .console, .machineFile, .machineFolder:
            return .embedded(target: target, notice: nil)
        }

        switch backgroundStatus {
        case .enabled:
            guard let server = backgroundServer else {
                return .embedded(target: target, notice: unavailableNotice(lastScan: lastScan))
            }
            guard let relative = NotebookActions.apiPath(for: localURL, root: server.root),
                  let routed = WindowTarget.machine(BackgroundServer.mountID, path: relative, isFolder: isFolder)
            else {
                return .embedded(target: target, notice: outsideRootNotice(server.root))
            }
            return .background(target: routed, server: server)
        case .requiresApproval:
            return .embedded(target: target, notice: needsApprovalNotice)
        case .notRegistered, .notFound:
            return .embedded(target: target, notice: nil)
        @unknown default:
            return .embedded(target: target, notice: nil)
        }
    }

    /// One-line notice for a window currently showing `place` on `target`
    /// (#954). Returns nil when the background server is off or the window is
    /// already running on the verified background server.
    static func localWindowNotice(
        target: WindowTarget,
        place: Place,
        backgroundStatus: SMAppService.Status,
        backgroundServer: ThisMacServer?,
        lastScan: ThisMacScanResult
    ) -> String? {
        if place == .machine(BackgroundServer.mountID) {
            switch backgroundStatus {
            case .enabled:
                if backgroundServer != nil {
                    return "Background server restarted — reload or open a new tab to reconnect as This Mac."
                }
                return unavailableNotice(lastScan: lastScan)
            case .requiresApproval:
                return needsApprovalNotice
            case .notRegistered, .notFound:
                return "Background server was turned off — reopen this tab to use the embedded server."
            @unknown default:
                return unavailableNotice(lastScan: lastScan)
            }
        }
        guard place == .thisDevice else { return nil }
        switch backgroundStatus {
        case .enabled:
            guard let server = backgroundServer else {
                return unavailableNotice(lastScan: lastScan)
            }
            if case .file(let url) = target, NotebookActions.apiPath(for: url, root: server.root) == nil {
                return outsideRootNotice(server.root)
            }
            if case .folder(let url) = target, NotebookActions.apiPath(for: url, root: server.root) == nil {
                return outsideRootNotice(server.root)
            }
            return "Background server is now ready — open a new window or tab to use it."
        case .requiresApproval:
            return needsApprovalNotice
        case .notRegistered, .notFound:
            return nil
        @unknown default:
            return nil
        }
    }

    /// One-line notice explaining why an enabled background server could not
    /// be used, reusing `ThisMacVerifier`'s `#887` failure diagnostics.
    static func unavailableNotice(lastScan: ThisMacScanResult) -> String {
        if let appFailure = lastScan.appFailure {
            switch appFailure {
            case .unsignedApp:
                return "Background server not trusted: this app build isn’t signed — using the embedded server for now."
            case .missingBundledHelper:
                return "Background server not trusted: the bundled ganymede helper is missing — using the embedded server for now."
            default:
                return "\(appFailure.notice) Using the embedded server for now."
            }
        }
        if let failure = bestFailure(in: lastScan.entries) {
            switch failure {
            case .versionMismatch(let server, let app):
                return "Background server is Ganymede \(server), app bundles \(app) (restarting) — using the embedded server for now."
            case .wildcardBind:
                return "Background server listens on every interface (restart with --ip 127.0.0.1) — using the embedded server for now."
            case .wrongExecutablePath:
                return "Background server isn’t running from this app’s bundled helper — using the embedded server for now."
            case .wrongSignature:
                return "Background server isn’t signed as this app’s bundled helper — using the embedded server for now."
            default:
                return "\(failure.notice) Using the embedded server for now."
            }
        }
        return "Background server isn’t running yet — using the embedded server for now."
    }

    /// Whether the background server owns tailnet serving for this Mac (#954):
    /// when enabled, the background server reads `[tailscale]` from the shared
    /// `ganymede.toml` and the embedded server does not run its own tailnet
    /// listener alongside it.
    static func backgroundOwnsTailnet(_ status: SMAppService.Status) -> Bool {
        status == .enabled
    }

    /// The Tailscale allow list the embedded server should apply (#954):
    /// empty whenever the background server is enabled, avoiding duplicate
    /// tailnet endpoints; otherwise keeps the existing embedded tailnet allow
    /// list.
    static func embeddedTailnetAllow(
        backgroundStatus: SMAppService.Status,
        tailnetShare: Bool,
        tailnetAllow: [String]
    ) -> [String] {
        guard !backgroundOwnsTailnet(backgroundStatus), tailnetShare else { return [] }
        return tailnetAllow
    }

    /// Whether toggling the background server between `oldStatus` and
    /// `newStatus` requires restarting the embedded server to tear down or
    /// restore embedded tailnet sharing (#954).
    static func shouldRestartEmbeddedForTailnetTransition(
        from oldStatus: SMAppService.Status,
        to newStatus: SMAppService.Status,
        tailnetShare: Bool,
        hasServedPort: Bool
    ) -> Bool {
        let wasOwned = backgroundOwnsTailnet(oldStatus)
        let nowOwned = backgroundOwnsTailnet(newStatus)
        guard wasOwned != nowOwned else { return false }
        return tailnetShare || (nowOwned && hasServedPort)
    }

    private static let needsApprovalNotice =
        "Background server needs approval in System Settings › Login Items — using the embedded server for now."

    private static func outsideRootNotice(_ root: URL) -> String {
        "Using the embedded server: this location is outside the background server’s root (\(root.standardizedFileURL.path))."
    }

    /// Picks the most relevant failure from `entries`, preferring live local
    /// candidates over stale ones.
    private static func bestFailure(in entries: [ThisMacScanEntry]) -> ThisMacTrustFailure? {
        let failing = entries.filter { entry in
            guard entry.verified == nil, entry.failure != nil else { return false }
            let host = entry.url.host
            let hostLocal = host.map { ThisMacServer.isLoopbackHost($0) || ThisMacServer.isWildcardAddress($0) } ?? false
            let hostnameLocal = entry.hostname.map { ThisMacServer.isLoopbackHost($0) || ThisMacServer.isWildcardAddress($0) } ?? false
            return hostLocal || hostnameLocal
        }
        return (failing.first(where: \.isRunning) ?? failing.first)?.failure
    }
}
#endif
