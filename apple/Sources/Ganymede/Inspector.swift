#if os(macOS)
import AppKit
import SwiftUI

/// A notebook window's right inspector (#249): the notebook's Outline and
/// its kernel's Variables, picked with a segmented control, resized from
/// its leading edge. The built-in agent's panel joins them later (#123).
struct Inspector: View {
    @ObservedObject var inspector: InspectorController
    @ObservedObject var page: PageModel
    /// The width of the area the notebook and inspector share, for the
    /// limit on how wide the inspector gets.
    let available: Double
    /// The width when a drag of the leading edge began.
    @State private var dragStart: Double?

    var body: some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(SwiftUI.Color(nsColor: .separatorColor))
                .frame(width: 1)
                .padding(.horizontal, 2)
                .contentShape(Rectangle())
                .onHover { inside in
                    if inside { NSCursor.resizeLeftRight.set() } else { NSCursor.arrow.set() }
                }
                .gesture(
                    DragGesture(minimumDistance: 1, coordinateSpace: .global)
                        .onChanged { drag in
                            let start = dragStart ?? inspector.width
                            dragStart = start
                            inspector.resize(to: start - drag.translation.width, available: available)
                            NSCursor.resizeLeftRight.set()
                        }
                        .onEnded { _ in dragStart = nil }
                )
            VStack(spacing: 0) {
                Picker("Inspector", selection: $inspector.tab) {
                    ForEach(InspectorTab.allCases) { tab in
                        Text(tab.title).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding(8)
                Divider()
                switch inspector.tab {
                case .outline:
                    OutlineNavigator(page: page)
                case .variables:
                    VariablesInspector(page: page)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        // Kept within the window as it gets narrower; the stored width
        // comes back when it is wide again.
        .frame(width: min(inspector.width, max(InspectorController.minWidth, available - InspectorController.notebookRoom)))
        .background(.background)
    }
}

/// The kernel's variables (#242), as the page reads them for the
/// inspector: name, type and a short value, objects expanding a level at
/// a time.
private struct VariablesInspector: View {
    @ObservedObject var page: PageModel

    var body: some View {
        let variables = page.state.variables
        Group {
            if !page.state.hasNotebook {
                note("No notebook open")
            } else if let variables, variables.state == "ready", !variables.rows.isEmpty {
                List(variables.rows) { row in
                    VariableRow(row: row) {
                        page.run("toggle-variable", arg: PageState.variablePath(row))
                    }
                }
                .listStyle(.inset)
            } else {
                note(Self.message(for: variables))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// What shows instead of rows, as the page's own view words it.
    static func message(for variables: PageState.Variables?) -> String {
        switch variables?.state {
        case "no-kernel": "Run a cell to see its variables."
        case "unsupported": "This kernel can’t list variables."
        case "error": "Couldn’t read the variables: \(variables?.message ?? "")"
        case "ready": "No variables yet."
        default: "Reading variables…"
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding()
    }
}

private struct VariableRow: View {
    let row: PageState.Variables.Row
    let toggle: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Group {
                if row.expandable {
                    Button(action: toggle) {
                        Image(systemName: row.expanded ? "chevron.down" : "chevron.right")
                            .font(.caption)
                            .frame(width: 12)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(row.expanded ? "Collapse" : "Expand") \(row.name)")
                } else {
                    Color.clear.frame(width: 12, height: 1)
                }
            }
            .padding(.leading, CGFloat(row.depth) * 12)
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline) {
                    Text(row.name)
                        .font(.system(.body, design: .monospaced))
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(row.type)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Text(row.value)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .textSelection(.enabled)
            }
        }
        .help("\(row.name): \(row.type) = \(row.value)")
    }
}

/// View › Show/Hide Inspector (⌥⌘0), for the front notebook window.
struct InspectorCommands: View {
    @FocusedObject private var inspector: InspectorController?

    var body: some View {
        Button(inspector?.isShown == true ? "Hide Inspector" : "Show Inspector") {
            inspector?.toggle()
        }
        .keyboardShortcut("0", modifiers: [.command, .option])
        .disabled(inspector == nil)
    }
}
#endif
