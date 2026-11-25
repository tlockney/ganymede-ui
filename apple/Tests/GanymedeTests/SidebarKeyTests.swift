import SwiftUI
import XCTest

/// What Return, Right and Left do in the Files sidebar (#787).
final class SidebarKeyTests: XCTestCase {
    private let file = FolderEntry(url: URL(fileURLWithPath: "/tmp/Io.ipynb"), isDirectory: false)
    private let folder = FolderEntry(url: URL(fileURLWithPath: "/tmp/moons"), isDirectory: true)

    private func action(
        _ key: SidebarKey, _ selected: FolderEntry?, expanded: Bool = false, canOpen: Bool = true
    ) -> SidebarKeyAction? {
        SidebarKeyAction.action(for: key, selected: selected, isExpanded: expanded, canOpen: canOpen)
    }

    func testReturnOpensAFileAndTogglesAFolder() {
        XCTAssertEqual(action(.return, file), .open)
        XCTAssertEqual(action(.return, folder, expanded: false), .toggle)
        XCTAssertEqual(action(.return, folder, expanded: true), .toggle)
    }

    func testRightExpandsACollapsedFolderOnly() {
        XCTAssertEqual(action(.right, folder, expanded: false), .expand)
        XCTAssertNil(action(.right, folder, expanded: true))
        XCTAssertNil(action(.right, file))
    }

    func testLeftCollapsesAnExpandedFolderOnly() {
        XCTAssertEqual(action(.left, folder, expanded: true), .collapse)
        XCTAssertNil(action(.left, folder, expanded: false))
        XCTAssertNil(action(.left, file))
    }

    func testNothingSelectedLeavesEveryKeyAlone() {
        for key in [SidebarKey.return, .right, .left] {
            XCTAssertNil(action(key, nil), "\(key)")
            XCTAssertNil(action(key, nil, expanded: true), "\(key)")
        }
    }

    /// A file's expanded flag is never true in the views, but the decision
    /// doesn't depend on it.
    func testAFileIgnoresTheExpandedFlag() {
        XCTAssertEqual(action(.return, file, expanded: true), .open)
        XCTAssertNil(action(.right, file, expanded: true))
        XCTAssertNil(action(.left, file, expanded: true))
    }

    /// A file this place can't open (a machine's text file) stays selected
    /// but Return leaves it alone; a folder toggles whatever `canOpen` says.
    func testReturnOnAFileThePlaceCantOpenIsIgnored() {
        XCTAssertNil(action(.return, file, canOpen: false))
        XCTAssertEqual(action(.return, folder, canOpen: false), .toggle)
        XCTAssertEqual(action(.right, folder, canOpen: false), .expand)
    }

    func testKeysFromPresses() {
        let keys: [(KeyEquivalent, SidebarKey)] = [(.return, .return), (.rightArrow, .right), (.leftArrow, .left)]
        // Caps Lock, and the keypad and function flags arrows carry, are fine.
        let allowed: [EventModifiers] = [[], .capsLock, .numericPad, .function, [.numericPad, .function]]
        let refused: [EventModifiers] = [.command, .option, .control, .shift, [.command, .capsLock]]
        for (key, expected) in keys {
            for modifiers in allowed {
                XCTAssertEqual(SidebarKey(key: key, modifiers: modifiers), expected, "\(expected) \(modifiers)")
            }
            for modifiers in refused {
                XCTAssertNil(SidebarKey(key: key, modifiers: modifiers), "\(expected) \(modifiers)")
            }
        }
        XCTAssertNil(SidebarKey(key: .upArrow, modifiers: []))
        XCTAssertNil(SidebarKey(key: KeyEquivalent("a"), modifiers: []))
    }

    /// A selection goes with a renamed or deleted row, or one inside it.
    func testSelectionInsideARemovedFolder() {
        func entry(_ path: String, directory: Bool = false) -> FolderEntry {
            FolderEntry(url: URL(fileURLWithPath: "/tmp/" + path), isDirectory: directory)
        }
        let moons = entry("moons", directory: true)
        XCTAssertTrue(moons.isAtOrInside(moons))
        XCTAssertTrue(entry("moons/Io.ipynb").isAtOrInside(moons))
        XCTAssertTrue(entry("moons/deep/Io.ipynb").isAtOrInside(moons))
        XCTAssertFalse(entry("moons2", directory: true).isAtOrInside(moons))
        XCTAssertFalse(entry("moons2/Io.ipynb").isAtOrInside(moons))
        XCTAssertFalse(entry("Io.ipynb").isAtOrInside(moons))
        XCTAssertFalse(moons.isAtOrInside(entry("moons/Io.ipynb")))
    }
}
