#if os(macOS)
import Foundation
import Observation
import ServiceManagement

/// The Mac app's optional background server LaunchAgent (#912): runs the
/// bundled `Contents/Helpers/ganymede` under launchd via `SMAppService` so
/// the server stays running between app launches. Off by default.
enum BackgroundServer {
    /// The LaunchAgent plist bundled under `Contents/Library/LaunchAgents/`.
    static let plistName = "com.ganymede-server.Ganymede.server.plist"
    /// The `Label` inside `plistName`.
    static let label = "com.ganymede-server.Ganymede.server"
    /// The stable code-signing identifier applied to `Contents/Helpers/ganymede`
    /// (`apple/project.yml` and `apple/scripts/release-app.sh`) so signature
    /// verification can match the helper across app updates.
    static let helperIdentifier = "com.ganymede-server.Ganymede.helper"
}

/// The `SMAppService` calls the background server setting makes (#912),
/// behind a protocol so unit tests never touch launchd or Login Items.
protocol BackgroundServerService: Sendable {
    /// The current LaunchAgent registration status reported by macOS.
    var status: SMAppService.Status { get }
    /// Registers the LaunchAgent with launchd.
    func register() throws
    /// Unregisters the LaunchAgent from launchd.
    func unregister() throws
    /// Opens System Settings › General › Login Items & Extensions.
    func openLoginItemsSettings()
}

/// The real `SMAppService` implementation for `BackgroundServer.plistName`.
struct SystemBackgroundServerService: BackgroundServerService {
    let plistName: String

    init(plistName: String = BackgroundServer.plistName) {
        self.plistName = plistName
    }

    private var service: SMAppService {
        SMAppService.agent(plistName: plistName)
    }

    var status: SMAppService.Status { service.status }

    func register() throws {
        try service.register()
    }

    func unregister() throws {
        try service.unregister()
    }

    func openLoginItemsSettings() {
        SMAppService.openSystemSettingsLoginItems()
    }
}

/// Drives Settings › General › "Keep Ganymede running in the background"
/// (#912): registers and unregisters the LaunchAgent through
/// `BackgroundServerService`, surfaces approval status, and keeps any
/// register/unregister error visible rather than dropping it.
@MainActor
@Observable
final class BackgroundServerController {
    /// The last status read from `service`.
    private(set) var serviceStatus: SMAppService.Status
    /// The error from the last register or unregister call, if it threw.
    private(set) var error: String?
    @ObservationIgnored private let service: any BackgroundServerService

    init(service: any BackgroundServerService = SystemBackgroundServerService()) {
        self.service = service
        serviceStatus = service.status
    }

    /// Whether the LaunchAgent is currently registered (either enabled or
    /// awaiting the person's approval in System Settings › Login Items).
    var isEnabled: Bool {
        serviceStatus == .enabled || serviceStatus == .requiresApproval
    }

    /// Whether macOS needs the person to approve the agent in System Settings
    /// › Login Items.
    var needsApproval: Bool {
        serviceStatus == .requiresApproval
    }

    /// The status line shown under the toggle, or nil when off.
    var statusText: String? {
        switch serviceStatus {
        case .enabled:
            "Enabled"
        case .requiresApproval:
            "Needs approval in System Settings › Login Items"
        case .notFound:
            "Background server configuration was not found in the app bundle."
        case .notRegistered:
            nil
        @unknown default:
            nil
        }
    }

    /// Turns the LaunchAgent on or off. Errors are always captured in `error`
    /// and shown under the toggle.
    func setEnabled(_ enabled: Bool) {
        do {
            if enabled {
                try service.register()
            } else {
                try service.unregister()
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        serviceStatus = service.status
    }

    /// Re-reads the service status from macOS, for example when the app
    /// returns to the foreground after a visit to System Settings.
    func refresh() {
        let updated = service.status
        if updated != serviceStatus {
            serviceStatus = updated
            if updated == .enabled { error = nil }
        }
    }

    /// Opens System Settings › Login Items so the person can approve the agent.
    func openLoginItemsSettings() {
        service.openLoginItemsSettings()
    }
}
#endif
