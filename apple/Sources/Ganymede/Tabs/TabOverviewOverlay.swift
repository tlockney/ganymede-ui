#if os(macOS)
import AppKit
import SwiftUI

/// In-window visual tab-grid overlay toggled by `Window > Show All Tabs`
/// (`⇧⌘\`), styled with `TabStripPalette` (#905). Supports live search
/// filtering, arrow-key grid navigation, Return to switch & dismiss, Escape to
/// dismiss, card close buttons, and a `+` New Tab menu.
struct TabOverviewOverlay: View {
    var controller: WorkspaceTabController
    let newMenu: TabNewMenuItems
    let dismiss: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var query = ""
    @State private var highlightedID: UUID?
    @State private var columnCount = 3
    @FocusState private var searchFocused: Bool

    private var palette: TabStripPalette { TabStripPalette(colorScheme: colorScheme) }

    private var allItems: [TabOverviewItem] {
        controller.overviewItems
    }

    private var filteredItems: [TabOverviewItem] {
        TabOverviewNavigation.filter(allItems, query: query)
    }

    var body: some View {
        GeometryReader { geo in
            let cols = TabOverviewNavigation.columnCount(forWidth: geo.size.width)
            let gridColumns = Array(
                repeating: GridItem(.flexible(minimum: 180, maximum: 320), spacing: 14),
                count: cols
            )
            VStack(spacing: 0) {
                headerBar
                Divider().opacity(0.35)
                if filteredItems.isEmpty {
                    emptyState
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVGrid(columns: gridColumns, spacing: 14) {
                                ForEach(filteredItems) { item in
                                    TabOverviewCard(
                                        item: item,
                                        totalCount: allItems.count,
                                        isHighlighted: item.id == highlightedID,
                                        canClose: allItems.count > 1 && item.descriptor.isCloseable,
                                        palette: palette,
                                        onSelect: {
                                            controller.select(item.id)
                                            dismiss()
                                        },
                                        onClose: {
                                            controller.closeTab(item.id, in: controller.hostWindow)
                                        }
                                    )
                                    .id(item.id)
                                }
                            }
                            .padding(24)
                        }
                        .onChange(of: highlightedID) { _, id in
                            guard let id else { return }
                            withAnimation(.easeOut(duration: 0.12)) {
                                proxy.scrollTo(id, anchor: .center)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.troughBackground.opacity(colorScheme == .dark ? 0.97 : 0.96))
            .onAppear {
                columnCount = cols
                highlightedID = controller.selectedID
                searchFocused = true
            }
            .onChange(of: cols) { _, updated in
                columnCount = updated
            }
        }
        .onChange(of: filteredItems) { _, items in
            if let highlightedID, items.contains(where: { $0.id == highlightedID }) {
                return
            }
            highlightedID = items.first?.id
        }
        .onKeyPress(.escape) {
            dismiss()
            return .handled
        }
        .onKeyPress(.return) {
            activateHighlighted()
            return .handled
        }
        .onKeyPress(.leftArrow) {
            move(.left)
            return .handled
        }
        .onKeyPress(.rightArrow) {
            move(.right)
            return .handled
        }
        .onKeyPress(.upArrow) {
            move(.up)
            return .handled
        }
        .onKeyPress(.downArrow) {
            move(.down)
            return .handled
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("All Open Tabs")
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                TextField("Filter open tabs…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .focused($searchFocused)
                    .onSubmit(activateHighlighted)
                if !query.isEmpty {
                    Button {
                        query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear filter")
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(maxWidth: 320)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.primary.opacity(colorScheme == .dark ? 0.08 : 0.06))
            )

            Text("\(filteredItems.count) of \(allItems.count) \(allItems.count == 1 ? "tab" : "tabs")")
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer(minLength: 0)

            Menu {
                Button("New Notebook Tab") {
                    newMenu.onNewNotebook()
                    dismiss()
                }
                Button("New DuckDB Console") {
                    newMenu.onNewConsole()
                    dismiss()
                }
                Button("New Terminal Tab") {
                    newMenu.onNewTerminal()
                    dismiss()
                }
                if !newMenu.machines.isEmpty {
                    Divider()
                    ForEach(newMenu.machines) { entry in
                        Button("Open \(entry.title)") {
                            newMenu.onOpenMachine(entry)
                            dismiss()
                        }
                    }
                }
            } label: {
                Label("New Tab", systemImage: "plus")
                    .font(.system(size: 12, weight: .medium))
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .help("Open a new tab")

            Button("Done", action: dismiss)
                .keyboardShortcut(.cancelAction)
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Text("No matching tabs")
                .font(.headline)
            Text("Try a different title, path, language, or tab kind.")
                .font(.callout)
                .foregroundStyle(.secondary)
            if !query.isEmpty {
                Button("Clear Filter") { query = "" }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func move(_ direction: TabOverviewNavigation.Direction) {
        highlightedID = TabOverviewNavigation.moveSelection(
            current: highlightedID,
            in: filteredItems,
            direction: direction,
            columns: columnCount
        )
    }

    private func activateHighlighted() {
        guard let target = highlightedID ?? filteredItems.first?.id else { return }
        controller.select(target)
        dismiss()
    }
}

private struct TabOverviewCard: View {
    let item: TabOverviewItem
    let totalCount: Int
    let isHighlighted: Bool
    let canClose: Bool
    let palette: TabStripPalette
    let onSelect: () -> Void
    let onClose: () -> Void

    @State private var hovering = false

    private var descriptor: WorkspaceTabDescriptor { item.descriptor }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                leadingBadge
                Text(descriptor.title)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(palette.activeText(for: descriptor.kind))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 4)
                if let shortcut = item.shortcutLabel(totalCount: totalCount) {
                    Text(shortcut)
                        .font(.system(size: 10.5, weight: .medium, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(Color.primary.opacity(0.07))
                        )
                }
                if canClose {
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 9.5, weight: .bold))
                            .foregroundStyle(.secondary)
                            .frame(width: 18, height: 18)
                            .background(
                                Circle()
                                    .fill(hovering ? Color.primary.opacity(0.10) : Color.clear)
                            )
                    }
                    .buttonStyle(.plain)
                    .help("Close tab")
                    .accessibilityLabel("Close \(descriptor.title)")
                }
            }

            Text(descriptor.toolTip)
                .font(.system(size: 11.5))
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 4)

            HStack(spacing: 8) {
                if let kernelKind = descriptor.kernelKind,
                   let kernelLabel = descriptor.kernelLabel {
                    HStack(spacing: 5) {
                        kernelIndicator(kind: kernelKind)
                        Text(kernelLabel)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                } else {
                    Text(kindLabel)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)

                if item.isDirty {
                    Text("Edited")
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundStyle(Color("AccentFill"))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(Color("AccentFill").opacity(0.14))
                        )
                }
            }
        }
        .padding(14)
        .frame(height: 116, alignment: .topLeading)
        .background(
            ZStack(alignment: .top) {
                palette.activeSurface(for: descriptor.kind)
                if item.isSelected {
                    Rectangle()
                        .fill(palette.topEdgeColor(for: descriptor.topEdgeTone))
                        .frame(height: 2.5)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(borderColor, lineWidth: isHighlighted ? 2 : 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .onTapGesture(perform: onSelect)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityAddTraits(item.isSelected ? .isSelected : [])
        .accessibilityLabel(descriptor.accessibilityLabel)
        .accessibilityValue([descriptor.accessibilityValue, item.isDirty ? "Edited" : ""].filter { !$0.isEmpty }.joined(separator: ", "))
    }

    private var borderColor: Color {
        if isHighlighted { return Color("AccentFill") }
        if item.isSelected { return palette.topEdgeColor(for: descriptor.topEdgeTone) }
        return hovering ? Color.primary.opacity(0.24) : Color.primary.opacity(0.10)
    }

    private var kindLabel: String {
        switch descriptor.kind {
        case .notebook: "Notebook"
        case .editor: "Text file"
        case .machine: "Connected machine"
        case .terminal: "Terminal"
        }
    }

    @ViewBuilder
    private var leadingBadge: some View {
        switch descriptor.kind {
        case .notebook, .editor:
            if let badge = descriptor.badge {
                Text(badge.code)
                    .font(.system(size: 8.5, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 20, height: 20)
                    .background(
                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                            .fill(palette.badgeColor(badge, selected: true))
                    )
            } else {
                Image(systemName: descriptor.kind == .editor ? "doc.text" : "book.closed")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        case .machine:
            Image(systemName: descriptor.machineSymbol)
                .font(.system(size: 13.5, weight: .medium))
                .foregroundStyle(palette.activeText(for: .machine))
        case .terminal:
            Text(">_")
                .font(.system(size: 12.5, weight: .semibold, design: .monospaced))
                .foregroundStyle(palette.terminalPrompt(selected: true))
        }
    }

    @ViewBuilder
    private func kernelIndicator(kind: HeaderStatus.ChipKind) -> some View {
        switch kind {
        case .working:
            ProgressView()
                .controlSize(.mini)
                .frame(width: 10, height: 10)
        case .missing:
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 9))
                .foregroundStyle(Color.orange)
        case .idle:
            Circle()
                .fill(Color("Ready"))
                .frame(width: 7, height: 7)
        case .stopped:
            Circle()
                .fill(Color.secondary.opacity(0.7))
                .frame(width: 7, height: 7)
        }
    }
}
#endif
