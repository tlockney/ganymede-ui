#if os(macOS)
import AppKit
import SwiftUI

/// A notebook window's right inspector (#249): the notebook's Outline and
/// its kernel's Variables, picked with a segmented control, resized from
/// its leading edge. The built-in agent's panel joins them later (#123).
struct Inspector: View {
    @Bindable var inspector: InspectorController
    var page: PageModel
    /// The width of the area the notebook and inspector share, for the
    /// limit on how wide the inspector gets.
    let available: Double
    /// It fills the window (#250): as wide as the area, not resizable.
    var fills = false
    /// Its fill control: fills the window, or restores the layout.
    var toggleFill: () -> Void = {}
    /// The width when a drag of the leading edge began.
    @State private var dragStart: Double?

    var body: some View {
        HStack(spacing: 0) {
            if !fills { resizeEdge }
            VStack(spacing: 0) {
                HStack(spacing: 6) {
                    Picker("Inspector", selection: $inspector.tab) {
                        ForEach(InspectorTab.allCases) { tab in
                            Text(tab.title).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    FillButton(fills: fills, area: "inspector", action: toggleFill)
                }
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
        .frame(width: fills ? nil : CGFloat(min(inspector.width, max(InspectorController.minWidth, available - InspectorController.notebookRoom))))
        .frame(maxWidth: fills ? .infinity : nil)
        .background(.background)
    }

    /// Its leading edge, which resizes it.
    private var resizeEdge: some View {
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
    }
}

/// The kernel's variables (#242), as the page reads them for the
/// inspector: name, type and a short value, objects expanding a level at
/// a time.
private struct VariablesInspector: View {
    var page: PageModel

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

/// The areas a filling one folds (#250), as a thin row or column of
/// icons; clicking one brings it back.
struct FoldedStrip: View {
    struct Item {
        var title: String
        var systemImage: String
        var action: () -> Void
    }

    static let thickness: CGFloat = 28

    let items: [Item]
    let axis: Axis

    var body: some View {
        let layout = axis == .vertical
            ? AnyLayout(VStackLayout(spacing: 4))
            : AnyLayout(HStackLayout(spacing: 4))
        layout {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                Button(action: item.action) {
                    if axis == .vertical {
                        Image(systemName: item.systemImage)
                            .frame(width: 20, height: 20)
                    } else {
                        Label(item.title, systemImage: item.systemImage)
                            .lineLimit(1)
                    }
                }
                .buttonStyle(.borderless)
                .help("Show \(item.title)")
                .accessibilityLabel("Show \(item.title)")
            }
            Spacer(minLength: 0)
        }
        .padding(4)
        .frame(width: axis == .vertical ? Self.thickness : nil, height: axis == .horizontal ? Self.thickness : nil)
        .frame(maxWidth: axis == .horizontal ? .infinity : nil, maxHeight: axis == .vertical ? .infinity : nil,
               alignment: .topLeading)
    }
}

/// What ⇧⌘↩ acts on in the front notebook window (#250).
struct WindowFill {
    var filled: WindowArea?
    /// Fills the window with the area that has the keyboard, or restores.
    var toggle: () -> Void
}

struct WindowFillKey: FocusedValueKey {
    typealias Value = WindowFill
}

extension FocusedValues {
    var windowFill: WindowFill? {
        get { self[WindowFillKey.self] }
        set { self[WindowFillKey.self] = newValue }
    }
}

/// View › Fill Window / Restore Layout (⇧⌘↩).
struct FillCommands: View {
    @FocusedValue(\.windowFill) private var fill

    var body: some View {
        Button(fill?.filled == nil ? "Fill Window" : "Restore Layout") { fill?.toggle() }
            .keyboardShortcut(.return, modifiers: [.command, .shift])
            .disabled(fill == nil)
    }
}

/// View › Show/Hide Inspector (⌥⌘0), for the front notebook window.
struct InspectorCommands: View {
    @FocusedValue(\.inspectorController) private var inspector

    var body: some View {
        Button(inspector?.isShown == true ? "Hide Inspector" : "Show Inspector") {
            inspector?.toggle()
        }
        .keyboardShortcut("0", modifiers: [.command, .option])
        .disabled(inspector == nil)
    }
}
#endif
