import XCTest

/// The sidebar's foot in words (#873): the folder's name, and where it is.
final class ProjectLineTests: XCTestCase {
    private let home = URL(fileURLWithPath: "/Users/tlockney", isDirectory: true)
    private let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"

    private func lines(_ path: String, place: String = "This Mac") -> (title: String, detail: String) {
        ProjectLineText.lines(folder: URL(fileURLWithPath: path, isDirectory: true), home: home, placeName: place)
    }

    func testAFolderUnderHomeReadsItsPathFromHome() {
        XCTAssertEqual(lines("/Users/tlockney/notes/moons").title, "moons")
        XCTAssertEqual(lines("/Users/tlockney/notes/moons").detail, "~/notes · This Mac")
    }

    func testAFolderOutsideHomeReadsItsWholeParent() {
        XCTAssertEqual(lines("/Volumes/Secondary/notes").title, "notes")
        XCTAssertEqual(lines("/Volumes/Secondary/notes").detail, "/Volumes/Secondary · This Mac")
        // A folder whose name only starts with the home folder's is not in it.
        XCTAssertEqual(lines("/Users/tlockney2/notes").detail, "/Users/tlockney2 · This Mac")
    }

    func testAFolderInHomeReadsTilde() {
        XCTAssertEqual(lines("/Users/tlockney/notes").detail, "~ · This Mac")
    }

    /// A root has no parent: "/" over the place, not "/..".
    func testARootReadsSlashOverThePlace() throws {
        XCTAssertEqual(lines("/").title, "/")
        XCTAssertEqual(lines("/").detail, "This Mac")
        let root = try XCTUnwrap(FolderEntry.machineURL(id, path: ""))
        let machine = ProjectLineText.lines(folder: root, home: nil, placeName: "workmbp")
        XCTAssertEqual(machine.title, "/")
        XCTAssertEqual(machine.detail, "workmbp")
    }

    func testAbbreviatingKeepsOtherPathsAndARootHome() {
        XCTAssertEqual(ProjectLineText.abbreviate("/Users/x/notes", home: "/Users/x/"), "~/notes")
        XCTAssertEqual(ProjectLineText.abbreviate("/Users/x", home: "/Users/x/"), "~")
        // A home at the root would make every path home.
        XCTAssertEqual(ProjectLineText.abbreviate("/notes", home: "/"), "/notes")
    }

    /// The home folder is named, and the folder it is in, which isn't home.
    func testTheHomeFolderIsNamedOverTheFolderItIsIn() {
        XCTAssertEqual(lines("/Users/tlockney").title, "tlockney")
        XCTAssertEqual(lines("/Users/tlockney").detail, "/Users · This Mac")
    }

    /// A machine's window takes the path its server reports, and the
    /// machine's name: this Mac's home is nothing to it.
    func testAMachinesWindowNamesTheMachine() throws {
        let folder = try XCTUnwrap(FolderEntry.machineURL(id, path: "notes/moons"))
        let lines = ProjectLineText.lines(folder: folder, home: nil, placeName: "workmbp")
        XCTAssertEqual(lines.title, "moons")
        XCTAssertEqual(lines.detail, "/notes · workmbp")
    }
}
