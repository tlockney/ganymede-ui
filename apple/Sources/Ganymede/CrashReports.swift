import Foundation
import GanymedeFFI
import Sentry
import SwiftUI
import WebKit
#if os(macOS)
import AppKit
#endif

/// Opt-in crash reports to Sentry's `ganymede-apple` project (#318,
/// tlockney/ganymede#384). Off until the person says yes: the app asks
/// once, with "Don't Send" as the default, and Settings changes it. While
/// off, the SDK isn't started and nothing is sent.
///
/// Sent: crashes (Swift, Objective-C and the Rust server's aborts) and Rust
/// panics, with stacks, the release, OS, device model and architecture.
/// Not sent: breadcrumbs, screenshots, view hierarchy, sessions, tracing,
/// user, device name, paths under the home folder, notebook content.
/// `scrub` enforces this before an event leaves the app.
///
/// The page's own error reports (#319) follow the same choice: the web
/// view gets `window.ganymedeCrashReports` before the page loads.
@MainActor
final class CrashReports: ObservableObject {
    static let shared = CrashReports()

    /// The ganymede-apple project's DSN. It only lets a client send events.
    static let dsn = "https://1495b4591b2910506d29004ea407982c@o4512380800598016.ingest.us.sentry.io/4512380975972352"

    private static let key = "crashReports"
    private let defaults: UserDefaults

    /// The person's answer; nil until they gave one.
    @Published private(set) var choice: Bool?

    var enabled: Bool { choice == true }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        choice = defaults.object(forKey: Self.key) as? Bool
    }

    /// Records the answer and starts or stops reporting to match.
    func set(_ on: Bool) {
        choice = on
        defaults.set(on, forKey: Self.key)
        if on { start() } else { SentrySDK.close() }
    }

    /// At launch: starts reporting when the person said yes.
    func startIfChosen() {
        if enabled { start() }
    }

    private func start() {
        guard !SentrySDK.isEnabled else { return }
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "0"
        let build = info["CFBundleVersion"] as? String ?? "0"
        SentrySDK.start { options in
            options.dsn = Self.dsn
            options.releaseName = "ganymede-apple@\(version)+\(build)"
            #if DEBUG
            options.environment = "development"
            #else
            options.environment = "production"
            #endif
            options.sendDefaultPii = false
            // Crashes and errors only.
            options.enableAutoSessionTracking = false
            options.enableAutoBreadcrumbTracking = false
            options.enableNetworkBreadcrumbs = false
            options.maxBreadcrumbs = 0
            options.enableAutoPerformanceTracing = false
            options.enableNetworkTracking = false
            options.enableFileIOTracing = false
            options.enableCoreDataTracing = false
            options.enableCaptureFailedRequests = false
            options.enableAppHangTracking = false
            options.tracesSampleRate = 0
            #if os(iOS)
            options.enableUserInteractionTracing = false
            options.enableUIViewControllerTracing = false
            options.enableWatchdogTerminationTracking = false
            options.attachScreenshot = false
            options.attachViewHierarchy = false
            #endif
            #if os(macOS)
            // AppKit swallows exceptions on the main thread otherwise.
            options.enableUncaughtNSExceptionReporting = true
            #endif
            options.beforeBreadcrumb = { _ in nil }
            options.beforeSend = { event in Self.scrub(event) }
        }
        // Panics in the embedded server (ganymede-ffi): a panic in one of
        // its tasks doesn't end the app, so it is reported here, on the
        // panicking thread, whose stack has the Rust frames.
        ganymede_set_panic_callback { message in
            guard let message else { return }
            let text = String(cString: message)
            SentrySDK.capture(message: "Rust panic: \(text)") { scope in
                scope.setLevel(.error)
            }
            // A panic across the FFI boundary aborts right after this
            // returns; without the flush the event can be lost (#318).
            SentrySDK.flush(timeout: 2)
        }
    }

    /// The event as it may leave the app.
    nonisolated static func scrub(_ event: Event) -> Event? {
        event.user = nil
        event.serverName = nil
        event.breadcrumbs = nil
        event.extra = nil
        event.request = nil
        event.tags = nil
        event.context = CrashScrub.context(event.context)
        if let message = event.message {
            event.message = SentryMessage(formatted: CrashScrub.text(message.formatted))
        }
        for exception in event.exceptions ?? [] {
            exception.value = exception.value.map(CrashScrub.text)
            scrub(exception.stacktrace)
        }
        for thread in event.threads ?? [] {
            thread.name = nil
            scrub(thread.stacktrace)
        }
        scrub(event.stacktrace)
        for image in event.debugMeta ?? [] {
            image.codeFile = image.codeFile.map(CrashScrub.text)
        }
        return event
    }

    private nonisolated static func scrub(_ stacktrace: SentryStacktrace?) {
        for frame in stacktrace?.frames ?? [] {
            frame.vars = nil
            frame.contextLine = nil
            frame.preContext = nil
            frame.postContext = nil
            frame.package = frame.package.map(CrashScrub.text)
            frame.fileName = frame.fileName.map(CrashScrub.text)
        }
    }

    /// Settings' test buttons: each sends what a real failure would.
    enum Test: String, CaseIterable, Identifiable {
        case error = "Send a Test Error"
        case swiftCrash = "Crash the App (Swift)"
        case rustPanic = "Crash the App (Rust Panic)"
        var id: Self { self }
    }

    func run(_ test: Test) {
        guard enabled else { return }
        switch test {
        case .error:
            SentrySDK.capture(error: TestError())
        case .swiftCrash:
            // The report is sent on the next launch.
            SentrySDK.crash()
        case .rustPanic:
            ganymede_debug_panic()
        }
    }

    private struct TestError: LocalizedError {
        var errorDescription: String? { "Ganymede test report: the app sent this on request" }
    }

    /// For the web views: the page's error reports follow this choice
    /// (`src/lib/crash-reports.ts`), read before the page loads.
    var pageScript: WKUserScript {
        WKUserScript(
            source: "window.ganymedeCrashReports = \(enabled ? "true" : "false");",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }
}

/// The question the app asks once.
enum CrashReportsPrompt {
    static let title = "Send crash reports to help fix Ganymede?"
    static let message = """
        When Ganymede crashes or hits an error in its own code, it can send \
        the error, where in the code it happened, the app's version, and the \
        OS and device model. Never notebook content, file names, kernel \
        output or errors from your own code. Change this in Settings.
        """
    static let privacy = URL(string: "https://ganymede-server.com/docs/privacy")!

    #if os(macOS)
    /// Asks with an alert, "Don't Send" the default button, unless the
    /// person answered before.
    @MainActor static func askIfNeeded(_ reports: CrashReports = .shared) {
        guard reports.choice == nil else { return }
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.addButton(withTitle: "Don't Send")
        alert.addButton(withTitle: "Send Crash Reports")
        alert.showsHelp = true
        let help = PrivacyHelp()
        alert.delegate = help
        // The delegate is weak: keep `help` alive while the alert runs.
        let answer = withExtendedLifetime(help) { alert.runModal() }
        reports.set(answer == .alertSecondButtonReturn)
    }

    /// The alert's ? button opens the privacy page.
    private final class PrivacyHelp: NSObject, NSAlertDelegate {
        func alertShowHelp(_ alert: NSAlert) -> Bool {
            NSWorkspace.shared.open(privacy)
            return true
        }
    }
    #endif
}

/// Settings' crash report section, on Mac and iOS.
struct CrashReportsSettings: View {
    @ObservedObject var reports: CrashReports = .shared

    var body: some View {
        Section {
            Toggle("Send crash reports", isOn: Binding(
                get: { reports.enabled },
                set: { reports.set($0) }
            ))
            if reports.enabled {
                Menu("Test") {
                    ForEach(CrashReports.Test.allCases) { test in
                        Button(test.rawValue) { reports.run(test) }
                    }
                }
                .fixedSize()
            }
        } header: {
            Text("Crash Reports")
        } footer: {
            VStack(alignment: .leading, spacing: 4) {
                Text("Crashes and errors in Ganymede's own code, with the app's version, OS and device model. "
                    + "Never notebook content, file names or kernel output. Windows opened after a change follow it.")
                Link("Privacy", destination: CrashReportsPrompt.privacy)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }
}

#if os(iOS)
/// Asks the question once on iPad and iPhone, "Don't Send" first.
private struct CrashReportsPromptModifier: ViewModifier {
    @ObservedObject var reports: CrashReports = .shared
    @Environment(\.openURL) private var openURL

    func body(content: Content) -> some View {
        content.alert(
            CrashReportsPrompt.title,
            isPresented: Binding(get: { reports.choice == nil }, set: { _ in })
        ) {
            Button("Don't Send", role: .cancel) { reports.set(false) }
            Button("Send Crash Reports") { reports.set(true) }
            Button("Privacy…") { openURL(CrashReportsPrompt.privacy) }
        } message: {
            Text(CrashReportsPrompt.message)
        }
    }
}

extension View {
    func crashReportsPrompt() -> some View { modifier(CrashReportsPromptModifier()) }
}
#endif
