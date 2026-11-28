import SwiftUI
import XCTest
#if os(macOS)
import AppKit
#endif

final class WindowLayoutTests: XCTestCase {
    func testFillsAndRestores() {
        var layout = WindowLayout()
        XCTAssertNil(layout.filled)
        layout.toggle(.panel)
        XCTAssertEqual(layout.filled, .panel)
        // Another area's control moves the fill to it.
        layout.toggle(.inspector)
        XCTAssertEqual(layout.filled, .inspector)
        // Its own control restores.
        layout.toggle(.inspector)
        XCTAssertNil(layout.filled)
        layout.toggle(.notebook)
        layout.restore()
        XCTAssertNil(layout.filled)
    }

    func testShowsTheFilledAreaAndFoldsTheOthers() {
        var layout = WindowLayout()
        XCTAssertTrue(layout.shows(.panel, normally: true))
        XCTAssertFalse(layout.shows(.inspector, normally: false))
        XCTAssertFalse(layout.folds(.panel))
        layout.toggle(.panel)
        XCTAssertTrue(layout.shows(.panel, normally: false), "filled, even when it was hidden")
        XCTAssertFalse(layout.shows(.notebook, normally: true))
        XCTAssertFalse(layout.shows(.inspector, normally: true))
        XCTAssertTrue(layout.folds(.notebook))
        XCTAssertTrue(layout.folds(.inspector))
        XCTAssertFalse(layout.folds(.panel))
    }

    func testShowingOrHidingAnotherAreaRestores() {
        var layout = WindowLayout()
        layout.noteChange(of: .panel, shown: true)
        XCTAssertNil(layout.filled, "nothing to restore")

        layout.toggle(.panel)
        // Filling the panel shows it: it stays filled.
        layout.noteChange(of: .panel, shown: true)
        XCTAssertEqual(layout.filled, .panel)
        // ⌃` hides it: the layout comes back.
        layout.noteChange(of: .panel, shown: false)
        XCTAssertNil(layout.filled)

        layout.toggle(.notebook)
        // ⌥⌘0 shows the inspector over a filled notebook: it shows.
        layout.noteChange(of: .inspector, shown: true)
        XCTAssertNil(layout.filled)
    }

    func testFillWindowOwnsCmdShiftReturnWithoutCellRunAllCollision() {
        let fillWindowShortcut = KeyboardShortcut(.return, modifiers: [.command, .shift])
        XCTAssertEqual(MacCommandShortcuts.fillWindow, fillWindowShortcut)
        XCTAssertNil(
            MacCommandShortcuts.runAllCells,
            "Cell › Run All Cells must not claim ⇧⌘↩ on Mac, which shadows View › Fill Window"
        )
    }

    #if os(macOS)
    @MainActor
    func testMainMenuDispatchesCmdShiftReturnToFillWindowNotRunAllCells() throws {
        final class Target: NSObject {
            var fillWindowCount = 0
            var runAllCount = 0
            @objc func fillWindow(_: Any?) { fillWindowCount += 1 }
            @objc func runAll(_: Any?) { runAllCount += 1 }
        }

        func makeItem(_ title: String, target: AnyObject, action: Selector, shortcut: KeyboardShortcut?) -> NSMenuItem {
            let item = NSMenuItem(
                title: title,
                action: action,
                keyEquivalent: shortcut.map { String($0.key.character) } ?? ""
            )
            item.target = target
            if let modifiers = shortcut?.modifiers {
                var flags: NSEvent.ModifierFlags = []
                if modifiers.contains(.command) { flags.insert(.command) }
                if modifiers.contains(.shift) { flags.insert(.shift) }
                if modifiers.contains(.option) { flags.insert(.option) }
                if modifiers.contains(.control) { flags.insert(.control) }
                item.keyEquivalentModifierMask = flags
            }
            return item
        }

        let target = Target()
        let mainMenu = NSMenu(title: "MainMenu")

        // Cell sits alongside View in the Mac menu bar; if both claim ⇧⌘↩,
        // the earlier menu item intercepts View › Fill Window.
        let cellItem = NSMenuItem(title: "Cell", action: nil, keyEquivalent: "")
        let cellMenu = NSMenu(title: "Cell")
        cellMenu.addItem(makeItem(
            "Run All Cells",
            target: target,
            action: #selector(Target.runAll(_:)),
            shortcut: MacCommandShortcuts.runAllCells
        ))
        cellItem.submenu = cellMenu
        mainMenu.addItem(cellItem)

        let viewItem = NSMenuItem(title: "View", action: nil, keyEquivalent: "")
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(makeItem(
            "Fill Window",
            target: target,
            action: #selector(Target.fillWindow(_:)),
            shortcut: MacCommandShortcuts.fillWindow
        ))
        viewItem.submenu = viewMenu
        mainMenu.addItem(viewItem)

        let event = try XCTUnwrap(NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: [.command, .shift],
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            characters: "\r",
            charactersIgnoringModifiers: "\r",
            isARepeat: false,
            keyCode: 36
        ))

        XCTAssertTrue(mainMenu.performKeyEquivalent(with: event))
        XCTAssertEqual(target.fillWindowCount, 1)
        XCTAssertEqual(target.runAllCount, 0)
    }
    #endif
}
