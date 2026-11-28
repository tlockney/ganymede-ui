import CoreGraphics
import Foundation

/// Pure drag-reorder, drag-detach, and cross-window docking geometry for the
/// Mac custom tab strip (#905). View- and AppKit-free so every threshold, slot
/// index, and screen clamp is unit-tested deterministically.
enum TabDragGeometry {
    /// Vertical distance outside a tab strip before a drag detaches into a new
    /// window (when the source window has more than one tab).
    static let detachVerticalThreshold: CGFloat = 44
    /// Horizontal drag distance before a tab drag activates instead of a click.
    static let activationDistance: CGFloat = 6
    /// Hit-test slop around another window's tab strip when docking across windows.
    static let crossWindowHitMarginX: CGFloat = 10
    static let crossWindowHitMarginY: CGFloat = 14

    struct TabSlot: Equatable {
        let id: UUID
        let frame: CGRect
    }

    struct TargetStrip: Equatable {
        /// Stable window identifier (e.g., `NSWindow.windowNumber`).
        let windowID: Int
        /// The strip's bounds in global screen coordinates (AppKit bottom-left origin).
        let stripFrame: CGRect
        /// Ordered tab chip frames in the same coordinate space as `stripFrame`.
        let tabFrames: [TabSlot]
    }

    enum DragOutcome: Equatable {
        case none
        /// Reorder within the source strip to `destinationIndex`, drawing the
        /// insertion bar at `indicatorX` in strip coordinates.
        case reorder(destinationIndex: Int, insertionIndex: Int, indicatorX: CGFloat)
        /// Dock into another window's strip at `insertionIndex`.
        case dock(targetWindowID: Int, insertionIndex: Int, indicatorX: CGFloat)
        /// Detach into a standalone new window near `screenPoint`.
        case detach(screenPoint: CGPoint)
    }

    /// Resolves the drop slot (`0...slots.count`) and visual bar X coordinate
    /// for a pointer at `pointerX` across `slots` ordered left-to-right.
    static func insertionSlot(
        pointerX: CGFloat,
        in slots: [TabSlot],
        leadingEdgeFallback: CGFloat
    ) -> (index: Int, indicatorX: CGFloat) {
        guard !slots.isEmpty else {
            return (0, leadingEdgeFallback)
        }
        for (index, slot) in slots.enumerated() {
            if pointerX < slot.frame.midX {
                let x = index == 0
                    ? slot.frame.minX
                    : (slots[index - 1].frame.maxX + slot.frame.minX) / 2
                return (index, x)
            }
        }
        return (slots.count, slots[slots.count - 1].frame.maxX + 2)
    }

    /// Converts a visual insertion slot (`0...count`) into the post-removal
    /// destination index passed to `WorkspaceTabController.moveSession(id:toIndex:)`.
    static func reorderDestinationIndex(
        from sourceIndex: Int,
        insertionIndex: Int,
        count: Int
    ) -> Int {
        guard count > 1 else { return 0 }
        let clampedInsertion = max(0, min(insertionIndex, count))
        let destination = clampedInsertion > sourceIndex ? clampedInsertion - 1 : clampedInsertion
        return max(0, min(destination, count - 1))
    }

    /// Whether `pointer` has pulled far enough outside `stripFrame` to detach.
    static func isBeyondDetachThreshold(
        pointer: CGPoint,
        stripFrame: CGRect,
        verticalThreshold: CGFloat = detachVerticalThreshold
    ) -> Bool {
        let verticalOut = pointer.y < stripFrame.minY - verticalThreshold
            || pointer.y > stripFrame.maxY + verticalThreshold
        let horizontalOut = pointer.x < stripFrame.minX - verticalThreshold
            || pointer.x > stripFrame.maxX + verticalThreshold
        return verticalOut || horizontalOut
    }

    /// Resolves whether a live drag at global `pointer` reorders in the source
    /// window, docks into another window (checking `strips` front-to-back), or
    /// detaches into a new window.
    static func resolve(
        pointer: CGPoint,
        sourceWindowID: Int,
        sourceTabID: UUID,
        sourceTabCount: Int,
        strips: [TargetStrip],
        verticalThreshold: CGFloat = detachVerticalThreshold
    ) -> DragOutcome {
        // 1. Front-to-back cross-window docking always wins when over another window's strip.
        for strip in strips where strip.windowID != sourceWindowID {
            let hitRect = strip.stripFrame.insetBy(
                dx: -crossWindowHitMarginX,
                dy: -crossWindowHitMarginY
            )
            if hitRect.contains(pointer) {
                let slot = insertionSlot(
                    pointerX: pointer.x,
                    in: strip.tabFrames,
                    leadingEdgeFallback: strip.stripFrame.minX + TabStripLayout.leadingPadding
                )
                return .dock(
                    targetWindowID: strip.windowID,
                    insertionIndex: slot.index,
                    indicatorX: slot.indicatorX
                )
            }
        }

        // 2. Otherwise check the source strip: reorder while within threshold, else detach.
        if let source = strips.first(where: { $0.windowID == sourceWindowID }) {
            if !isBeyondDetachThreshold(
                pointer: pointer,
                stripFrame: source.stripFrame,
                verticalThreshold: verticalThreshold
            ) {
                let slot = insertionSlot(
                    pointerX: pointer.x,
                    in: source.tabFrames,
                    leadingEdgeFallback: source.stripFrame.minX + TabStripLayout.leadingPadding
                )
                let sourceIndex = source.tabFrames.firstIndex(where: { $0.id == sourceTabID }) ?? 0
                let destination = reorderDestinationIndex(
                    from: sourceIndex,
                    insertionIndex: slot.index,
                    count: max(sourceTabCount, source.tabFrames.count)
                )
                return .reorder(
                    destinationIndex: destination,
                    insertionIndex: slot.index,
                    indicatorX: slot.indicatorX
                )
            }
        }

        // 3. Outside all strips: detach only when the source window has > 1 tab.
        if sourceTabCount > 1 {
            return .detach(screenPoint: pointer)
        }
        return .none
    }

    /// Computes a clamped AppKit window frame origin (bottom-left coordinates)
    /// placing the top-center of the newly detached window near `dropPoint`.
    static func detachedWindowOrigin(
        dropPoint: CGPoint,
        windowSize: CGSize,
        visibleFrame: CGRect
    ) -> CGPoint {
        let titlebarOffset: CGFloat = 56
        let idealX = dropPoint.x - windowSize.width / 2
        let idealY = dropPoint.y - windowSize.height + titlebarOffset
        let minX = visibleFrame.minX
        let maxX = max(minX, visibleFrame.maxX - windowSize.width)
        let minY = visibleFrame.minY
        let maxY = max(minY, visibleFrame.maxY - windowSize.height)
        return CGPoint(
            x: min(max(idealX, minX), maxX),
            y: min(max(idealY, minY), maxY)
        )
    }
}
