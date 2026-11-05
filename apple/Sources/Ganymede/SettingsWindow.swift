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
            KernelSettings()
                .tabItem { Label("Kernels", systemImage: "cpu") }
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
                    DefaultAppCommand()
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

/// Kernels: where they run, and the kernels installed there (#206).
private struct KernelSettings: View {
    @EnvironmentObject private var model: AppModel
    @State private var specs: KernelSpecs?
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                LabeledContent("Kernels run on", value: model.kernelRemote?.title ?? "This Mac")
                Text("Choose where in the Remotes tab.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section {
                if let specs {
                    ForEach(specs.specs) { spec in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(spec.displayName)
                                Text([spec.name, spec.language].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if spec.name == specs.defaultName {
                                Text("Default").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    if specs.specs.isEmpty {
                        Text("No kernels installed.").foregroundStyle(.secondary)
                    }
                } else if let error {
                    Text(error).foregroundStyle(.secondary)
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            } header: {
                Text("Installed")
            } footer: {
                Text("Kernels are Jupyter kernelspecs. To add TypeScript, run `cdp-kernel install --runtime node`.")
            }
        }
        .formStyle(.grouped)
        .padding()
        // Again when the server restarts, as it does when kernels move.
        .task(id: model.url) { await load() }
    }

    private func load() async {
        guard let server = model.localServer else {
            specs = nil
            error = model.error.map { "Ganymede could not start: \($0)" } ?? "Waiting for the server…"
            return
        }
        do {
            specs = try await KernelSpecs.load(from: server)
            error = nil
        } catch {
            specs = nil
            self.error = "Couldn’t list the kernels: \(error.localizedDescription)"
        }
    }
}

/// A tab for settings the page keeps: a button brings the front notebook
/// window forward and opens them there. With no notebook window open, the
/// button is off.
private struct PageSettings: View {
    let text: String
    let button: String
    let notification: Notification.Name
    @State private var hasNotebook = NotebookWindows.front != nil

    var body: some View {
        VStack(spacing: 12) {
            Text(text).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button(button) { NotebookWindows.show(notification) }
                .disabled(!hasNotebook)
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            hasNotebook = NotebookWindows.front != nil
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.willCloseNotification)) { _ in
            // The closing window is still listed; check once it has gone.
            DispatchQueue.main.async { hasNotebook = NotebookWindows.front != nil }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
    }
}
#endif
