#if os(iOS)
import SwiftUI
import UIKit

/// The iPad's bottom panel (#251), as the Mac's (#248): terminals as tabs
/// under the notebook, resized by dragging its top edge. Every terminal
/// stays in the view tree while the panel is hidden or another tab is
/// selected, so its session keeps running; closing a tab ends it. The
/// iPad has no local shell, so its terminals are on remotes.
struct IPadPanel: View {
    @Environment(AppModel.self) private var model
    var panel: PanelController
    /// The height of the area the notebook and panel share.
    let available: Double
    /// Whether the panel is on screen: shown, and not under a filled
    /// screen.
    let shown: Bool
    /// Whether the panel fills that area, the notebook hidden.
    @Binding var filling: Bool
    /// Titles the shells set, by terminal.
    @State private var titles: [PanelTerminal.ID: String] = [:]
    /// The height when a drag of the top edge began.
    @State private var dragStart: Double?

    var body: some View {
        VStack(spacing: 0) {
            if !filling { grabber }
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
                        focused: selected && shown
                    )
                    .opacity(selected ? 1 : 0)
                    .allowsHitTesting(selected)
                    .accessibilityHidden(!selected)
                }
                if panel.terminals.isEmpty {
                    VStack(spacing: 8) {
                        Text("No terminals").foregroundStyle(.secondary)
                        if remotes.isEmpty {
                            Text("Add a remote with SSH or a server in Settings.")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(height: filling ? nil : PanelController.clamp(panel.height, available: available))
        .background(Color(uiColor: .secondarySystemBackground))
    }

    /// The top edge: a handle to drag, as on a sheet.
    private var grabber: some View {
        Capsule()
            .fill(Color.secondary.opacity(0.5))
            .frame(width: 36, height: 5)
            .frame(maxWidth: .infinity, minHeight: 16)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 1, coordinateSpace: .global)
                    .onChanged { drag in
                        let start = dragStart ?? PanelController.clamp(panel.height, available: available)
                        dragStart = start
                        panel.resize(to: start - drag.translation.height, available: available)
                    }
                    .onEnded { _ in dragStart = nil }
            )
            .accessibilityLabel("Resize the panel")
    }

    private var header: some View {
        HStack(spacing: 4) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(panel.terminals) { terminal in
                        IPadPanelTab(
                            title: titles[terminal.id] ?? model.title(for: terminal.target),
                            selected: terminal.id == panel.selection,
                            select: { panel.selection = terminal.id },
                            close: { close(terminal.id) }
                        )
                    }
                }
                .padding(.horizontal, 8)
            }
            Menu {
                ForEach(remotes) { remote in
                    if remote.ssh != nil {
                        Button("\(remote.title) (SSH)") { panel.add(.ssh(remote.id)) }
                    }
                    if remote.hasServer {
                        Button("\(remote.title) (Server)") { panel.add(.server(remote.id)) }
                    }
                }
            } label: {
                Image(systemName: "plus").frame(width: 44, height: 44)
            }
            .disabled(remotes.isEmpty)
            .accessibilityLabel("New Terminal")
            Button {
                filling.toggle()
            } label: {
                Image(systemName: filling ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(filling ? "Restore the panel" : "Fill the screen with the panel")
            Button {
                filling = false
                panel.isShown = false
            } label: {
                Image(systemName: "chevron.down").frame(width: 44, height: 44)
            }
            .accessibilityLabel("Hide the panel")
            .padding(.trailing, 4)
        }
        .frame(height: 44)
    }

    /// Remotes a terminal can start on.
    private var remotes: [Remote] {
        model.remotes.filter { $0.hasServer || $0.ssh != nil }
    }

    private func close(_ id: PanelTerminal.ID) {
        titles[id] = nil
        panel.close(id)
        if panel.terminals.isEmpty { filling = false }
    }
}

/// One terminal's tab in the panel header, its close button always shown:
/// there is no hover on a touch screen.
private struct IPadPanelTab: View {
    let title: String
    let selected: Bool
    let select: () -> Void
    let close: () -> Void

    var body: some View {
        HStack(spacing: 2) {
            Button(action: select) {
                Label(title, systemImage: "terminal")
                    .labelStyle(.titleAndIcon)
                    .lineLimit(1)
                    .font(.callout.weight(selected ? .semibold : .regular))
                    .padding(.leading, 10)
                    .frame(minHeight: 36)
            }
            .buttonStyle(.plain)
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.semibold))
                    .frame(width: 32, height: 36)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close \(title)")
        }
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(selected ? Color.primary.opacity(0.1) : .clear)
        )
        .contentShape(Rectangle())
    }
}

/// The text files opened in the iPad's detail area (#251), over the
/// notebook, which stays loaded beneath them. A file's document outlives
/// its screen until it is closed, so going back to the notebook keeps
/// unsaved edits, which come back when the file is opened again.
@MainActor
@Observable
final class IPadOpenFiles {
    /// The detail area's stack of server paths: files over the notebook.
    var stack: [String] = []
    @ObservationIgnored private var documents: [String: EditorDocument] = [:]

    func document(for path: String) -> EditorDocument {
        if let document = documents[path] { return document }
        let document = EditorDocument(path: path) { AppModel.shared.localServer }
        documents[path] = document
        return document
    }

    /// Shows the file, moving it to the top if it is already open.
    func open(_ path: String) {
        stack = FileStack.opening(path, in: stack)
    }

    /// Closes the file's screen and forgets its document.
    func close(_ path: String) {
        stack = FileStack.closing(path, in: stack)
        documents[path] = nil
    }

    /// Saves the kept documents with edits that no screen shows, whose
    /// editors can't save them when the app goes to the background.
    func saveHidden() {
        for (path, document) in documents where document.dirty && !stack.contains(path) {
            Task { await document.save() }
        }
    }

    /// Back to the notebook. Files with edits are saved on the way, as
    /// the editor does when the app goes to the background; a failed save
    /// keeps the edits for the next time the file is opened.
    func showNotebook() {
        for path in stack {
            if let document = documents[path], document.dirty {
                Task { await document.save() }
            }
        }
        stack.removeAll()
    }
}
#endif
