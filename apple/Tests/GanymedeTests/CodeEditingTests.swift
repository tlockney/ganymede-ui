import XCTest

/// The editor's typing help: auto-indent, pairing, and line numbers.
final class CodeEditingTests: XCTestCase {
    /// Types `typed` at the `|` in `text` (or over the `[[...]]`
    /// selection) and returns the text after, with `|` at the cursor; nil
    /// when the editor leaves the plain insertion.
    private func type(_ typed: String, _ text: String, _ language: TextLanguage? = .python) -> String? {
        let (string, selection) = parse(text)
        guard let edit = CodeEditing.typing(typed, in: string as NSString, selection: selection, language: language) else {
            return nil
        }
        return render(edit, on: string)
    }

    private func backspace(_ text: String) -> String? {
        let (string, selection) = parse(text)
        guard let edit = CodeEditing.deleteBackward(in: string as NSString, selection: selection) else { return nil }
        return render(edit, on: string)
    }

    private func parse(_ text: String) -> (String, NSRange) {
        let marked = text as NSString
        let cursor = marked.range(of: "|")
        if cursor.location != NSNotFound {
            return (marked.replacingCharacters(in: cursor, with: ""), NSRange(location: cursor.location, length: 0))
        }
        let open = marked.range(of: "[[")
        let close = marked.range(of: "]]")
        let selection = NSRange(location: open.location, length: close.location - NSMaxRange(open))
        let string = marked.replacingCharacters(in: close, with: "") as NSString
        return (string.replacingCharacters(in: open, with: ""), selection)
    }

    /// The text after `edit`, with `|` at the cursor.
    private func render(_ edit: CodeEdit, on string: String) -> String {
        let after = (string as NSString).replacingCharacters(in: edit.range, with: edit.text) as NSString
        return after.replacingCharacters(in: NSRange(location: edit.selection.location, length: 0), with: "|")
    }

    func testReturnKeepsTheIndent() {
        XCTAssertEqual(type("\n", "    x = 1|"), "    x = 1\n    |")
        XCTAssertEqual(type("\n", "\tx = 1|", .bash), "\tx = 1\n\t|")
        XCTAssertEqual(type("\n", "x = 1|"), "x = 1\n|")
        XCTAssertEqual(type("\n", "first\n  second|\nthird", nil), "first\n  second\n  |\nthird")
    }

    func testReturnIndentsAfterAnOpener() {
        XCTAssertEqual(type("\n", "def f():|"), "def f():\n    |")
        XCTAssertEqual(type("\n", "if x:   |"), "if x:   \n    |")
        XCTAssertEqual(type("\n", "moons:|", .yaml), "moons:\n  |")
        XCTAssertEqual(type("\n", "label:|", .typescript), "label:\n|")
        XCTAssertEqual(type("\n", "xs = [|", .python), "xs = [\n    |")
    }

    func testReturnBetweenAPairPutsTheCloserOnItsOwnLine() {
        XCTAssertEqual(type("\n", "  f() {|}", .javascript), "  f() {\n    |\n  }")
        XCTAssertEqual(type("\n", "xs = [|]"), "xs = [\n    |\n]")
    }

    func testUsesTheFilesOwnIndent() {
        XCTAssertEqual(CodeEditing.indentUnit(in: "a:\n  b\n    c\n", language: .python), "  ")
        XCTAssertEqual(CodeEditing.indentUnit(in: "a {\n\tb\n\tc\n}\n", language: .javascript), "\t")
        XCTAssertEqual(CodeEditing.indentUnit(in: "f {\n    g\n}\n", language: .javascript), "    ")
        XCTAssertEqual(CodeEditing.indentUnit(in: "", language: .python), "    ")
        XCTAssertEqual(CodeEditing.indentUnit(in: "", language: .typescript), "  ")
        XCTAssertEqual(type("\t", "|", .typescript), "  |")
        XCTAssertNil(type("\t", "a\n\tb\n|", .bash))
    }

    func testPairsBracketsAndQuotes() {
        XCTAssertEqual(type("(", "print|"), "print(|)")
        XCTAssertEqual(type("[", "xs = |"), "xs = [|]")
        XCTAssertEqual(type("{", "f(|)", .javascript), "f({|})")
        XCTAssertEqual(type("\"", "x = |"), "x = \"|\"")
        XCTAssertEqual(type("`", "const s = |", .typescript), "const s = `|`")
        // Not in front of a word.
        XCTAssertNil(type("(", "|print"))
        // Not an apostrophe, or a quote after a quote.
        XCTAssertNil(type("'", "don|", .python))
        XCTAssertNil(type("\"", "\"\"|"))
        // Not quotes in prose, or backticks in Python.
        XCTAssertNil(type("'", "It|", .markdown))
        XCTAssertNil(type("`", "x = |"))
        XCTAssertEqual(type("(", "see |", .markdown), "see (|)")
    }

    func testStepsOverTheCloser() {
        XCTAssertEqual(type(")", "print(x|)"), "print(x)|")
        XCTAssertEqual(type("\"", "x = \"io|\""), "x = \"io\"|")
        XCTAssertNil(type(")", "print(x|"))
    }

    func testWrapsTheSelection() {
        let (string, selection) = parse("x = [[io]]")
        let edit = CodeEditing.typing("(", in: string as NSString, selection: selection, language: .python)
        XCTAssertEqual(edit, CodeEdit(range: NSRange(location: 4, length: 2), text: "(io)", selection: NSRange(location: 5, length: 2)))
    }

    func testACloserOnABlankLineGoesBackALevel() {
        XCTAssertEqual(type("}", "f() {\n  g()\n  |", .javascript), "f() {\n  g()\n}|")
        XCTAssertNil(type("}", "f() { g() |", .javascript))
    }

    func testBackspaceDeletesAnEmptyPair() {
        XCTAssertEqual(backspace("print(|)"), "print|")
        XCTAssertEqual(backspace("x = \"|\""), "x = |")
        XCTAssertNil(backspace("print(x|)"))
        XCTAssertNil(backspace("|"))
    }

    func testNumbersLines() {
        XCTAssertEqual(CodeEditing.lineCount(""), 1)
        XCTAssertEqual(CodeEditing.lineCount("io"), 1)
        XCTAssertEqual(CodeEditing.lineCount("io\n"), 2)
        XCTAssertEqual(CodeEditing.lineCount("io\neuropa\nganymede"), 3)
        XCTAssertEqual(CodeEditing.lineNumber(at: 3, in: "io\neuropa"), 2)
        XCTAssertEqual(CodeEditing.lineStart(5, in: "io\neuropa"), 3)
        XCTAssertEqual(CodeEditing.lineStart(2, in: "io\neuropa"), 0)
        XCTAssertEqual(CodeEditing.lineStart(3, in: "io\n"), 3)
    }
}
