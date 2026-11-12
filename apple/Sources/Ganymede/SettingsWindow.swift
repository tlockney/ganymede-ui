#if os(macOS)
import AppKit
import SwiftUI

/// The app's one Settings window (⌘,, #206, #332): everything the app
/// lets you set, at one fixed size. The page's own Settings, Keyboard
/// Shortcuts and Connect sheets are for the browser; in the app they open
/// a tab here (`SettingsTab`, `SettingsOpener`).
struct SettingsWindow: View {
    @AppStorage(SettingsTab.defaultsKey) private var tab = SettingsTab.general

    var body: some View {
        TabView(selection: $tab) {
            GeneralSettings()
                .tabItem { Label("General", systemImage: "gearshape") }
                .tag(SettingsTab.general)
            AppearanceSettings()
                .tabItem { Label("Appearance", systemImage: "textformat") }
                .tag(SettingsTab.appearance)
            KernelSettings()
                .tabItem { Label("Kernels", systemImage: "cpu") }
                .tag(SettingsTab.kernels)
            RemotesView()
                .tabItem { Label("Remotes", systemImage: "server.rack") }
                .tag(SettingsTab.remotes)
            AgentSettingsTab()
                .tabItem { Label("Agent", systemImage: "sparkles") }
                .tag(SettingsTab.agent)
            ShortcutsSettingsTab()
                .tabItem { Label("Shortcuts", systemImage: "keyboard") }
                .tag(SettingsTab.shortcuts)
            // What notebooks may use on this Mac (#383).
            DeviceSettings()
                .tabItem { Label("Device", systemImage: "hand.raised") }
                .tag(SettingsTab.device)
        }
        // A grouped Form has no height of its own: without one, the window
        // shrank to each tab's first row.
        .frame(width: 640, height: 540)
        .settingsOpener()
    }
}

/// Opens the Settings window at a tab: from the menus, and when a page
/// asks (`.showAppSettings`). Only SwiftUI's `openSettings` does that, and
/// only a view can read it: each window's view keeps it here
/// (`settingsOpener()`).
@MainActor
enum SettingsOpener {
    fileprivate static var open: (() -> Void)?
    private static var observer: NSObjectProtocol?

    static func show(_ tab: SettingsTab) {
        UserDefaults.standard.set(tab.rawValue, forKey: SettingsTab.defaultsKey)
        NSApp.activate()
        open?()
    }

    /// Listens for the pages' asks, once: as the app launches.
    static func listen() {
        guard observer == nil else { return }
        observer = NotificationCenter.default.addObserver(
            forName: .showAppSettings, object: nil, queue: .main
        ) { note in
            guard let tab = note.userInfo?["tab"] as? SettingsTab else { return }
            Task { @MainActor in show(tab) }
        }
    }
}

extension View {
    /// Keeps this window's `openSettings` for `SettingsOpener`.
    func settingsOpener() -> some View {
        modifier(SettingsOpenerModifier())
    }
}

private struct SettingsOpenerModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.background(OpenSettingsReader())
    }
}

private struct OpenSettingsReader: View {
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        Color.clear
            .onAppear {
                SettingsOpener.open = { openSettings() }
            }
    }
}

/// General: which app opens notebooks, updates (#411), and crash reports
/// (#318).
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
            UpdateSettings()
            CrashReportsSettings()
            LinkRunSettings()
            MCPSettings()
        }
        .formStyle(.grouped)
        .padding()
    }
}

/// The notebooks `ganymede://run` links may run without asking (#303),
/// each with Revoke.
private struct LinkRunSettings: View {
    private let permissions = URLRunPermissions.shared

    var body: some View {
        Section {
            if permissions.paths.isEmpty {
                Text("No notebook may be run from a link without asking.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(permissions.paths, id: \.self) { key in
                    let entry = URLRunPermissions.parts(key)
                    LabeledContent {
                        Button("Revoke") { permissions.revoke(key) }
                            .accessibilityLabel("Revoke \((entry.path as NSString).lastPathComponent)")
                    } label: {
                        Text((entry.path as NSString).lastPathComponent)
                        Text(
                            [entry.path, entry.destination.map { "Output to \($0)" }, entry.withParameters ? "With any parameters" : nil]
                                .compactMap { $0 }
                                .joined(separator: "\n")
                        )
                    }
                }
            }
        } header: {
            Text("Links")
        } footer: {
            Text("A ganymede://run link asks before it first runs a notebook. These notebooks were allowed with Always; a revoked one asks again.")
        }
    }
}

/// MCP for agents outside the app (#304): what they may do, and the
/// config that connects them.
private struct MCPSettings: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Section {
            Picker("Agents may", selection: Binding(
                get: { model.mcpMode },
                set: { model.setMCP($0, images: model.mcpImages) }
            )) {
                ForEach(MCPMode.allCases) { Text($0.title).tag($0) }
            }
            if model.mcpMode != .off {
                Toggle("Send images in outputs to the model", isOn: Binding(
                    get: { model.mcpImages },
                    set: { model.setMCP(model.mcpMode, images: $0) }
                ))
                MCPConfigRow(title: "Claude Code", text: AppMCP.claudeCodeCommand)
                MCPConfigRow(
                    title: "Claude Desktop (claude_desktop_config.json)",
                    text: AppMCP.desktopConfig(command: AppMCP.ganymedeCommand() ?? "ganymede")
                )
                if let server = model.serverURL.flatMap(ServerEndpoint.init(serverURL:)), let token = model.mcpToken {
                    MCPConfigRow(
                        title: "Claude Code, without the ganymede command",
                        text: AppMCP.claudeCodeHTTPCommand(base: server.base, token: token)
                    )
                    LabeledContent("Token") {
                        Button("Reset Token") { model.resetMCPToken() }
                    }
                } else {
                    Text(model.error.map { "Ganymede could not start: \($0)" } ?? "Waiting for the server…")
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("MCP")
        } footer: {
            Text("Lets Claude Code, Claude Desktop and other agents read, edit and run the notebooks open here, and you see each change arrive. Agents set up with `ganymede mcp` use Ganymede while it runs, and a server of their own when it doesn’t. The server listens on this Mac only and needs the token, which opens all of Ganymede’s server: the mode limits what agents do over MCP. Changing this restarts Ganymede’s server and its kernels.")
        }
    }
}

/// A config to copy, with Copy.
private struct MCPConfigRow: View {
    let title: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title)
                Spacer()
                Button("Copy") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(text, forType: .string)
                }
                .accessibilityLabel("Copy the \(title) config")
            }
            Text(text)
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
                .foregroundStyle(.secondary)
        }
    }
}

/// Appearance: the code font (#354).
private struct AppearanceSettings: View {
    var body: some View {
        Form {
            CodeFontSettings()
        }
        .formStyle(.grouped)
        .padding()
    }
}

/// Kernels: where they run, and the kernels installed there (#206, #332).
private struct KernelSettings: View {
    @Environment(AppModel.self) private var model
    @State private var specs: KernelSpecs?
    @State private var error: String?
    /// Bumped to list the kernels again: by Refresh, and when the app
    /// comes back to the front, as a kernelspec may have been installed
    /// or removed meanwhile (#350).
    @State private var reload = 0

    var body: some View {
        Form {
            KernelLocationSection()
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
                        // A remote's list comes through the server's gateway,
                        // which has none until it first reaches the remote.
                        Text(model.kernelRemote == nil ? "No kernels installed." : "No kernels listed yet.")
                            .foregroundStyle(.secondary)
                    }
                } else if let error {
                    Text(error).foregroundStyle(.secondary)
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            } header: {
                HStack {
                    Text("Installed")
                    Spacer()
                    Button("Refresh") { reload += 1 }
                        .disabled(model.serverURL == nil)
                }
            } footer: {
                Text("Kernels are Jupyter kernelspecs. To add TypeScript, run `cdp-kernel install --runtime node`.")
            }
        }
        .formStyle(.grouped)
        .padding()
        // Again when the server restarts, as it does when kernels move, or
        // fails to start. `serverURL` is cleared as a restart begins, so a
        // stopping server isn't asked.
        .task(id: "\(model.serverURL?.absoluteString ?? "")\n\(model.error ?? "")\n\(reload)") { await load() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            reload += 1
        }
    }

    private func load() async {
        guard let server = model.serverURL.flatMap(ServerEndpoint.init(serverURL:)) else {
            specs = nil
            error = model.error.map { "Ganymede could not start: \($0)" } ?? "Waiting for the server…"
            return
        }
        do {
            specs = try await KernelSpecs.load(from: server)
            error = nil
            // A remote's list may not have arrived yet: ask once more.
            if specs?.specs.isEmpty == true, model.kernelRemote != nil {
                try await Task.sleep(nanoseconds: 5_000_000_000)
                specs = try await KernelSpecs.load(from: server)
            }
        } catch {
            // A cancelled load throws URLError(.cancelled), not
            // CancellationError: either way a newer task owns the text.
            if Task.isCancelled { return }
            specs = nil
            self.error = "Couldn’t list the kernels: \(error.localizedDescription)"
        }
    }
}

/// Agent: the agent's settings, as on the iPad and iPhone (#332). The
/// page keeps them, so they are read and saved through the front notebook
/// window's page; every window's page shares them.
private struct AgentSettingsTab: View {
    @State private var page = NotebookWindows.frontPage

    var body: some View {
        Group {
            if let page {
                AgentSettingsView(page: page)
                    .id(ObjectIdentifier(page))
            } else {
                Text("Open a notebook window to change the agent’s settings.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            if page?.webView?.window == nil { page = NotebookWindows.frontPage }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.willCloseNotification)) { _ in
            // The closing window still has its page; look once it has gone.
            DispatchQueue.main.async {
                if page?.webView?.window == nil { page = NotebookWindows.frontPage }
            }
        }
    }
}

/// Shortcuts: the page's list, where each can be rebound (#332).
private struct ShortcutsSettingsTab: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if let server = model.serverURL {
            ShortcutsPane(server: server)
        } else {
            Text(model.error.map { "Ganymede could not start: \($0)" } ?? "Waiting for the server…")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
#endif
