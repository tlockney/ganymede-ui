#if os(macOS)
import AppKit
import SwiftUI

/// The app's one Settings window (⌘,), in tabs (#206). Remotes are the
/// app's own; the agent's settings and the keyboard shortcuts are the
/// page's, so their tabs open them in the front notebook window.
struct SettingsWindow: View {
    var body: some View {
        TabView {
            GeneralSettings()
                .tabItem { Label("General", systemImage: "gearshape") }
            RemotesView()
                .padding()
                .tabItem { Label("Remotes", systemImage: "server.rack") }
            PageSettings(
                text: "The agent's model, API keys and tools are set in the notebook window.",
                button: "Open Agent Settings…",
                notification: .showAgentSettings
            )
            .tabItem { Label("Agent", systemImage: "sparkles") }
            PageSettings(
                text: "The notebook's keyboard shortcuts are listed in the notebook window.",
                button: "Show Keyboard Shortcuts",
                notification: .showShortcuts
            )
            .tabItem { Label("Shortcuts", systemImage: "keyboard") }
        }
        .frame(width: 480)
    }
}

/// General: which app opens notebooks.
private struct GeneralSettings: View {
    var body: some View {
        Form {
            Section {
                LabeledContent("Notebooks") {
                    Button("Make Ganymede the Default App") {
                        Task { await DefaultApp.claimNotebooks() }
                    }
                }
                Text("Double-clicking an .ipynb file in the Finder then opens it here.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}

/// A tab for settings the page keeps: a button opens them in the front
/// notebook window (its main window, since Settings is the key window).
private struct PageSettings: View {
    let text: String
    let button: String
    let notification: Notification.Name

    var body: some View {
        VStack(spacing: 12) {
            Text(text).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button(button) {
                NotificationCenter.default.post(name: notification, object: nil)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
    }
}
#endif
