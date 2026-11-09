#if os(macOS)
import AppKit
import Sparkle
import SwiftUI

/// Finds and installs new releases of the Mac app (#411), with Sparkle.
///
/// Only release builds update themselves: `release-app.sh` sets the feed
/// (`SUFeedURL`) and the key its updates are signed with (`SUPublicEDKey`).
/// Other builds (CI, Xcode, `bootstrap.sh`) leave both empty, and the
/// updater is never started.
///
/// Checks run daily by default, and installing asks first: Settings ›
/// General changes both. A scheduled check that finds an update doesn't
/// open Sparkle's window over the person's work: it sets `available`, and
/// the toolbar shows a button that opens it (Sparkle's "gentle reminders").
/// Check for Updates… in the app menu always opens it.
@MainActor
@Observable
final class AppUpdater: NSObject {
    static let shared = AppUpdater()

    /// The update a scheduled check found and the person hasn't looked at
    /// yet, as its version and stage; nil when there is none.
    /// The Dock icon gets a badge too, for windows without the button.
    private(set) var available: Available? {
        didSet { NSApp?.dockTile.badgeLabel = available == nil ? nil : "1" }
    }
    /// Whether Check for Updates… can run now: not while a check is.
    private(set) var canCheck = false
    /// Sparkle's own settings, kept here so views see them change.
    private(set) var checksAutomatically = false
    private(set) var downloadsAutomatically = false

    struct Available: Equatable {
        var version: String
        /// Downloaded already, so installing doesn't wait for it.
        var downloaded: Bool
    }

    @ObservationIgnored private var controller: SPUStandardUpdaterController?
    @ObservationIgnored private var observations: [NSKeyValueObservation] = []

    /// Whether this build updates itself: it has a feed and a key, and
    /// the updater started.
    private(set) var isEnabled = false

    /// At launch: starts the updater when this build has a feed.
    func start() {
        guard controller == nil, UpdateFeed.url(in: Bundle.main.infoDictionary ?? [:]) != nil else { return }
        let controller = SPUStandardUpdaterController(
            startingUpdater: true, updaterDelegate: nil, userDriverDelegate: self
        )
        self.controller = controller
        isEnabled = true
        let updater = controller.updater
        // Sparkle changes these itself too: its update window has an
        // "Automatically download and install" checkbox.
        observations = [
            updater.observe(\.canCheckForUpdates, options: [.initial, .new]) { [weak self] updater, _ in
                let value = updater.canCheckForUpdates
                Task { @MainActor in self?.canCheck = value }
            },
            updater.observe(\.automaticallyChecksForUpdates, options: [.initial, .new]) { [weak self] updater, _ in
                let value = updater.automaticallyChecksForUpdates
                Task { @MainActor in self?.checksAutomatically = value }
            },
            updater.observe(\.automaticallyDownloadsUpdates, options: [.initial, .new]) { [weak self] updater, _ in
                let value = updater.automaticallyDownloadsUpdates
                Task { @MainActor in self?.downloadsAutomatically = value }
            },
        ]
    }

    /// Check for Updates…, and the toolbar button: Sparkle's window, with
    /// the update found or a check for one.
    func checkForUpdates() {
        controller?.checkForUpdates(nil)
    }

    func setChecksAutomatically(_ on: Bool) {
        guard let updater = controller?.updater else { return }
        updater.automaticallyChecksForUpdates = on
        checksAutomatically = updater.automaticallyChecksForUpdates
        downloadsAutomatically = updater.automaticallyDownloadsUpdates
    }

    func setDownloadsAutomatically(_ on: Bool) {
        guard let updater = controller?.updater else { return }
        updater.automaticallyDownloadsUpdates = on
        downloadsAutomatically = updater.automaticallyDownloadsUpdates
    }

    /// The running app's version, for Settings.
    static var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
    }
}

// Sparkle calls these on the main thread.
extension AppUpdater: SPUStandardUserDriverDelegate {
    nonisolated var supportsGentleScheduledUpdateReminders: Bool { true }

    /// Scheduled checks: the toolbar button shows the update, not Sparkle.
    nonisolated func standardUserDriverShouldHandleShowingScheduledUpdate(
        _ update: SUAppcastItem, andInImmediateFocus immediateFocus: Bool
    ) -> Bool {
        false
    }

    nonisolated func standardUserDriverWillHandleShowingUpdate(
        _ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem, state: SPUUserUpdateState
    ) {
        guard !handleShowingUpdate else { return }
        let found = Available(version: update.displayVersionString, downloaded: state.stage != .notDownloaded)
        MainActor.assumeIsolated { self.available = found }
    }

    nonisolated func standardUserDriverDidReceiveUserAttention(forUpdate update: SUAppcastItem) {
        MainActor.assumeIsolated { self.available = nil }
    }

    nonisolated func standardUserDriverWillFinishUpdateSession() {
        MainActor.assumeIsolated { self.available = nil }
    }
}

/// Ganymede › Check for Updates…
struct CheckForUpdatesCommand: View {
    private let updater = AppUpdater.shared

    var body: some View {
        if updater.isEnabled {
            Button("Check for Updates…") { updater.checkForUpdates() }
                .disabled(!updater.canCheck)
        }
    }
}

/// The toolbar's button while an update waits: opens Sparkle's window,
/// with the release notes and Install, Skip or Remind Me Later.
struct UpdateAvailableButton: View {
    let available: AppUpdater.Available

    var body: some View {
        Button {
            AppUpdater.shared.checkForUpdates()
        } label: {
            Label("Update Available", systemImage: "arrow.down.circle.fill")
        }
        .tint(.accentColor)
        .help(available.downloaded
            ? "Ganymede \(available.version) is ready to install"
            : "Ganymede \(available.version) is available")
    }
}

/// Settings › General: whether to check, and whether to install without
/// asking.
struct UpdateSettings: View {
    private let updater = AppUpdater.shared

    var body: some View {
        Section("Updates") {
            if updater.isEnabled {
                Toggle("Check for updates automatically", isOn: Binding(
                    get: { updater.checksAutomatically },
                    set: { updater.setChecksAutomatically($0) }
                ))
                Toggle("Download and install updates automatically", isOn: Binding(
                    get: { updater.downloadsAutomatically },
                    set: { updater.setDownloadsAutomatically($0) }
                ))
                .disabled(!updater.checksAutomatically)
                LabeledContent("Version \(AppUpdater.currentVersion)") {
                    Button("Check Now") { updater.checkForUpdates() }
                        .disabled(!updater.canCheck)
                }
                Text(updater.checksAutomatically
                    ? "Ganymede checks once a day. When an update is found, a button in the toolbar and a badge on the Dock icon show it; installing asks first unless updates install automatically."
                    : "Ganymede checks only when you click Check Now or choose Check for Updates….")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                LabeledContent("Version", value: AppUpdater.currentVersion)
                Text("This build doesn’t update itself. Releases from GitHub do.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
#endif
