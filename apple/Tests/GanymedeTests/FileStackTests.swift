import XCTest

/// The iPad's detail area: text files over the notebook (#251).
final class FileStackTests: XCTestCase {
    func testOpeningPutsTheFileOnTop() {
        XCTAssertEqual(FileStack.opening("a.py", in: []), ["a.py"])
        XCTAssertEqual(FileStack.opening("b.md", in: ["a.py"]), ["a.py", "b.md"])
    }

    func testOpeningAFileAgainMovesItRatherThanAddingIt() {
        XCTAssertEqual(FileStack.opening("a.py", in: ["a.py", "b.md"]), ["b.md", "a.py"])
        XCTAssertEqual(FileStack.opening("b.md", in: ["a.py", "b.md"]), ["a.py", "b.md"])
    }

    func testClosingRemovesOnlyThatFile() {
        XCTAssertEqual(FileStack.closing("a.py", in: ["a.py", "b.md"]), ["b.md"])
        XCTAssertEqual(FileStack.closing("c.txt", in: ["a.py"]), ["a.py"])
    }
}
