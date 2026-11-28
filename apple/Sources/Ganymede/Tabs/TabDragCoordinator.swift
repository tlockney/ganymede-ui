#if os(macOS)
import AppKit
import Observation
import SwiftUI

/// Live drag-reorder, drag-detach, and cross-window docking coordinator (#905).
/// Tracks active drags across all open Ganymede workspace windows, provides
/// screen-coordinate hit testing in front-to-back window order, and displays a
/// lightweight floating tab preview when pulling a tab out of its strip.
@MainActor
@Observable
final class TabDragCoordinator {
    static let shared = TabDragCoordinator()

    struct ActiveDrag {
        let sourceWindowID: Int
        weak var sourceWindow: NSWindow?
        weak var sourceController: WorkspaceTabController?
        let tabID: UUID
        let descriptor: WorkspaceTabDescriptor
        let sourceTabCount: Int
    }

    struct RegisteredStrip {
        weak var window: NSWindow?
        weak var controller: WorkspaceTabController?
        /// Returns the strip rect and ordered tab frames in AppKit screen coordinates.
        let snapshot: () -> TabDragGeometry.TargetStrip?
    }

    private(set) var activeDrag: ActiveDrag?
    /// Window currently highlighted as a drop target (source strip or another window).
    private(set) var targetWindowID: Int?
    /// Drop bar X coordinate in AppKit screen coordinates for `targetWindowID`.
    private(set) var indicatorScreenX: CGFloat?
    /// Whether the active drag is currently in detach-to-new-window range.
    private(set) var isDetaching = false
    /// Whether the active drag is docking into a *different* window than its source.
    private(set) var isCrossWindowDocking = false

    @ObservationIgnored private var strips: [Int: RegisteredStrip] = [:]
    @ObservationIgnored private var previewPanel: NSPanel?
    @ObservationIgnored private var lastOutcome: TabDragGeometry.DragOutcome = .none

    func registerStrip(
        window: NSWindow,
        controller: WorkspaceTabController,
        snapshot: @escaping () -> TabDragGeometry.TargetStrip?
    ) {
        strips[window.windowNumber] = RegisteredStrip(
            window: window,
            controller: controller,
            snapshot: snapshot
        )
    }

    func unregisterStrip(windowNumber: Int) {
        strips.removeValue(forKey: windowNumber)
    }

    func isDragging(tabID: UUID) -> Bool {
        activeDrag?.tabID == tabID
    }

    func isTargetHighlight(windowNumber: Int) -> Bool {
        isCrossWindowDocking && targetWindowID == windowNumber
    }

    func beginDrag(
        tabID: UUID,
        descriptor: WorkspaceTabDescriptor,
        in window: NSWindow,
        controller: WorkspaceTabController
    ) {
        activeDrag = ActiveDrag(
            sourceWindowID: window.windowNumber,
            sourceWindow: window,
            sourceController: controller,
            tabID: tabID,
            descriptor: descriptor,
            sourceTabCount: controller.sessions.count
        )
        lastOutcome = .none
        targetWindowID = window.windowNumber
        indicatorScreenX = nil
        isDetaching = false
        isCrossWindowDocking = false
    }

    func updateDrag(screenPoint: CGPoint) {
        guard let drag = activeDrag else { return }
        let orderedStrips = orderedTargetStrips()
        let outcome = TabDragGeometry.resolve(
            pointer: screenPoint,
            sourceWindowID: drag.sourceWindowID,
            sourceTabID: drag.tabID,
            sourceTabCount: drag.sourceTabCount,
            strips: orderedStrips
        )
        lastOutcome = outcome

        switch outcome {
        case .reorder(_, _, let indicatorX):
            targetWindowID = drag.sourceWindowID
            indicatorScreenX = indicatorX
            isDetaching = false
            isCrossWindowDocking = false
            hidePreviewPanel()
        case .dock(let destWindowID, _, let indicatorX):
            targetWindowID = destWindowID
            indicatorScreenX = indicatorX
            isDetaching = false
            isCrossWindowDocking = true
            showPreviewPanel(descriptor: drag.descriptor, at: screenPoint, badge: "Move to Window")
        case .detach:
            targetWindowID = nil
            indicatorScreenX = nil
            isDetaching = true
            isCrossWindowDocking = false
            showPreviewPanel(descriptor: drag.descriptor, at: screenPoint, badge: "New Window")
        case .none:
            targetWindowID = nil
            indicatorScreenX = nil
            isDetaching = false
            isCrossWindowDocking = false
            hidePreviewPanel()
        }
    }

    func endDrag(screenPoint: CGPoint) {
        guard let drag = activeDrag else {
            resetState()
            return
        }
        updateDrag(screenPoint: screenPoint)
        let outcome = lastOutcome
        let sourceController = drag.sourceController
        let sourceWindow = drag.sourceWindow
        let tabID = drag.tabID
        resetState()

        guard let sourceController else { return }

        switch outcome {
        case .reorder(let destinationIndex, _, _):
            sourceController.moveSession(id: tabID, toIndex: destinationIndex)
        case .dock(let destWindowID, let insertionIndex, _):
            guard let targetEntry = strips[destWindowID],
                  let targetController = targetEntry.controller
            else { return }
            WorkspaceTabHandoff.shared.transferSession(
                sessionID: tabID,
                from: sourceController,
                sourceWindow: sourceWindow,
                to: targetController,
                targetWindow: targetEntry.window,
                at: insertionIndex
            )
        case .detach(let dropPoint):
            WorkspaceTabHandoff.shared.detachToNewWindow(
                sessionID: tabID,
                from: sourceController,
                dropPoint: dropPoint
            )
        case .none:
            break
        }
    }

    func cancelDrag() {
        resetState()
    }

    private func resetState() {
        activeDrag = nil
        targetWindowID = nil
        indicatorScreenX = nil
        isDetaching = false
        isCrossWindowDocking = false
        lastOutcome = .none
        hidePreviewPanel()
    }

    /// Returns registered strips ordered front-to-back matching `NSApp.orderedWindows`.
    private func orderedTargetStrips() -> [TabDragGeometry.TargetStrip] {
        var ordered: [TabDragGeometry.TargetStrip] = []
        var seen = Set<Int>()
        if let app = NSApp as NSApplication? {
            for window in app.orderedWindows where window.isVisible && !window.isMiniaturized {
                let num = window.windowNumber
                if let entry = strips[num], let snap = entry.snapshot() {
                    seen.insert(num)
                    ordered.append(snap)
                }
            }
        }
        for (num, entry) in strips where !seen.contains(num) {
            if let window = entry.window, window.isVisible, !window.isMiniaturized,
               let snap = entry.snapshot() {
                ordered.append(snap)
            }
        }
        return ordered
    }

    private func showPreviewPanel(
        descriptor: WorkspaceTabDescriptor,
        at screenPoint: CGPoint,
        badge: String
    ) {
        let size = NSSize(width: 220, height: 42)
        let origin = NSPoint(x: screenPoint.x - size.width / 2, y: screenPoint.y + 14)
        let content = TabDragPreviewCard(descriptor: descriptor, subtitle: badge)
        if let panel = previewPanel {
            (panel.contentView as? NSHostingView<TabDragPreviewCard>)?.rootView = content
            panel.setFrameOrigin(origin)
            if !panel.isVisible {
                panel.orderFrontRegardless()
            }
            return
        }
        let panel = NSPanel(
            contentRect: NSRect(origin: origin, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .floating
        panel.ignoresMouseEvents = true
        panel.collectionBehavior = [.canJoinAllSpaces, .transient]
        let hosting = NSHostingView(rootView: content)
        hosting.frame = NSRect(origin: .zero, size: size)
        panel.contentView = hosting
        panel.orderFrontRegardless()
        previewPanel = panel
    }

    private func hidePreviewPanel() {
        previewPanel?.orderOut(nil)
        previewPanel = nil
    }
}

private struct TabDragPreviewCard: View {
    let descriptor: WorkspaceTabDescriptor
    let subtitle: String

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let palette = TabStripPalette(colorScheme: colorScheme)
        HStack(spacing: 8) {
            previewIcon(palette: palette)
            VStack(alignment: .leading, spacing: 1) {
                Text(descriptor.title)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(palette.activeText(for: descriptor.kind))
                    .lineLimit(1)
                Text(subtitle)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .frame(width: 220, height: 42)
        .background(
            ZStack(alignment: .top) {
                palette.activeSurface(for: descriptor.kind)
                Rectangle()
                    .fill(palette.topEdgeColor(for: descriptor.topEdgeTone))
                    .frame(height: 2)
            }
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.18), lineWidth: 0.75)
        )
        .opacity(0.95)
    }

    @ViewBuilder
    private func previewIcon(palette: TabStripPalette) -> some View {
        switch descriptor.kind {
        case .notebook, .editor:
            if let badge = descriptor.badge {
                Text(badge.code)
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 18, height: 18)
                    .background(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(palette.badgeColor(badge, selected: true))
                    )
            }
        case .machine:
            Image(systemName: descriptor.machineSymbol)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(palette.activeText(for: .machine))
        case .terminal:
            Text(">_")
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(palette.terminalPrompt(selected: true))
        }
    }
}
#endif
