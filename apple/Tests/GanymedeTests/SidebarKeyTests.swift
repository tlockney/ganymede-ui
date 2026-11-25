import SwiftUI
import XCTest

/// What Return, Right and Left do in the Files sidebar (#787, #791).
final class SidebarKeyTests: XCTestCase {
    private let file = FolderEntry(url: URL(fileURLWithPath: "/tmp/Io.ipynb"), isDirectory: false)
    private let folder = FolderEntry(url: URL(fileURLWithPath: "/tmp/moons"), isDirectory: true)

    private func action(
        _ key: SidebarKey, _ selected: FolderEntry?, expanded: Bool = false, canOpen: Bool = true,
        hasParent: Bool = false
    ) -> SidebarKeyAction? {
        SidebarKeyAction.action(
            for: key, selected: selected, isExpanded: expanded, canOpen: canOpen, hasParent: hasParent)
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

    /// At the top level, Left only collapses: there is no parent to go to.
    func testLeftAtTheTopCollapsesAnExpandedFolderOnly() {
        XCTAssertEqual(action(.left, folder, expanded: true), .collapse)
        XCTAssertNil(action(.left, folder, expanded: false))
        XCTAssertNil(action(.left, file))
    }

    /// Inside a folder, Left on a file or a collapsed folder selects the
    /// folder holding it, as in Finder (#791); an expanded folder still
    /// collapses first.
    func testLeftInsideAFolderSelectsTheParent() {
        XCTAssertEqual(action(.left, file, hasParent: true), .selectParent)
        XCTAssertEqual(action(.left, file, canOpen: false, hasParent: true), .selectParent)
        XCTAssertEqual(action(.left, folder, expanded: false, hasParent: true), .selectParent)
        XCTAssertEqual(action(.left, folder, expanded: true, hasParent: true), .collapse)
    }

    /// Having a parent changes only Left.
    func testAParentChangesNoOtherKey() {
        XCTAssertEqual(action(.return, file, hasParent: true), .open)
        XCTAssertNil(action(.return, file, canOpen: false, hasParent: true))
        XCTAssertEqual(action(.return, folder, hasParent: true), .toggle)
        XCTAssertEqual(action(.right, folder, expanded: false, hasParent: true), .expand)
        XCTAssertNil(action(.right, folder, expanded: true, hasParent: true))
        XCTAssertNil(action(.right, file, hasParent: true))
    }

    func testNothingSelectedLeavesEveryKeyAlone() {
        for key in [SidebarKey.return, .right, .left] {
            XCTAssertNil(action(key, nil), "\(key)")
            XCTAssertNil(action(key, nil, expanded: true), "\(key)")
            XCTAssertNil(action(key, nil, hasParent: true), "\(key)")
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

    // MARK: The listed rows (#791)

    private let root = URL(fileURLWithPath: "/tmp/notes", isDirectory: true)

    /// An entry under the root, as a listing gives it.
    private func listed(_ path: String, directory: Bool = false) -> FolderEntry {
        FolderEntry(url: root.appendingPathComponent(path, isDirectory: directory), isDirectory: directory)
    }

    /// notes/{moons/{Io.ipynb, deep/{Europa.ipynb}}, Titan.ipynb}, with
    /// moons and deep listed as if expanded.
    private struct Moons {
        var tree = SidebarTree()
        let moons: FolderEntry
        let deep: FolderEntry
        let io: FolderEntry
        let europa: FolderEntry
        let titan: FolderEntry
    }

    private func moonsTree() -> Moons {
        var m = Moons(
            moons: listed("moons", directory: true),
            deep: listed("moons/deep", directory: true),
            io: listed("moons/Io.ipynb"),
            europa: listed("moons/deep/Europa.ipynb"),
            titan: listed("Titan.ipynb"))
        m.tree.record([m.moons, m.titan], in: root)
        // Each folder's contents record under the folder row's own URL.
        m.tree.record([m.deep, m.io], in: m.moons.url)
        m.tree.record([m.europa], in: m.deep.url)
        return m
    }

    func testTheParentIsTheFolderRowHoldingTheRow() {
        let m = moonsTree()
        XCTAssertEqual(m.tree.parent(of: m.io, root: root), m.moons)
        XCTAssertEqual(m.tree.parent(of: m.deep, root: root), m.moons)
        XCTAssertEqual(m.tree.parent(of: m.europa, root: root), m.deep)
    }

    /// A row at the top has no parent row: Left there does nothing.
    func testARowAtTheTopHasNoParent() {
        let m = moonsTree()
        XCTAssertNil(m.tree.parent(of: m.titan, root: root))
        XCTAssertNil(m.tree.parent(of: m.moons, root: root))
    }

    func testARowNotListedHasNoParent() {
        let m = moonsTree()
        XCTAssertNil(m.tree.parent(of: listed("moons/Callisto.ipynb"), root: root))
        // The same URL as a folder is another row.
        XCTAssertNil(m.tree.parent(of: listed("moons/Io.ipynb", directory: true), root: root))
    }

    func testEveryListedRowIsListed() {
        let m = moonsTree()
        for entry in [m.moons, m.deep, m.io, m.europa, m.titan] {
            XCTAssertTrue(m.tree.lists(entry, root: root), entry.name)
        }
        XCTAssertFalse(m.tree.lists(listed("moons/Callisto.ipynb"), root: root))
        XCTAssertFalse(SidebarTree().lists(m.titan, root: root))
    }

    /// A reload that no longer lists a row (a file deleted outside the
    /// app) drops it, and the rest stay.
    func testAReloadDropsARowItNoLongerLists() {
        var m = moonsTree()
        m.tree.record([m.deep], in: m.moons.url)
        XCTAssertFalse(m.tree.lists(m.io, root: root))
        XCTAssertNil(m.tree.parent(of: m.io, root: root))
        XCTAssertTrue(m.tree.lists(m.deep, root: root))
        XCTAssertTrue(m.tree.lists(m.europa, root: root))
        XCTAssertTrue(m.tree.lists(m.titan, root: root))
        XCTAssertEqual(m.tree.entries(in: m.moons.url), [m.deep])
    }

    /// A folder a reload dropped takes the rows inside it, however deep,
    /// though their own listings were not reloaded.
    func testAReloadDroppingAFolderDropsWhatIsInside() {
        var m = moonsTree()
        m.tree.record([m.titan], in: root)
        for entry in [m.moons, m.deep, m.io, m.europa] {
            XCTAssertFalse(m.tree.lists(entry, root: root), entry.name)
        }
        XCTAssertNil(m.tree.parent(of: m.io, root: root))
        XCTAssertNil(m.tree.parent(of: m.europa, root: root))
        XCTAssertTrue(m.tree.lists(m.titan, root: root))
    }

    /// A folder renamed outside the app: the new name's rows are listed,
    /// the old ones are not.
    func testARenamedFolderListsItsNewRowsOnly() {
        var m = moonsTree()
        let satellites = listed("satellites", directory: true)
        let movedIo = listed("satellites/Io.ipynb")
        m.tree.record([satellites, m.titan], in: root)
        m.tree.record([movedIo], in: satellites.url)
        XCTAssertFalse(m.tree.lists(m.moons, root: root))
        XCTAssertFalse(m.tree.lists(m.io, root: root))
        XCTAssertTrue(m.tree.lists(movedIo, root: root))
        XCTAssertEqual(m.tree.parent(of: movedIo, root: root), satellites)
    }

    /// A row listed again in the same folder stays listed.
    func testListingTheSameRowsAgainKeepsThem() {
        var m = moonsTree()
        m.tree.record([m.deep, m.io], in: m.moons.url)
        XCTAssertTrue(m.tree.lists(m.io, root: root))
        XCTAssertEqual(m.tree.parent(of: m.io, root: root), m.moons)
    }

    func testNothingBeforeAListing() {
        XCTAssertNil(SidebarTree().entries(in: root))
        XCTAssertEqual(moonsTree().tree.entries(in: root)?.count, 2)
    }

    /// URLs that somehow make a loop never hang the walk up.
    func testALoopIsNotListed() {
        let a = listed("a", directory: true)
        let b = listed("a/b", directory: true)
        var tree = SidebarTree()
        tree.record([b], in: a.url)
        tree.record([a], in: b.url)
        XCTAssertFalse(tree.lists(a, root: root))
        XCTAssertFalse(tree.lists(b, root: root))
    }
}
