#if os(macOS)
import AppKit
import Foundation

/// Live tab-session handoff when detaching a tab into a new standalone window
/// (`Move Tab to New Window` or drag-out) or opening a standalone workspace
/// window for a terminal/editor when no workspace window is open (#905).
///
/// Mirrors `WorkspaceTabs.pending` so SwiftUI's multiple `ContentView.init`
/// calls during window creation never double-consume a pending handoff:
/// `ContentView.init` peeks `pending` into `@State`, and `.onAppear` consumes
/// it via `take(_:)`.
@MainActor
final class WorkspaceTabHandoff {
    static let shared = WorkspaceTabHandoff()

    struct PendingWindow: Equatable {
        let id: UUID
        let sessions: [WorkspaceTabController.Session]
        let selectedID: UUID
        /// Optional AppKit screen drop point for placing a drag-detached window.
        let dropPoint: CGPoint?

        init(
            id: UUID = UUID(),
            sessions: [WorkspaceTabController.Session],
            selectedID: UUID,
            dropPoint: CGPoint? = nil
        ) {
            self.id = id
            self.sessions = sessions
            self.selectedID = selectedID
            self.dropPoint = dropPoint
        }

        static func == (lhs: PendingWindow, rhs: PendingWindow) -> Bool {
            lhs.id == rhs.id
        }
    }

    private(set) var pending: PendingWindow?
    /// Expiry timeout for an untaken handoff (swappable in tests).
    var timeoutNanoseconds: UInt64 = 5_000_000_000

    /// Opens a new workspace window seeded with `sessions` and `selectedID`,
    /// preserving live `PageTabState` (`PageWebViewStore`), `EditorTabState`,
    /// and parked `TerminalTabState` sessions without reloading.
    @discardableResult
    func openWindow(
        sessions: [WorkspaceTabController.Session],
        selectedID: UUID,
        dropPoint: CGPoint? = nil,
        with openByID: (String) -> Void
    ) -> PendingWindow? {
        guard !sessions.isEmpty else { return nil }
        let request = PendingWindow(
            sessions: sessions,
            selectedID: selectedID,
            dropPoint: dropPoint
        )
        pending = request
        openByID(WorkspaceTabs.sceneID)
        let delay = timeoutNanoseconds
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: delay)
            guard let self, self.pending == request else { return }
            self.pending = nil
            for session in request.sessions {
                session.retireResources()
            }
        }
        return request
    }

    /// Consumes `request` once its window has mounted.
    func take(_ request: PendingWindow) {
        if pending == request {
            pending = nil
        }
    }

    /// Transfers `sessionID` from `sourceController` into a new standalone
    /// window near `dropPoint` (or default position when `dropPoint == nil`).
    /// For live `.terminal` tabs, parks the running `TerminalView` via
    /// `TerminalHandoff` before detaching so shell and scrollback survive intact.
    @discardableResult
    func detachToNewWindow(
        sessionID: UUID,
        from sourceController: WorkspaceTabController,
        dropPoint: CGPoint? = nil,
        openByID: ((String) -> Void)? = nil
    ) -> Bool {
        guard sourceController.sessions.count > 1,
              let session = sourceController.sessions.first(where: { $0.id == sessionID }),
              let opener = openByID ?? WorkspaceTabs.openByID
        else { return false }

        if let terminalTab = session.terminalTab,
           TerminalHandoff.shared.canMove(terminalTab.handoffID) {
            let moving = TerminalHandoff.shared.move(terminalTab.handoffID) { [weak self] in
                self?.openWindow(
                    sessions: [session],
                    selectedID: session.id,
                    dropPoint: dropPoint,
                    with: opener
                )
            }
            if moving {
                _ = sourceController.detachSession(sessionID)
                return true
            }
        }

        guard let detached = sourceController.detachSession(sessionID) else { return false }
        openWindow(
            sessions: [detached],
            selectedID: detached.id,
            dropPoint: dropPoint,
            with: opener
        )
        return true
    }

    /// Transfers `sessionID` from `sourceController` into `targetController`
    /// at `targetIndex`, preserving live `WKWebView`, `EditorDocument`, and
    /// `TerminalHandoff` sessions. If `sourceController` becomes empty, closes
    /// `sourceWindow` cleanly without spawning a stray start window.
    @discardableResult
    func transferSession(
        sessionID: UUID,
        from sourceController: WorkspaceTabController,
        sourceWindow: NSWindow?,
        to targetController: WorkspaceTabController,
        targetWindow: NSWindow?,
        at targetIndex: Int?
    ) -> Bool {
        guard sourceController !== targetController,
              let session = sourceController.sessions.first(where: { $0.id == sessionID })
        else { return false }

        let willEmptySource = sourceController.sessions.count == 1

        if let terminalTab = session.terminalTab,
           TerminalHandoff.shared.canMove(terminalTab.handoffID) {
            let moving = TerminalHandoff.shared.move(terminalTab.handoffID) { [weak targetController, weak targetWindow] in
                guard let targetController else { return }
                targetController.adoptSession(session, at: targetIndex)
                targetWindow?.makeKeyAndOrderFront(nil)
            }
            if moving {
                _ = sourceController.detachSession(sessionID)
                if willEmptySource, let sourceWindow {
                    WorkspaceTabs.closeEmptiedWindow(sourceWindow, controller: sourceController)
                }
                return true
            }
        }

        guard let detached = sourceController.detachSession(sessionID) else { return false }
        targetController.adoptSession(detached, at: targetIndex)
        if willEmptySource, let sourceWindow {
            WorkspaceTabs.closeEmptiedWindow(sourceWindow, controller: sourceController)
        }
        targetWindow?.makeKeyAndOrderFront(nil)
        return true
    }

    /// Merges all open workspace windows into `destinationWindow`'s controller
    /// in front-to-back order, preserving live page, editor, and terminal
    /// sessions, and closes every emptied source window cleanly.
    @discardableResult
    func mergeAllWindows(into destinationWindow: NSWindow? = nil) -> Bool {
        let pairs = WorkspaceTabs.allControllers
        guard pairs.count >= 2 else { return false }

        let targetPair: (window: NSWindow, controller: WorkspaceTabController)
        if let destinationWindow,
           let match = pairs.first(where: { $0.window === destinationWindow }) {
            targetPair = match
        } else {
            targetPair = pairs[0]
        }

        let targetController = targetPair.controller
        let targetWindow = targetPair.window
        let previouslySelectedID = targetController.selectedID
        let sources = pairs.filter { $0.window !== targetWindow }
        guard !sources.isEmpty else { return false }

        for source in sources {
            let sessionIDs = source.controller.sessions.map(\.id)
            for id in sessionIDs {
                guard let session = source.controller.sessions.first(where: { $0.id == id }) else { continue }
                if let terminalTab = session.terminalTab,
                   TerminalHandoff.shared.canMove(terminalTab.handoffID) {
                    let moving = TerminalHandoff.shared.move(terminalTab.handoffID) { [weak targetController] in
                        guard let targetController else { return }
                        targetController.insert(session, at: nil)
                    }
                    if moving {
                        _ = source.controller.detachSession(id)
                        continue
                    }
                }
                if let detached = source.controller.detachSession(id) {
                    targetController.insert(detached, at: nil)
                }
            }
            WorkspaceTabs.closeEmptiedWindow(source.window, controller: source.controller)
        }

        targetController.select(previouslySelectedID)
        targetWindow.makeKeyAndOrderFront(nil)
        return true
    }
}
#endif
