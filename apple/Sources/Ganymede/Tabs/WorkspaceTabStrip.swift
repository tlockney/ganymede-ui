#if os(macOS)
import AppKit
import SwiftUI

/// Dynamic colors for the Mac custom tab strip (#844 Step 6, #903, #905),
/// matching `docs/design/mac-visual-redesign/boards/E-Tabs.png` and `E-Mac.png`
/// in both dark and light appearances.
struct TabStripPalette {
    let colorScheme: ColorScheme

    var isDark: Bool { colorScheme == .dark }

    var troughBackground: Color {
        isDark
            ? Color(red: 0x13 / 255, green: 0x17 / 255, blue: 0x2a / 255)
            : Color(red: 0xec / 255, green: 0xe7 / 255, blue: 0xdc / 255)
    }

    var separatorColor: Color {
        isDark ? Color.white.opacity(0.12) : Color.black.opacity(0.12)
    }

    var plusColor: Color {
        isDark ? Color(red: 0xa8 / 255, green: 0xa8 / 255, blue: 0xb0 / 255) : Color(red: 0x47 / 255, green: 0x4e / 255, blue: 0x69 / 255)
    }

    func activeSurface(for kind: WorkspaceTabKind) -> Color {
        switch kind {
        case .notebook, .editor:
            return Color("WindowBackground")
        case .machine:
            return isDark
                ? Color(red: 0x1a / 255, green: 0x24 / 255, blue: 0x42 / 255)
                : Color(red: 0xea / 255, green: 0xf0 / 255, blue: 0xfc / 255)
        case .terminal:
            return isDark
                ? Color(red: 0x0d / 255, green: 0x10 / 255, blue: 0x20 / 255)
                : Color(nsColor: .textBackgroundColor)
        }
    }

    func topEdgeColor(for tone: WorkspaceTabTone) -> Color {
        switch tone {
        case .orange:
            return Color("AccentFill").opacity(isDark ? 0.55 : 0.65)
        case .blue:
            return Color("Ready").opacity(0.58)
        case .neutral:
            return isDark ? Color.white.opacity(0.35) : Color.primary.opacity(0.28)
        }
    }

    func activeText(for kind: WorkspaceTabKind) -> Color {
        switch kind {
        case .notebook, .editor:
            return Color("TitleText")
        case .machine:
            return isDark
                ? Color(red: 0xdb / 255, green: 0xe5 / 255, blue: 0xff / 255)
                : Color(red: 0x1b / 255, green: 0x29 / 255, blue: 0x4d / 255)
        case .terminal:
            return isDark
                ? Color(red: 0xe6 / 255, green: 0xe8 / 255, blue: 0xf0 / 255)
                : Color(red: 0x1d / 255, green: 0x1d / 255, blue: 0x1f / 255)
        }
    }

    var inactiveNotebookText: Color {
        isDark
            ? Color(red: 0x9a / 255, green: 0xa0 / 255, blue: 0xb8 / 255)
            : Color(red: 0x47 / 255, green: 0x4e / 255, blue: 0x69 / 255)
    }

    var inactiveMachineText: Color {
        isDark
            ? Color(red: 0xb9 / 255, green: 0xc8 / 255, blue: 0xf2 / 255)
            : Color(red: 0x28 / 255, green: 0x47 / 255, blue: 0x8f / 255)
    }

    var machineCapsuleBorder: Color {
        Color("Ready").opacity(isDark ? 0.35 : 0.45)
    }

    var terminalChipBackground: Color {
        Color(red: 0x0d / 255, green: 0x10 / 255, blue: 0x20 / 255)
    }

    var terminalChipText: Color {
        Color(red: 0xc9 / 255, green: 0xcb / 255, blue: 0xd6 / 255)
    }

    var terminalPromptInChip: Color {
        Color(red: 0x8f / 255, green: 0xb3 / 255, blue: 0xff / 255)
    }

    func terminalPrompt(selected: Bool) -> Color {
        if selected && !isDark { return Color("Ready") }
        return terminalPromptInChip
    }

    var machineHeaderSecondaryText: Color {
        isDark
            ? Color(red: 0xa7 / 255, green: 0xb4 / 255, blue: 0xd8 / 255)
            : Color(red: 0x41 / 255, green: 0x52 / 255, blue: 0x7a / 255)
    }

    var machineCardFill: Color {
        isDark ? Color("Ready").opacity(0.08) : Color("Ready").opacity(0.09)
    }

    var machineCardBorder: Color {
        Color("Ready").opacity(isDark ? 0.22 : 0.25)
    }

    func badgeColor(_ badge: TabLanguageBadge, selected: Bool) -> Color {
        let base: Color = switch badge.palette {
        case .typescript, .sql:
            Color(red: 0x31 / 255, green: 0x78 / 255, blue: 0xc6 / 255)
        case .python:
            Color(red: 0x35 / 255, green: 0x72 / 255, blue: 0xa5 / 255)
        case .javascript:
            Color(red: 0x9e / 255, green: 0x7b / 255, blue: 0x00 / 255)
        case .neutral:
            Color(red: 0x5a / 255, green: 0x61 / 255, blue: 0x77 / 255)
        }
        return base.opacity(selected ? 1.0 : (isDark ? 0.58 : 0.78))
    }
}

/// What the `+` menu in the tab strip offers.
struct TabNewMenuItems {
    let machines: [PlaceEntry]
    let onNewNotebook: () -> Void
    let onNewConsole: () -> Void
    let onNewTerminal: () -> Void
    let onOpenMachine: (PlaceEntry) -> Void
}

private struct TabChipFramesPreferenceKey: PreferenceKey {
    static let defaultValue: [UUID: CGRect] = [:]
    static func reduce(value: inout [UUID: CGRect], nextValue: () -> [UUID: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

/// Custom Mac tab strip (#844 Step 6, #903, #905): renders the taller,
/// flat-bottomed, page-joined active tab with its 1.5pt colored top edge
/// alongside distinct silhouettes for inactive notebooks, outlined machine
/// capsules, and dark mono terminal chips; supports in-strip drag-reorder,
/// drag-out to detach into a new window, cross-window docking, and native
/// window dragging across empty trough space.
struct WorkspaceTabStrip: View {
    let tabs: [WorkspaceTabDescriptor]
    let selectedID: UUID?
    let newMenu: TabNewMenuItems
    var controller: WorkspaceTabController? = nil
    let onSelect: (UUID) -> Void
    let onClose: (UUID) -> Void
    let onCloseOthers: (UUID) -> Void
    var onMoveToNewWindow: ((UUID) -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme
    @State private var tabFrames: [UUID: CGRect] = [:]
    @State private var stripSize: CGSize = .zero
    @State private var anchorBox = StripAnchorBox()
    @State private var registeredWindowNumber: Int?

    private var dragCoordinator: TabDragCoordinator { TabDragCoordinator.shared }
    private var palette: TabStripPalette { TabStripPalette(colorScheme: colorScheme) }

    var body: some View {
        let localDropX = resolvedLocalDropIndicatorX()
        let isDockHighlighted = anchorBox.view?.window.map {
            dragCoordinator.isTargetHighlight(windowNumber: $0.windowNumber)
        } ?? false

        GeometryReader { geo in
            let layout = TabStripLayout.compute(
                tabs: tabs,
                selectedID: selectedID,
                containerWidth: geo.size.width,
                textWidth: Self.measureTitle
            )
            HStack(alignment: .bottom, spacing: TabStripLayout.tabSpacing) {
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .bottom, spacing: TabStripLayout.tabSpacing) {
                            ForEach(Array(tabs.enumerated()), id: \.element.id) { index, tab in
                                let width = layout.item(for: tab.id)?.width
                                TabChipView(
                                    tab: tab,
                                    isSelected: tab.id == selectedID,
                                    canClose: tabs.count > 1 && tab.isCloseable,
                                    canMoveToNewWindow: tabs.count > 1 && onMoveToNewWindow != nil,
                                    isDragging: dragCoordinator.isDragging(tabID: tab.id),
                                    allocatedWidth: width,
                                    palette: palette,
                                    onSelect: { onSelect(tab.id) },
                                    onClose: { onClose(tab.id) },
                                    onCloseOthers: { onCloseOthers(tab.id) },
                                    onMoveToNewWindow: { onMoveToNewWindow?(tab.id) },
                                    onDragChanged: { handleDragChanged(tab: tab) },
                                    onDragEnded: { handleDragEnded() }
                                )
                                .background(
                                    GeometryReader { chipGeo in
                                        Color.clear.preference(
                                            key: TabChipFramesPreferenceKey.self,
                                            value: [tab.id: chipGeo.frame(in: .named("TabStripSpace"))]
                                        )
                                    }
                                )
                                .id(tab.id)

                                if layout.separatorAfterIndex == index {
                                    Rectangle()
                                        .fill(palette.separatorColor)
                                        .frame(
                                            width: TabStripLayout.separatorWidth,
                                            height: 18
                                        )
                                        .padding(.horizontal, TabStripLayout.separatorHorizontalMargin)
                                        .padding(.bottom, 11)
                                        .accessibilityHidden(true)
                                }
                            }
                        }
                        .frame(height: TabStripLayout.stripHeight, alignment: .bottom)
                    }
                    .frame(width: layout.scrollAreaWidth, height: TabStripLayout.stripHeight)
                    .onChange(of: selectedID) { _, id in
                        guard let id else { return }
                        withAnimation(.easeOut(duration: 0.15)) {
                            proxy.scrollTo(id, anchor: .center)
                        }
                    }
                }

                plusButton

                // Empty trailing trough space acts as a native window drag region (#905).
                WindowDragArea()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .padding(.leading, TabStripLayout.leadingPadding)
            .padding(.trailing, TabStripLayout.trailingPadding)
            .frame(width: geo.size.width, height: TabStripLayout.stripHeight, alignment: .bottomLeading)
            .onChange(of: geo.size, initial: true) { _, newSize in
                stripSize = newSize
            }
        }
        .coordinateSpace(name: "TabStripSpace")
        .frame(height: TabStripLayout.stripHeight)
        .background(
            ZStack {
                palette.troughBackground
                StripAnchorRepresentable(box: anchorBox) { window in
                    registerStrip(in: window)
                }
            }
        )
        .overlay(alignment: .leading) {
            if let x = localDropX {
                Capsule()
                    .fill(Color("AccentFill"))
                    .frame(width: 2.5, height: TabStripLayout.stripHeight - 10)
                    .offset(x: max(2, min(x - 1.25, max(2, stripSize.width - 4.5))))
                    .allowsHitTesting(false)
            }
        }
        .overlay {
            if isDockHighlighted {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(Color("AccentFill").opacity(0.7), lineWidth: 1.5)
                    .padding(2)
                    .allowsHitTesting(false)
            }
        }
        .onPreferenceChange(TabChipFramesPreferenceKey.self) { frames in
            tabFrames = frames
        }
        .onDisappear {
            if let num = registeredWindowNumber {
                dragCoordinator.unregisterStrip(windowNumber: num)
                registeredWindowNumber = nil
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
        .accessibilityLabel("Open tabs")
    }

    private func registerStrip(in window: NSWindow) {
        guard let controller else { return }
        if let old = registeredWindowNumber, old != window.windowNumber {
            dragCoordinator.unregisterStrip(windowNumber: old)
        }
        registeredWindowNumber = window.windowNumber
        let box = anchorBox
        dragCoordinator.registerStrip(window: window, controller: controller) {
            guard let anchor = box.view, let win = anchor.window else { return nil }
            let stripRectInWindow = anchor.convert(anchor.bounds, to: nil)
            let stripScreenRect = win.convertToScreen(stripRectInWindow)
            let slots: [TabDragGeometry.TabSlot] = tabs.compactMap { tab in
                guard let localRect = tabFrames[tab.id] else { return nil }
                let inWindow = anchor.convert(localRect, to: nil)
                let inScreen = win.convertToScreen(inWindow)
                return TabDragGeometry.TabSlot(id: tab.id, frame: inScreen)
            }
            return TabDragGeometry.TargetStrip(
                windowID: win.windowNumber,
                stripFrame: stripScreenRect,
                tabFrames: slots
            )
        }
    }

    private func handleDragChanged(tab: WorkspaceTabDescriptor) {
        guard let controller, let window = anchorBox.view?.window else { return }
        if dragCoordinator.activeDrag == nil {
            dragCoordinator.beginDrag(
                tabID: tab.id,
                descriptor: tab,
                in: window,
                controller: controller
            )
        }
        dragCoordinator.updateDrag(screenPoint: NSEvent.mouseLocation)
    }

    private func handleDragEnded() {
        dragCoordinator.endDrag(screenPoint: NSEvent.mouseLocation)
    }

    private func resolvedLocalDropIndicatorX() -> CGFloat? {
        guard let anchor = anchorBox.view,
              let window = anchor.window,
              dragCoordinator.targetWindowID == window.windowNumber,
              let screenX = dragCoordinator.indicatorScreenX
        else { return nil }
        let windowPoint = window.convertPoint(fromScreen: NSPoint(x: screenX, y: window.frame.midY))
        let localPoint = anchor.convert(windowPoint, from: nil)
        return localPoint.x
    }

    private var plusButton: some View {
        Menu {
            Button("New Notebook Tab", action: newMenu.onNewNotebook)
            Button("New DuckDB Console", action: newMenu.onNewConsole)
            Button("New Terminal Tab", action: newMenu.onNewTerminal)
            if !newMenu.machines.isEmpty {
                Divider()
                ForEach(newMenu.machines) { entry in
                    Button("Open \(entry.title)") { newMenu.onOpenMachine(entry) }
                }
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(palette.plusColor)
                .frame(width: TabStripLayout.newTabButtonSize, height: TabStripLayout.newTabButtonSize)
                .contentShape(Circle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .padding(.bottom, 6)
        .help("New tab")
        .accessibilityLabel("New tab")
    }

    /// Measures title width using the actual AppKit system / mono fonts.
    private static func measureTitle(_ title: String, isSelected: Bool, isMonospace: Bool) -> CGFloat {
        let size: CGFloat = isSelected ? 13.5 : (isMonospace ? 12.0 : 12.5)
        let weight: NSFont.Weight = isSelected ? .semibold : .regular
        let font: NSFont = isMonospace
            ? NSFont.monospacedSystemFont(ofSize: size, weight: weight)
            : NSFont.systemFont(ofSize: size, weight: weight)
        let width = (title as NSString).size(withAttributes: [.font: font]).width
        return ceil(width)
    }
}

/// Weak reference container for the tab strip's flipped AppKit anchor view.
@MainActor
private final class StripAnchorBox {
    weak var view: StripAnchorNSView?
}

/// Flipped `NSView` matching SwiftUI's top-left coordinate system so strip and
/// tab rects convert accurately to AppKit screen coordinates and empty trough
/// areas support native window dragging (#905).
private final class StripAnchorNSView: NSView {
    var onWindow: ((NSWindow) -> Void)?

    override var isFlipped: Bool { true }
    override var mouseDownCanMoveWindow: Bool { true }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let window { onWindow?(window) }
    }

    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)
    }
}

private struct StripAnchorRepresentable: NSViewRepresentable {
    let box: StripAnchorBox
    let onWindow: (NSWindow) -> Void

    func makeNSView(context: Context) -> StripAnchorNSView {
        let view = StripAnchorNSView()
        view.onWindow = onWindow
        box.view = view
        return view
    }

    func updateNSView(_ view: StripAnchorNSView, context: Context) {
        view.onWindow = onWindow
        box.view = view
        if let window = view.window {
            onWindow(window)
        }
    }
}

/// Transparent trailing trough spacer that lets users drag the window from the
/// unoccupied area to the right of the `+` button without interfering with tab
/// clicks, horizontal scroll, or tab drag-reorder/detach (#905).
private struct WindowDragArea: NSViewRepresentable {
    final class DragView: NSView {
        override var mouseDownCanMoveWindow: Bool { true }
        override func mouseDown(with event: NSEvent) {
            window?.performDrag(with: event)
        }
    }

    func makeNSView(context: Context) -> DragView {
        DragView()
    }

    func updateNSView(_ nsView: DragView, context: Context) {}
}

private struct TabChipView: View {
    let tab: WorkspaceTabDescriptor
    let isSelected: Bool
    let canClose: Bool
    let canMoveToNewWindow: Bool
    let isDragging: Bool
    let allocatedWidth: CGFloat?
    let palette: TabStripPalette
    let onSelect: () -> Void
    let onClose: () -> Void
    let onCloseOthers: () -> Void
    let onMoveToNewWindow: () -> Void
    let onDragChanged: () -> Void
    let onDragEnded: () -> Void

    @State private var hovering = false

    private var activeShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: TabStripLayout.activeCornerRadius,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: TabStripLayout.activeCornerRadius,
            style: .continuous
        )
    }

    private var chipHeight: CGFloat {
        if isSelected { return TabStripLayout.activeTabHeight }
        switch tab.kind {
        case .notebook, .editor: return TabStripLayout.inactiveNotebookHeight
        case .machine, .terminal: return TabStripLayout.inactiveCapsuleHeight
        }
    }

    private var bottomInset: CGFloat {
        if isSelected { return 0 }
        switch tab.kind {
        case .notebook, .editor: return 4
        case .machine, .terminal: return 5
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Button(action: onSelect) {
                HStack(spacing: isSelected ? 9 : 7) {
                    leadingMark
                    Text(tab.title)
                        .font(titleFont)
                        .foregroundStyle(titleColor)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !(canClose && hovering),
                       let kernelKind = tab.kernelKind,
                       let kernelLabel = tab.kernelLabel {
                        kernelMark(kind: kernelKind, label: kernelLabel)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isSelected ? .isSelected : [])

            if canClose && hovering {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(titleColor.opacity(0.75))
                        .frame(width: 14, height: 14)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Close tab")
                .accessibilityLabel("Close \(tab.title)")
            }
        }
        .padding(.horizontal, isSelected ? 18 : 12)
        .frame(width: allocatedWidth, height: chipHeight, alignment: .leading)
        .background(tabBackground)
        .contentShape(Rectangle())
        .opacity(isDragging ? 0.45 : 1)
        .padding(.bottom, bottomInset)
        .gesture(
            DragGesture(
                minimumDistance: TabDragGeometry.activationDistance,
                coordinateSpace: .named("TabStripSpace")
            )
            .onChanged { _ in onDragChanged() }
            .onEnded { _ in onDragEnded() }
        )
        .onHover { hovering = $0 }
        .help(tab.toolTip)
        .contextMenu {
            if canMoveToNewWindow {
                Button("Move Tab to New Window", action: onMoveToNewWindow)
                Divider()
            }
            if canClose {
                Button("Close Tab", action: onClose)
                Button("Close Other Tabs", action: onCloseOthers)
            }
        }
    }

    private var titleFont: Font {
        if tab.kind == .terminal {
            return .system(size: isSelected ? 13 : 12, weight: isSelected ? .semibold : .regular, design: .monospaced)
        }
        return .system(size: isSelected ? 13.5 : 12.5, weight: isSelected ? .semibold : .regular)
    }

    private var titleColor: Color {
        if isSelected { return palette.activeText(for: tab.kind) }
        switch tab.kind {
        case .notebook, .editor: return palette.inactiveNotebookText
        case .machine: return palette.inactiveMachineText
        case .terminal: return palette.terminalChipText
        }
    }

    @ViewBuilder
    private var leadingMark: some View {
        switch tab.kind {
        case .notebook, .editor:
            if let badge = tab.badge {
                let side: CGFloat = isSelected ? 18 : 15
                Text(badge.code)
                    .font(.system(size: isSelected ? 8.5 : 7.5, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: side, height: side)
                    .background(
                        RoundedRectangle(cornerRadius: isSelected ? 5 : 4, style: .continuous)
                            .fill(palette.badgeColor(badge, selected: isSelected))
                    )
                    .accessibilityHidden(true)
            }
        case .machine:
            Image(systemName: tab.machineSymbol)
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(isSelected ? palette.activeText(for: .machine) : palette.inactiveMachineText)
                .accessibilityHidden(true)
        case .terminal:
            Text(">_")
                .font(.system(size: isSelected ? 12.5 : 11.5, weight: .semibold, design: .monospaced))
                .foregroundStyle(palette.terminalPrompt(selected: isSelected))
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func kernelMark(kind: HeaderStatus.ChipKind, label: String) -> some View {
        Group {
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
        .help(label)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private var tabBackground: some View {
        if isSelected {
            // Clip the full tab height + 1.5pt top accent together so the
            // top bar follows the 11pt corner radius without sticking out.
            ZStack(alignment: .top) {
                palette.activeSurface(for: tab.kind)
                Rectangle()
                    .fill(palette.topEdgeColor(for: tab.topEdgeTone))
                    .frame(height: TabStripLayout.topEdgeHeight)
            }
            .clipShape(activeShape)
        } else {
            switch tab.kind {
            case .notebook, .editor:
                RoundedRectangle(cornerRadius: TabStripLayout.inactiveNotebookCornerRadius, style: .continuous)
                    .fill(hovering ? Color.primary.opacity(0.06) : Color.clear)
            case .machine:
                Capsule()
                    .fill(hovering ? Color("Ready").opacity(0.1) : Color.clear)
                    .overlay(Capsule().strokeBorder(palette.machineCapsuleBorder, lineWidth: 1))
            case .terminal:
                RoundedRectangle(cornerRadius: TabStripLayout.inactiveTerminalCornerRadius, style: .continuous)
                    .fill(palette.terminalChipBackground)
            }
        }
    }
}

/// Blue-tinted page header bridging an active machine tab into the page below
/// (`E-Tabs.png`: "same silhouette, blue edge and a blue-tinted page").
struct MachineSurfaceHeader: View {
    let name: String
    let reachable: Bool

    @Environment(\.colorScheme) private var colorScheme
    private var palette: TabStripPalette { TabStripPalette(colorScheme: colorScheme) }

    var body: some View {
        HStack(spacing: 10) {
            Text(name)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(palette.activeText(for: .machine))
            Text(reachable ? "connected machine" : "offline · reconnecting")
                .font(.system(size: 12))
                .foregroundStyle(palette.machineHeaderSecondaryText)
            Spacer(minLength: 0)
            Circle()
                .fill(reachable ? Color("Ready") : Color.red)
                .frame(width: 7, height: 7)
                .accessibilityLabel(reachable ? "Machine connected" : "Machine offline")
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 12)
        .background(palette.activeSurface(for: .machine))
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(palette.machineCardBorder)
                .frame(height: 0.5)
        }
    }
}

#Preview("Dark · 1280") {
    let tabs: [WorkspaceTabDescriptor] = [
        WorkspaceTabDescriptor(
            id: UUID(),
            kind: .notebook,
            title: "Fremont Bridge",
            toolTip: "2026-11-09-fremont-bridge.ipynb",
            badge: TabLanguageBadge(code: "TS", palette: .typescript),
            kernelKind: .idle,
            kernelLabel: "Kernel idle"
        ),
        WorkspaceTabDescriptor(
            id: UUID(),
            kind: .notebook,
            title: "DuckDB console",
            toolTip: "duckdb-console.ipynb",
            badge: TabLanguageBadge(code: "SQL", palette: .sql),
            kernelKind: .working,
            kernelLabel: "Kernel busy"
        ),
        .machine(id: UUID(), name: "m4mini"),
        .machine(id: UUID(), name: "workmbp"),
        .terminal(id: UUID(), title: "zsh"),
    ]
    WorkspaceTabStrip(
        tabs: tabs,
        selectedID: tabs.first?.id,
        newMenu: TabNewMenuItems(
            machines: [],
            onNewNotebook: {},
            onNewConsole: {},
            onNewTerminal: {},
            onOpenMachine: { _ in }
        ),
        onSelect: { _ in },
        onClose: { _ in },
        onCloseOthers: { _ in }
    )
    .frame(width: 1040)
    .preferredColorScheme(.dark)
}

#Preview("Light · 1728") {
    let tabs: [WorkspaceTabDescriptor] = [
        WorkspaceTabDescriptor(
            id: UUID(),
            kind: .notebook,
            title: "Fremont Bridge",
            toolTip: "2026-11-09-fremont-bridge.ipynb",
            badge: TabLanguageBadge(code: "TS", palette: .typescript),
            kernelKind: .idle,
            kernelLabel: "Kernel idle"
        ),
        .machine(id: UUID(), name: "m4mini"),
        .terminal(id: UUID(), title: "zsh"),
    ]
    WorkspaceTabStrip(
        tabs: tabs,
        selectedID: tabs[1].id,
        newMenu: TabNewMenuItems(
            machines: [],
            onNewNotebook: {},
            onNewConsole: {},
            onNewTerminal: {},
            onOpenMachine: { _ in }
        ),
        onSelect: { _ in },
        onClose: { _ in },
        onCloseOthers: { _ in }
    )
    .frame(width: 1488)
    .preferredColorScheme(.light)
}
#endif
