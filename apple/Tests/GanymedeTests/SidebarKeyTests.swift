import XCTest

/// What Return, Right and Left do in the Files sidebar (#787).
final class SidebarKeyTests: XCTestCase {
    private let file = FolderEntry(url: URL(fileURLWithPath: "/tmp/Io.ipynb"), isDirectory: false)
    private let folder = FolderEntry(url: URL(fileURLWithPath: "/tmp/moons"), isDirectory: true)

    private func action(_ key: SidebarKey, _ selected: FolderEntry?, expanded: Bool = false) -> SidebarKeyAction? {
        SidebarKeyAction.action(for: key, selected: selected, isExpanded: expanded)
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
}
