import SwiftUI
#if os(macOS)
import AppKit
#endif

#if os(macOS)
/// The folder of the focused notebook window: its notebook's folder, or
/// the folder it shows. New Terminal starts there.
struct WindowFolderKey: FocusedValueKey {
    typealias Value = URL
}

extension FocusedValues {
    var windowFolder: URL? {
        get { self[WindowFolderKey.self] }
        set { self[WindowFolderKey.self] = newValue }
    }
}
#endif

/// A terminal window: a shell on the chosen server, through
/// `/api/terminals`, or on a remote over SSH. Closing the window ends the
/// shell. When the session ends (on iOS, also when the system drops the
/// connection in the background) it offers to reconnect.
struct TerminalWindow: View {
    @Environment(AppModel.self) private var model
    let target: TerminalTarget
    /// In a notebook window's bottom panel (#248): no window title or
    /// minimum window size of its own; the title goes to `onTitle`.
    var inPanel = false
    var onTitle: ((String) -> Void)?
    /// Whether the terminal has the keyboard; see `TerminalSurface.focused`.
    var focused: Bool?
    /// Its id for moving between the panel and a tab (#248), on the Mac:
    /// the panel terminal's id, or the window's `TerminalRequest` id. A
    /// terminal moving here under this id brings its session and screen.
    var handoff: UUID?
    #if os(macOS)
    /// For the Running list (#246): what shows this terminal and what ends
    /// it, besides its window coming to the front. Left out, closing the
    /// window ends it.
    var reveal: (() -> Void)?
    var shutDown: (() -> Void)?
    /// Its entry in `OpenTerminals`, and its place in `TerminalHandoff`.
    @State private var entry = UUID()
    @State private var window = WeakWindow()
    #endif
    @State private var transport: TerminalTransport?
    @State private var title = ""
    /// Why the session ended, once it has.
    @State private var ended: String?
    /// Bumped on reconnect, so the terminal view is made anew.
    @State private var generation = 0

    var body: some View {
        VStack(spacing: 0) {
            if let transport {
                TerminalSurface(
                    transport: transport,
                    onTitle: { title = $0; onTitle?($0) },
                    onEnd: { reason in
                        ended = reason ?? "Session ended."
                        #if os(macOS)
                        // An ended session doesn't move; Reconnect makes a new one.
                        if let handoff { TerminalHandoff.shared.unregister(handoff, owner: entry) }
                        #endif
                    },
                    focused: focused,
                    handoff: handoff
                )
                    .id(generation)
            } else if let problem {
                Text(problem)
                    .foregroundStyle(.secondary)
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            if let ended, transport != nil {
                HStack {
                    Text(ended)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                    Spacer()
                    Button("Reconnect", action: reconnect)
                }
                .padding(8)
                .background(.bar)
            }
        }
        .modifier(OwnWindow(enabled: !inPanel, title: title.isEmpty ? defaultTitle : title))
        .onAppear(perform: connect)
        .onChange(of: model.url) { connect() }
        #if os(macOS)
        .background(WindowReader { window.window = $0 })
        .onAppear(perform: register)
        .onChange(of: title) { register() }
        .onDisappear {
            OpenTerminals.shared.remove(entry)
            if let handoff { TerminalHandoff.shared.unregister(handoff, owner: entry) }
        }
        .modifier(MoveToPanelButton(
            enabled: !inPanel && handoff != nil,
            disabled: transport == nil || ended != nil,
            action: moveToPanel
        ))
        #endif
    }

    #if os(macOS)
    /// Moves this terminal into the bottom panel of a notebook window, a
    /// tab of this window first (#248); its shell keeps running there. With
    /// no notebook window open, it stays.
    private func moveToPanel() {
        guard let handoff, let window = window.window,
              let nearest = PanelController.nearest(to: window)
        else {
            NSSound.beep()
            return
        }
        let terminal = PanelTerminal(id: handoff, target: target)
        let panel = nearest.panel
        let moving = TerminalHandoff.shared.move(handoff) { [weak host = nearest.window] in
            panel.adopt(terminal)
            host?.makeKeyAndOrderFront(nil)
        }
        guard moving else {
            NSSound.beep()
            return
        }
        window.performClose(nil)
    }

    /// Lists the terminal, or updates its title, in `OpenTerminals`, and
    /// its session in `TerminalHandoff`.
    private func register() {
        if let handoff, let transport {
            TerminalHandoff.shared.register(handoff, owner: entry, target: target, transport: transport, title: title)
        }
        let window = window
        let reveal = reveal
        let shutDown = shutDown
        OpenTerminals.shared.update(.init(
            id: entry,
            title: title.isEmpty ? defaultTitle : title,
            inPanel: inPanel,
            reveal: {
                reveal?()
                window.window?.makeKeyAndOrderFront(nil)
            },
            close: shutDown ?? { window.window?.performClose(nil) }
        ))
    }
    #endif

    private func reconnect() {
        // Say why when what the session needs is gone (the key, the user,
        // or the remote itself).
        if let problem {
            ended = problem
            return
        }
        guard let next = makeTransport() else { return }
        ended = nil
        title = ""
        // The panel's tab goes back to its own title until the new shell sets one.
        onTitle?("")
        generation += 1
        transport = next
        #if os(macOS)
        register()
        #endif
    }

    /// The transport for the target, once what it needs is known (#860): the
    /// model's, which `TerminalTarget.transport(on:)` switches in a file the
    /// tests compile.
    private func makeTransport() -> TerminalTransport? {
        model.transport(for: target)
    }

    private var defaultTitle: String {
        model.title(for: target)
    }

    private var problem: String? {
        switch target {
        case .local:
            #if os(iOS)
            return "This device has no local terminal."
            #else
            return model.error.map { "Ganymede could not start: \($0)" }
            #endif
        case .server(let id, _):
            return model.remote(id)?.hasServer != true ? "This remote is gone or has no server. \(settings)" : nil
        case .ssh(let id):
            guard let ssh = model.remote(id)?.ssh else {
                return "This remote is gone or has no SSH host. \(settings)"
            }
            #if os(iOS)
            if ssh.user.isEmpty { return "Set the SSH user for this remote. \(settings)" }
            if model.sshKey == nil { return "Generate or import an SSH key first. \(settings)" }
            #else
            _ = ssh
            #endif
            return nil
        }
    }

    private var settings: String {
        #if os(macOS)
        "Check Settings (⌘,)."
        #else
        "Check Remotes."
        #endif
    }

    /// Opens the terminal once its server is known. Only once: a window
    /// keeps its shell even if the server restarts under it, and shows
    /// the session ending instead.
    private func connect() {
        guard transport == nil else { return }
        #if os(macOS)
        // A terminal moved here (#248): its session, already running.
        if let handoff, let arriving = TerminalHandoff.shared.arriving(handoff) {
            transport = arriving.transport
            title = arriving.title
            onTitle?(arriving.title)
            register()
            return
        }
        #endif
        guard problem == nil else { return }
        transport = makeTransport()
        #if os(macOS)
        register()
        #endif
    }
}

#if os(macOS)
/// The window a terminal is in, without keeping it open.
final class WeakWindow {
    weak var window: NSWindow?
}

/// A terminal tab's Move to Panel toolbar button (#248); none in a panel,
/// where a toolbar item would land in the notebook window's toolbar.
private struct MoveToPanelButton: ViewModifier {
    let enabled: Bool
    let disabled: Bool
    let action: () -> Void

    func body(content: Content) -> some View {
        if enabled {
            content.toolbar {
                ToolbarItem {
                    Button(action: action) {
                        Label("Move to Panel", systemImage: "rectangle.bottomthird.inset.filled")
                    }
                    .help("Move this terminal into a notebook window’s bottom panel")
                    .disabled(disabled)
                }
            }
        } else {
            content
        }
    }
}
#endif

/// A terminal window's title and minimum size, left off in a panel.
private struct OwnWindow: ViewModifier {
    let enabled: Bool
    let title: String

    func body(content: Content) -> some View {
        if enabled {
            content
                #if os(macOS)
                .frame(minWidth: 480, minHeight: 280)
                #endif
                .navigationTitle(title)
        } else {
            content
        }
    }
}

extension AppModel {
    /// What a terminal on `target` is called before its shell names it.
    func title(for target: TerminalTarget) -> String {
        switch target {
        case .local(let folder): "Terminal in \((folder ?? root).lastPathComponent)"
        case .server(let id, _): "Terminal on \(remote(id)?.title ?? "remote")"
        case .ssh(let id): "SSH to \(remote(id)?.title ?? "remote")"
        }
    }

    /// The transport a terminal on `target` starts on (#860), once what it
    /// needs is known: what the view asks for, so the switch from a target to
    /// what runs it is `TerminalTarget.transport(on:)`, which the tests
    /// compile, and not the view's own.
    @MainActor
    func transport(for target: TerminalTarget) -> TerminalTransport? {
        target.transport(on: self)
    }
}

extension AppModel: TerminalHost {
    /// The app's model as a terminal's host (#860): `localServer`, `root`
    /// and `server(of:)` are its own, and an SSH terminal's transport is the
    /// one thing that differs by platform.
    @MainActor
    func sshTransport(for id: UUID) -> TerminalTransport? {
        guard let ssh = remote(id)?.ssh else { return nil }
        #if os(macOS)
        return ProcessTerminalTransport(executable: "/usr/bin/ssh", arguments: ssh.arguments)
        #else
        guard let key = sshKey, !ssh.user.isEmpty else { return nil }
        return SSHTerminalTransport(
            target: .init(remote: id, host: ssh.host, port: ssh.port ?? 22, user: ssh.user),
            key: key,
            hostKeys: hostKeys
        )
        #endif
    }
}

#if os(iOS)
/// The toolbar's terminal menu: a new terminal on the machine the scene
/// shows (#858), and each of the remotes' with SSH or a server.
struct TerminalMenu: View {
    var model: AppModel
    /// What a new terminal on the scene's own machine runs on; nil for this
    /// device, whose terminals are the remotes' in the panel, as before.
    var newTerminal: TerminalTarget?
    let open: (TerminalRequest) -> Void

    var body: some View {
        let remotes = model.remotes.filter { $0.hasServer || $0.ssh != nil }
        Menu {
            if let newTerminal {
                Button("New Terminal") { open(TerminalRequest(target: newTerminal)) }
            }
            if newTerminal != nil, !remotes.isEmpty { Divider() }
            ForEach(remotes) { remote in
                if remote.ssh != nil {
                    Button("\(remote.title) (SSH)") { open(TerminalRequest(target: .ssh(remote.id))) }
                }
                if remote.hasServer {
                    Button("\(remote.title) (Server)") { open(TerminalRequest(target: .server(remote.id))) }
                }
            }
        } label: {
            Label("Terminal", systemImage: "terminal")
        }
        .disabled(newTerminal == nil && remotes.isEmpty)
    }
}

/// A terminal scene of its own on iPad.
struct TerminalScene: View {
    @Environment(AppModel.self) private var model
    let request: TerminalRequest?

    var body: some View {
        NavigationStack {
            if let request {
                TerminalWindow(target: request.target)
                    .navigationBarTitleDisplayMode(.inline)
            } else {
                Text("This terminal was closed.")
                    .foregroundStyle(.secondary)
            }
        }
    }
}
#endif

#if os(macOS)
/// File > New Terminal and New Terminal On, for the window scene that
/// `GanymedeApp` declares.
struct TerminalCommands: View {
    @Environment(\.openWindow) private var openWindow
    var model: AppModel
    @FocusedValue(\.windowScope) private var scope
    @FocusedValue(\.pageModel) private var page
    /// The front notebook window's bottom panel, where new terminals go
    /// (#248); a window of their own when no notebook window is in front.
    @FocusedValue(\.panelController) private var panel

    var body: some View {
        let target = newTerminal
        Button("New Terminal") {
            if let target { open(target) }
        }
        .keyboardShortcut("`", modifiers: [.control, .shift])
        .disabled(target == nil)
        Button("New Terminal Tab") {
            if let target { openWindow(value: TerminalRequest(target: target)) }
        }
        .disabled(target == nil)
        // One item per way in: a remote with both a server and SSH gets two.
        Menu("New Terminal On") {
            ForEach(model.remotes) { remote in
                if remote.ssh != nil {
                    Button("\(remote.title) (SSH)") {
                        open(.ssh(remote.id))
                    }
                }
                if remote.hasServer {
                    Button("\(remote.title) (Server)") {
                        open(.server(remote.id))
                    }
                }
            }
        }
        .disabled(!model.remotes.contains { $0.hasServer || $0.ssh != nil })
    }

    /// What this window's New Terminal opens (#858): a shell on this Mac, or
    /// on the machine the window shows, in the folder of the notebook there.
    /// With no window in front, a shell on this Mac's root, as before.
    private var newTerminal: TerminalTarget? {
        guard let scope else { return .local(folder: model.root) }
        return scope.terminalTarget(notebook: page?.state.path, remotes: model.remotes)
    }

    private func open(_ target: TerminalTarget) {
        if let panel {
            panel.add(target)
        } else {
            openWindow(value: TerminalRequest(target: target))
        }
    }
}
#endif
