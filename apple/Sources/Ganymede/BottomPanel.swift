#if os(macOS)
import AppKit
import SwiftUI

/// A notebook window's bottom panel (#248): terminals as tabs under the
/// notebook, resized from its top edge. Every terminal stays in the view
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
    /// Titles the shells set, by terminal.
    @State private var titles: [PanelTerminal.ID: String] = [:]
    /// The height when a drag of the top edge began.
    @State private var dragStart: Double?

    var body: some View {
        VStack(spacing: 0) {
            ResizeEdge()
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
                ForEach(panel.terminals) { terminal in
                    let selected = terminal.id == panel.selection
                    TerminalWindow(
                        target: terminal.target,
                        inPanel: true,
                        onTitle: { titles[terminal.id] = $0.isEmpty ? nil : $0 },
                        // Only the terminal on show has the keyboard, so keys
                        // never go to a hidden shell; a new one gets it.
                        focused: selected && panel.isShown
                    )
                        .opacity(selected ? 1 : 0)
                        .allowsHitTesting(selected)
                        .accessibilityHidden(!selected)
                }
                if panel.terminals.isEmpty {
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
        .frame(height: PanelController.clamp(panel.height, available: available))
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack(spacing: 2) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    ForEach(panel.terminals) { terminal in
                        PanelTab(
                            title: titles[terminal.id] ?? model.title(for: terminal.target),
                            selected: terminal.id == panel.selection,
                            select: { panel.selection = terminal.id },
                            close: { close(terminal.id) }
                        )
                    }
                }
                .padding(.horizontal, 6)
            }
            NewTerminalMenu(model: model) { panel.add($0) } local: { panel.add(.local(folder: folder)) }
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
        // keyboard, so hand it to the notebook here. Otherwise the next
        // selected terminal takes it.
        if panel.terminals.count == 1, let window = NSApp.keyWindow {
            returnKeyboardToPage(in: window)
        }
        panel.close(id)
    }
}

/// One terminal's tab in the panel header.
private struct PanelTab: View {
    let title: String
    let selected: Bool
    let select: () -> Void
    let close: () -> Void
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 4) {
            Button(action: select) {
                Label(title, systemImage: "terminal")
                    .labelStyle(.titleAndIcon)
                    .lineLimit(1)
                    .font(.callout.weight(selected ? .semibold : .regular))
            }
            .buttonStyle(.plain)
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.semibold))
            }
            .buttonStyle(.borderless)
            .opacity(selected || hovering ? 1 : 0)
            .help("Close Terminal")
            .accessibilityLabel("Close \(title)")
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

/// View › Show/Hide Terminal Panel (⌃`), for the front notebook window.
/// As a menu shortcut it comes before the terminal, so programs in a panel
/// terminal don't get ⌃` (NUL); terminal windows of their own still do.
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
