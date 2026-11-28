#if os(macOS)
import AppKit
import SwiftUI

/// The app's one Settings window (⌘,, #206, #332): everything the app
/// lets you set, at one fixed size. The page's own Settings, Keyboard
/// Shortcuts and Connect sheets are for the browser; in the app they open
/// a tab here (`SettingsTab`, `SettingsOpener`).
struct SettingsWindow: View {
    @AppStorage(SettingsTab.defaultsKey) private var tab = SettingsTab.general
    /// General's "Show Developer Settings" (#698).
    @AppStorage(SettingsTab.developerKey) private var developer = false

    var body: some View {
        // The kept tab can be Developer while it's hidden: show General.
        TabView(selection: Binding(get: { tab.shown(developer: developer) }, set: { tab = $0 })) {
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
            // The crash report tests (#698).
            if developer {
                DeveloperSettings()
                    .padding()
                    .tabItem { Label("Developer", systemImage: "hammer") }
                    .tag(SettingsTab.developer)
            }
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

/// General: which app opens notebooks, updates (#411), crash reports
/// (#318), and the switch for the Developer tab (#698).
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
            CommandLineToolSettings()
            BackgroundServerSettings()
            LinkRunSettings()
            MCPSettings()
            TailnetSettings()
            SpotlightSettingsSection()
            ShowDeveloperSettingsSection()
        }
        .formStyle(.grouped)
        .padding()
    }
}

/// Installing the `ganymede` command line tool the app bundles (#686): a
/// link at `~/.local/bin/ganymede`. Hidden when this build has none.
private struct CommandLineToolSettings: View {
    private let bundled = CommandLineTool.bundledTool()
    private let link = CommandLineTool.defaultLink()
    @State private var state = CommandLineTool.state(
        bundled: CommandLineTool.bundledTool(), link: CommandLineTool.defaultLink()
    )
    @State private var error: String?
    /// `--version` of the other `ganymede` on the PATH, once it has run.
    @State private var otherVersion: String?
    @State private var confirmingReplace = false

    var body: some View {
        if bundled != nil {
            Group {
                Section {
                    LabeledContent("ganymede") {
                        Text(statusText(state.status))
                            .foregroundStyle(.secondary)
                    }
                    Text("Installs to ~/.local/bin/ganymede")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    buttons(state.status)
                    if let error {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                    if let other = state.otherOnPath {
                        Text(otherText(other, installed: state.status == .installed))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if !state.directoryOnPath, mayNeedPath(state.status) {
                        Text(CommandLineTool.pathAdvice())
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        MCPConfigRow(title: "PATH line", text: CommandLineTool.pathLine)
                    }
                } header: {
                    Text("Command Line Tool")
                } footer: {
                    Text("A link to the ganymede command inside the app, for Terminal and agents. It stops working if you move or delete the app. Ganymede replaces only a link it made, unless you choose Replace.")
                }
            }
            .onAppear { refresh() }
            .confirmationDialog(
                "Replace \(link.path)?", isPresented: $confirmingReplace, titleVisibility: .visible
            ) {
                Button("Move to Trash and Install", role: .destructive) {
                    run { try CommandLineTool.install(bundled: bundled, link: link, force: true) }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                if case .blocked(let what) = state.status {
                    Text("There is \(what) there now. It moves to the Trash, and ganymede from this app is linked in its place.")
                }
            }
            .task(id: state.otherOnPath) {
                otherVersion = nil
                guard let other = state.otherOnPath else { return }
                // Runs the other tool, which can be slow: not on the main thread.
                otherVersion = await Task.detached { CommandLineTool.version(of: other) }.value
            }
        }
    }

    private func otherText(_ other: String, installed: Bool) -> String {
        let name = otherVersion.map { "\(other) (\($0))" } ?? other
        return installed
            ? "On your login shell’s PATH, \(name) comes first, not this one. Put ~/.local/bin earlier on your PATH to use this one."
            : "Another ganymede is already on your login shell’s PATH: \(name)."
    }

    private func mayNeedPath(_ status: CommandLineTool.Status) -> Bool {
        switch status {
        case .installed, .stale, .notInstalled: true
        case .unavailable, .blocked: false
        }
    }

    private func statusText(_ status: CommandLineTool.Status) -> String {
        switch status {
        case .unavailable: "Not in this build"
        case .notInstalled: "Not installed"
        case .installed: "Installed"
        case .stale: "Points at another copy of Ganymede"
        case .blocked(let what): "Another ganymede is there: \(what)"
        }
    }

    @ViewBuilder
    private func buttons(_ status: CommandLineTool.Status) -> some View {
        switch status {
        case .notInstalled:
            Button("Install") { run { try CommandLineTool.install(bundled: bundled, link: link) } }
        case .installed:
            Button("Uninstall") { run { try CommandLineTool.uninstall(link: link) } }
        case .stale:
            HStack {
                Button("Update Link") { run { try CommandLineTool.install(bundled: bundled, link: link) } }
                Button("Uninstall") { run { try CommandLineTool.uninstall(link: link) } }
            }
        case .blocked:
            Button("Replace…") { confirmingReplace = true }
        case .unavailable:
            EmptyView()
        }
    }

    private func run(_ action: () throws -> Void) {
        do {
            try action()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        refresh()
    }

    private func refresh() {
        state = CommandLineTool.state(bundled: bundled, link: link)
    }
}

/// Keeping Ganymede's bundled server running in the background as a macOS
/// LaunchAgent (#912). Hidden when this build has no bundled CLI.
private struct BackgroundServerSettings: View {
    @Environment(AppModel.self) private var model
    private let bundled = CommandLineTool.bundledTool()
    @State private var controller = BackgroundServerController()

    var body: some View {
        if bundled != nil {
            Section {
                Toggle("Keep Ganymede running in the background", isOn: Binding(
                    get: { controller.isEnabled },
                    set: {
                        controller.setEnabled($0)
                        model.menuBar.refreshBackgroundStatus()
                    }
                ))
                if let status = controller.statusText {
                    HStack {
                        Text(status)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if controller.needsApproval {
                            Spacer()
                            Button("Open Login Items…") {
                                controller.openLoginItemsSettings()
                            }
                            .controlSize(.small)
                        }
                    }
                }
                if let error = controller.error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            } header: {
                Text("Background Server")
            } footer: {
                Text("Runs Ganymede’s bundled server in the background as a Login Item so it stays running between app launches. Settings come from ganymede.toml.")
            }
            .onAppear { controller.refresh() }
            .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
                controller.refresh()
            }
        }
    }
}

/// The notebooks `ganymede://run` links may run without asking (#303),
/// each with Revoke.
private struct LinkRunSettings: View {
    private let permissions = URLRunPermissions.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Section {
            if permissions.paths.isEmpty {
                Text("No notebook may be run from a link or a Shortcuts action without asking.")
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
                            [entry.path, entry.destination.map { $0 == AppURL.shortcutsDestination ? "From \($0)" : "Output to \($0)" }, entry.withParameters ? "With any parameters" : nil]
                                .compactMap { $0 }
                                .joined(separator: "\n")
                        )
                    }
                }
            }
        } header: {
            Text("Links")
        } footer: {
            Text("A ganymede://run link, or a Shortcuts action that runs a notebook, asks before it first runs one. These notebooks were allowed with Always; a revoked one asks again, and so does one that was changed outside Ganymede.")
        }
        // A notebook replaced since its answer was kept has none to list.
        .onAppear { permissions.pruneStale() }
        // And when the app comes back from a change made outside it.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { permissions.pruneStale() }
        }
        // On the Mac the scene stays active when the app is switched away
        // from, so the app becoming active is the moment.
        #if os(macOS)
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            permissions.pruneStale()
        }
        #endif
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
                    text: AppMCP.desktopConfig(
                        command: CommandLineTool.desktopCommand()
                    )
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
            Text("Lets Claude Code, Claude Desktop and other agents read, edit and run the notebooks open here, and you see each change arrive. Agents set up with `ganymede mcp` use Ganymede while it runs, and a server of their own when it doesn’t. The server listens on this Mac only and needs the token. Agents set up either way get a token that opens MCP and nothing else, and the mode limits what they do there; an agent that can run code can still reach the rest of the server. Changing this restarts Ganymede’s server and its kernels.")
        }
    }
}

/// Sharing the app's server on the tailnet through `tailscale serve`
/// (ganymede#816), with the logins let in without the token.
private struct TailnetSettings: View {
    @Environment(AppModel.self) private var model
    @State private var allowText = ""
    /// The login this Mac is signed in to Tailscale as, once known.
    @State private var ownLogin: String?

    private var allow: [String] { AppTailnet.allowList(allowText) }

    var body: some View {
        Section {
            Toggle("Share on my tailnet", isOn: Binding(
                get: { model.tailnetShare },
                set: { model.setTailnet(share: $0, allow: allow) }
            ))
            .disabled(!model.tailnetShare && allow.isEmpty)
            if !model.tailnetShare && allow.isEmpty {
                Text("Enter at least one Tailscale login under “Let in without the token” to turn this on.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            LabeledContent("Let in without the token") {
                HStack {
                    TextField("you@example.com", text: $allowText)
                        .labelsHidden()
                        .onSubmit { apply() }
                    if allow.isEmpty, let login = ownLogin {
                        Button("Use Mine") { allowText = login }
                            .help("Fill in \(login), the login this Mac is signed in to Tailscale as")
                    }
                    Button("Apply") { apply() }
                        .disabled(allow == model.tailnetAllow)
                }
            }
            if model.tailnetShare {
                if let url = model.tailnetURL {
                    LabeledContent("Address") {
                        Link(url.absoluteString, destination: url)
                            .textSelection(.enabled)
                    }
                } else if let error = model.tailnetError {
                    Text(error)
                        .foregroundStyle(.red)
                } else {
                    Text(model.error.map { "Ganymede could not start: \($0)" } ?? "Sharing…")
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("Tailnet")
        } footer: {
            Text("Opens Ganymede to your other devices at this Mac’s tailnet name over HTTPS, through `tailscale serve`. The logins listed (your Tailscale login, such as you@example.com) get in without the token; no one else can, since the token stays with this app. Ganymede trusts the login Tailscale sends only from this Mac, and any program on this Mac could send one too, so turn this on only on a Mac you alone use. Agents still need the MCP token. Turning it off removes the `tailscale serve` setting. Changing this restarts Ganymede’s server and its kernels.")
        }
        .onAppear { allowText = model.tailnetAllow.joined(separator: ", ") }
        .task { ownLogin = await AppTailnet.loadOwnLogin() }
    }

    private func apply() {
        let list = allow
        model.setTailnet(share: model.tailnetShare && !list.isEmpty, allow: list)
        allowText = list.joined(separator: ", ")
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
    var body: some View {
        Form {
            KernelLocationSection()
            InstalledKernelsSection()
        }
        .formStyle(.grouped)
        .padding()
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
