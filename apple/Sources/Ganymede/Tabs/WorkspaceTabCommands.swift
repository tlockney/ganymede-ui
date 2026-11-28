#if os(macOS)
import AppKit
import SwiftUI

/// Window menu tab parity commands (#905):
/// - `Select Previous Tab` (`⌃⇧Tab`)
/// - `Select Next Tab` (`⌃Tab`)
/// - `Move Tab to New Window`
/// - `Merge All Windows`
/// - `Show All Tabs` (`⇧⌘\`)
/// - `Select Tab 1`–`8` (`⌘1`–`⌘8`) and `Select Last Tab` (`⌘9`)
struct WindowTabCommands: View {
    @FocusedValue(\.workspaceTabController) private var focusedController
    private var registry = WorkspaceTabs.registryState

    private var activeController: WorkspaceTabController? {
        focusedController ?? WorkspaceTabs.frontController()
    }

    private var tabCount: Int {
        activeController?.sessions.count ?? 0
    }

    var body: some View {
        let _ = registry.revision
        Divider()
        Button("Select Previous Tab") {
            activeController?.selectPrevious()
        }
        .keyboardShortcut(.tab, modifiers: [.control, .shift])
        .disabled(tabCount <= 1)

        Button("Select Next Tab") {
            activeController?.selectNext()
        }
        .keyboardShortcut(.tab, modifiers: [.control])
        .disabled(tabCount <= 1)

        Button("Move Tab to New Window") {
            guard let controller = activeController else { return }
            WorkspaceTabHandoff.shared.detachToNewWindow(
                sessionID: controller.selectedID,
                from: controller
            )
        }
        .disabled(tabCount <= 1)

        Button("Merge All Windows") {
            let preferred = activeController?.hostWindow ?? NSApp.keyWindow ?? NSApp.mainWindow
            WorkspaceTabHandoff.shared.mergeAllWindows(into: preferred)
        }
        .disabled(registry.windowCount < 2)

        Button(activeController?.isShowingOverview == true ? "Hide All Tabs" : "Show All Tabs") {
            activeController?.toggleOverview()
        }
        .keyboardShortcut("\\", modifiers: [.command, .shift])
        .disabled(activeController == nil)

        Menu("Select Tab") {
            ForEach(1...8, id: \.self) { digit in
                Button(tabMenuTitle(forDigit: digit)) {
                    activeController?.selectShortcutDigit(digit)
                }
                .keyboardShortcut(KeyEquivalent(Character("\(digit)")), modifiers: .command)
                .disabled(TabShortcutResolver.targetIndex(forDigit: digit, tabCount: tabCount) == nil)
            }
            Divider()
            Button(tabMenuTitle(forDigit: 9)) {
                activeController?.selectShortcutDigit(9)
            }
            .keyboardShortcut("9", modifiers: .command)
            .disabled(tabCount == 0)
        }
        .disabled(tabCount == 0)
    }

    private func tabMenuTitle(forDigit digit: Int) -> String {
        guard let controller = activeController,
              let index = TabShortcutResolver.targetIndex(forDigit: digit, tabCount: controller.sessions.count)
        else {
            return digit == 9 ? "Last Tab" : "Tab \(digit)"
        }
        let title = controller.sessions[index].descriptor.title
        return digit == 9 ? "Last Tab (\(title))" : "\(digit). \(title)"
    }
}
#endif
