#if os(macOS)
import AppKit
import SwiftTerm
import SwiftUI

/// A notebook window's bottom panel (#248): the notebook kernel's log and
/// terminals as tabs under the notebook, resized from its top edge. Every terminal stays in the view
/// tree while the panel is hidden or another tab is selected, so its shell
/// keeps running; closing a tab ends it.
struct BottomPanel: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var panel: PanelController
    /// Where a new local terminal starts: the window's folder.
    let folder: URL
    /// The height of the area the notebook and panel share, for the limit
    /// on how tall the panel gets.
    let available: Double
    /// The open notebook's kernel, for the Kernel Log tab; nil with none.
    let kernelID: String?
    /// The server the page uses, which keeps the kernel's log.
    let server: ServerEndpoint?
    /// It fills the window (#250): as tall as the area, not resizable.
    var fills = false
    /// Its fill control: fills the window, or restores the layout.
    var toggleFill: () -> Void = {}
    /// Titles the shells set, by terminal.
    @State private var titles: [PanelTerminal.ID: String] = [:]
    /// The height when a drag of the top edge began.
    @State private var dragStart: Double?

    var body: some View {
        VStack(spacing: 0) {
            ResizeEdge()
                .allowsHitTesting(!fills)
                .gesture(
                    DragGesture(minimumDistance: 1, coordinateSpace: .global)
                        .onChanged { drag in
                            // From the height drawn, which a shorter window may clamp.
                            let start = dragStart ?? PanelController.clamp(panel.height, available: available)
                            dragStart = start
                            panel.resize(to: start - drag.translation.height, available: available)
                            NSCursor.resizeUpDown.set()
                        }
                        .onEnded { _ in dragStart = nil }
                )
            header
            Divider()
            ZStack {
                KernelLogView(
                    kernelID: kernelID,
                    server: server,
                    active: panel.isShown && panel.showsLog
                )
                    .opacity(panel.showsLog ? 1 : 0)
                    .allowsHitTesting(panel.showsLog)
                    .accessibilityHidden(!panel.showsLog)
                ForEach(panel.terminals) { terminal in
                    let selected = terminal.id == panel.selection && !panel.showsLog
                    TerminalWindow(
                        target: terminal.target,
                        inPanel: true,
                        onTitle: { titles[terminal.id] = $0.isEmpty ? nil : $0 },
                        // Only the terminal on show has the keyboard, so keys
                        // never go to a hidden shell; a new one gets it.
                        focused: selected && panel.isShown,
                        reveal: {
                            panel.select(terminal.id)
                            panel.isShown = true
                        },
                        shutDown: { close(terminal.id) }
                    )
                        .opacity(selected ? 1 : 0)
                        .allowsHitTesting(selected)
                        .accessibilityHidden(!selected)
                }
                if panel.terminals.isEmpty && !panel.showsLog {
                    VStack(spacing: 8) {
                        Text("No terminals").foregroundStyle(.secondary)
                        Button("New Terminal") { panel.add(.local(folder: folder)) }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        // Kept within the window as it gets shorter; the stored height
        // comes back when it grows.
        .frame(height: fills ? nil : CGFloat(PanelController.clamp(panel.height, available: available)))
        .frame(maxHeight: fills ? .infinity : nil)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack(spacing: 2) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    PanelTab(
                        title: "Kernel Log",
                        systemImage: "doc.plaintext",
                        selected: panel.showsLog,
                        select: { panel.showLog() },
                        close: nil
                    )
                    ForEach(panel.terminals) { terminal in
                        PanelTab(
                            title: titles[terminal.id] ?? model.title(for: terminal.target),
                            systemImage: "terminal",
                            selected: terminal.id == panel.selection && !panel.showsLog,
                            select: { panel.select(terminal.id) },
                            close: { close(terminal.id) }
                        )
                    }
                }
                .padding(.horizontal, 6)
            }
            NewTerminalMenu(model: model) { panel.add($0) } local: { panel.add(.local(folder: folder)) }
            FillButton(fills: fills, area: "panel", action: toggleFill)
            Button {
                panel.isShown = false
            } label: {
                Image(systemName: "chevron.down")
            }
            .buttonStyle(.borderless)
            .help("Hide the panel (⌃`)")
            .padding(.trailing, 8)
        }
        .frame(height: 28)
    }

    private func close(_ id: PanelTerminal.ID) {
        titles[id] = nil
        // The last terminal's view goes away rather than giving up the
        // keyboard, so hand it to the notebook here, if a terminal had it
        // (the click on × came from this, the key window). Otherwise the
        // next selected terminal takes it.
        if panel.terminals.count == 1, !panel.showsLog, let window = NSApp.keyWindow,
           window.firstResponder is TerminalView {
            returnKeyboardToPage(in: window)
        }
        panel.close(id)
    }
}

/// One tab in the panel header: the Kernel Log, or a terminal (with ×).
private struct PanelTab: View {
    let title: String
    let systemImage: String
    let selected: Bool
    let select: () -> Void
    let close: (() -> Void)?
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 4) {
            Button(action: select) {
                Label(title, systemImage: systemImage)
                    .labelStyle(.titleAndIcon)
                    .lineLimit(1)
                    .font(.callout.weight(selected ? .semibold : .regular))
            }
            .buttonStyle(.plain)
            if let close {
                Button(action: close) {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.semibold))
                }
                .buttonStyle(.borderless)
                .opacity(selected || hovering ? 1 : 0)
                .help("Close Terminal")
                .accessibilityLabel("Close \(title)")
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(
            RoundedRectangle(cornerRadius: 5)
                .fill(selected ? Color.primary.opacity(0.1) : .clear)
        )
        .onHover { hovering = $0 }
    }
}

/// The Kernel Log tab: the open notebook kernel's stdout, stderr and the
/// server's lines about its process, followed while the tab is on show.
private struct KernelLogView: View {
    let kernelID: String?
    let server: ServerEndpoint?
    /// On show: only then does it ask the server.
    let active: Bool
    @State private var log = KernelLog()
    @State private var error: String?
    /// The kernel `log` is for.
    @State private var lastKernel: String?

    var body: some View {
        Group {
            if kernelID == nil || server == nil {
                note("No kernel is running for this notebook.")
            } else if log.status == .unsupported {
                note("This server doesn't keep kernel logs. A newer Ganymede server does.")
            } else if log.status == .noProcess {
                note("This kernel runs on a gateway or inside the server, so this server has no log for it.")
            } else if log.lines.isEmpty {
                note(error ?? "No log lines yet.")
            } else {
                lines
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: "\(kernelID ?? "")\n\(server?.base.absoluteString ?? "")\n\(active)") {
            await follow()
        }
    }

    private var lines: some View {
        ScrollViewReader { reader in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 1) {
                    ForEach(log.lines) { line in
                        Text(line.text)
                            .foregroundStyle(color(of: line))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .id(line.seq)
                    }
                }
                .font(.system(.callout, design: .monospaced))
                .textSelection(.enabled)
                .padding(8)
            }
            .onChange(of: log.after) { last in reader.scrollTo(last, anchor: .bottom) }
            .onAppear { reader.scrollTo(log.after, anchor: .bottom) }
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding()
    }

    private func color(of line: KernelLog.Line) -> SwiftUI.Color {
        switch line.source {
        case "stderr": return .red
        case "host": return .secondary
        default: return .primary
        }
    }

    /// Reads new lines every second while on show. A new kernel starts a
    /// new log.
    private func follow() async {
        guard let kernelID, let server else { return }
        if lastKernel != kernelID {
            log = KernelLog()
            error = nil
            lastKernel = kernelID
        }
        while active, !Task.isCancelled {
            var more = false
            do {
                let request = KernelLog.request(kernel: kernelID, after: log.after, on: server)
                let (data, response) = try await URLSession.shared.data(for: request)
                // A newer task (another kernel) owns the log now.
                if Task.isCancelled { return }
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                if code == 404 {
                    log.markUnsupported()
                    return
                }
                guard (200..<300).contains(code), let page = KernelLog.Page(json: data) else {
                    throw URLError(.badServerResponse)
                }
                error = nil
                more = log.append(page)
                if log.status == .noProcess { return }
            } catch {
                // A cancelled load throws URLError(.cancelled).
                if Task.isCancelled { return }
                self.error = "Couldn't read the kernel log: \(error.localizedDescription)"
            }
            if !more {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }
}

/// The panel's + menu: a terminal in the window's folder, or on a remote.
private struct NewTerminalMenu: View {
    @ObservedObject var model: AppModel
    let add: (TerminalTarget) -> Void
    let local: () -> Void

    var body: some View {
        Menu {
            Button("New Terminal", action: local)
            let remotes = model.remotes.filter { $0.hasServer || $0.ssh != nil }
            if !remotes.isEmpty {
                Divider()
                ForEach(remotes) { remote in
                    if remote.ssh != nil {
                        Button("\(remote.title) (SSH)") { add(.ssh(remote.id)) }
                    }
                    if remote.hasServer {
                        Button("\(remote.title) (Server)") { add(.server(remote.id)) }
                    }
                }
            }
        } label: {
            Image(systemName: "plus")
        } primaryAction: {
            local()
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .help("New Terminal (⌃⇧`)")
    }
}

/// The panel's top edge, dragged to resize it.
private struct ResizeEdge: View {
    var body: some View {
        Rectangle()
            .fill(Color(nsColor: .separatorColor))
            .frame(height: 1)
            .padding(.vertical, 2)
            .contentShape(Rectangle())
            .onHover { inside in
                // set, not push/pop: an exit can be lost when the panel
                // hides under the pointer, which would leave the stack off.
                if inside { NSCursor.resizeUpDown.set() } else { NSCursor.arrow.set() }
            }
    }
}

/// An area's control to fill the window with it, or restore the layout
/// (#250).
struct FillButton: View {
    let fills: Bool
    /// The area, for the help tag: "panel", "inspector".
    let area: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: fills ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
        }
        .buttonStyle(.borderless)
        .help(fills ? "Restore the layout (⇧⌘↩)" : "Fill the window with the \(area)")
        .accessibilityLabel(fills ? "Restore Layout" : "Fill Window")
    }
}

/// View › Show/Hide Terminal Panel (⌃`), for the front notebook window.
/// As a menu shortcut it comes before the terminal, so programs in a panel
/// terminal don't get ⌃` (NUL); terminals in a tab of their own still do.
struct PanelCommands: View {
    @FocusedObject private var panel: PanelController?
    @FocusedValue(\.windowFolder) private var folder
    @ObservedObject var model: AppModel

    var body: some View {
        Button(panel?.isShown == true ? "Hide Terminal Panel" : "Show Terminal Panel") {
            panel?.toggle(startingOn: .local(folder: folder ?? model.root))
        }
        .keyboardShortcut("`", modifiers: [.control])
        .disabled(panel == nil)
    }
}
#endif
