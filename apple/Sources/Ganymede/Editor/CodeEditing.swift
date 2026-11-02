import Foundation

/// A change the editor makes in place of what was typed: the text to put
/// over `range`, and the selection after. Ranges are in UTF-16 units, as
/// the text views count.
struct CodeEdit: Equatable {
    var range: NSRange
    var text: String
    var selection: NSRange
}

/// Typing help for code (#122): auto-indent, bracket and quote pairing,
/// and line counts for the gutter. Plain functions on the text, so the Mac
/// and iOS text views share them and tests can run them.
enum CodeEditing {
    private static let pairs: [Character: String] = ["(": ")", "[": "]", "{": "}", "\"": "\"", "'": "'", "`": "`"]
    private static let closers: Set<Character> = [")", "]", "}"]

    /// What typing `typed` over `selection` does instead of a plain
    /// insertion; nil for the plain insertion.
    static func typing(_ typed: String, in text: NSString, selection: NSRange, language: TextLanguage?) -> CodeEdit? {
        if typed == "\n" {
            return newline(in: text, selection: selection, language: language)
        }
        if typed == "\t" {
            let unit = indentUnit(in: text, language: language)
            guard unit != "\t", selection.length == 0 else { return nil }
            return insert(unit, in: selection)
        }
        guard typed.count == 1, let typedCharacter = typed.first else { return nil }
        let next = character(in: text, at: NSMaxRange(selection))
        let previous = character(in: text, at: selection.location - 1)
        let quote = quotes(for: language).contains(typedCharacter)

        // Typing the closer that is already there steps over it.
        if selection.length == 0, closers.contains(typedCharacter) || quote, next == typedCharacter {
            return CodeEdit(
                range: NSRange(location: selection.location, length: 0), text: "",
                selection: NSRange(location: selection.location + 1, length: 0))
        }

        // A closer typed on a blank line goes back one level.
        if closers.contains(typedCharacter) {
            guard selection.length == 0 else { return nil }
            let before = lineBefore(selection.location, in: text)
            let unit = indentUnit(in: text, language: language)
            guard !before.isEmpty, before.allSatisfy({ $0 == " " || $0 == "\t" }), before.hasSuffix(unit) else {
                return nil
            }
            let length = (unit as NSString).length
            let range = NSRange(location: selection.location - length, length: length)
            return CodeEdit(range: range, text: typed, selection: NSRange(location: range.location + 1, length: 0))
        }

        guard let close = pairs[typedCharacter], quote || !"\"'`".contains(typedCharacter) else { return nil }
        // Around a selection: wrap it, and keep it selected.
        if selection.length > 0 {
            let inner = text.substring(with: selection)
            return CodeEdit(
                range: selection, text: typed + inner + close,
                selection: NSRange(location: selection.location + 1, length: selection.length))
        }
        // Pair only before a space, a closer or the end, so typing in front
        // of a word doesn't add a stray closer.
        if let next, !next.isWhitespace, !closers.contains(next), !(quote && next == ",") {
            return nil
        }
        // An apostrophe in a word, or the third quote of a Python string.
        if quote, let previous, previous.isLetter || previous.isNumber || previous == typedCharacter {
            return nil
        }
        return CodeEdit(range: selection, text: typed + close, selection: NSRange(location: selection.location + 1, length: 0))
    }

    /// Backspace between a pair, like `(|)`, deletes both.
    static func deleteBackward(in text: NSString, selection: NSRange) -> CodeEdit? {
        guard selection.length == 0,
              let previous = character(in: text, at: selection.location - 1),
              let next = character(in: text, at: selection.location),
              pairs[previous] == String(next)
        else { return nil }
        return CodeEdit(
            range: NSRange(location: selection.location - 1, length: 2), text: "",
            selection: NSRange(location: selection.location - 1, length: 0))
    }

    /// Return keeps the line's indent, and adds a level after an opening
    /// bracket (or a Python or YAML colon). Between a pair, like `{|}`, the
    /// closer moves to its own line.
    static func newline(in text: NSString, selection: NSRange, language: TextLanguage?) -> CodeEdit {
        let before = lineBefore(selection.location, in: text)
        let indent = String(before.prefix { $0 == " " || $0 == "\t" })
        let last = before.trimmingCharacters(in: .whitespaces).last
        let next = character(in: text, at: NSMaxRange(selection))
        var opens = false
        if let last {
            opens = "([{".contains(last) || (last == ":" && (language == .python || language == .yaml))
        }
        let unit = opens ? indentUnit(in: text, language: language) : ""
        let inner = "\n" + indent + unit
        if opens, let last, let close = pairs[last], let next, String(next) == close {
            return CodeEdit(
                range: selection, text: inner + "\n" + indent,
                selection: NSRange(location: selection.location + (inner as NSString).length, length: 0))
        }
        return insert(inner, in: selection)
    }

    /// One level of indent: the file's own (tabs, or the narrowest space
    /// indent of 2 or 4), else the language's usual.
    static func indentUnit(in text: NSString, language: TextLanguage?) -> String {
        var narrowest: Int?
        var tabs = 0
        var spaces = 0
        var index = 0
        var lines = 0
        while index < text.length, lines < 1000 {
            let line = text.lineRange(for: NSRange(location: index, length: 0))
            var width = 0
            var position = line.location
            while position < NSMaxRange(line), text.character(at: position) == 0x20 {
                width += 1
                position += 1
            }
            if position < NSMaxRange(line), text.character(at: position) == 0x09, width == 0 {
                tabs += 1
            } else if width > 0, position < NSMaxRange(line), text.character(at: position) != 0x0A {
                spaces += 1
                narrowest = min(narrowest ?? width, width)
            }
            index = NSMaxRange(line)
            lines += 1
        }
        if tabs > spaces { return "\t" }
        if let narrowest, narrowest >= 2 {
            return String(repeating: " ", count: narrowest >= 4 ? 4 : 2)
        }
        switch language {
        case .python, nil: return "    "
        default: return "  "
        }
    }

    /// The number of the line holding `index`, from 1.
    static func lineNumber(at index: Int, in text: NSString) -> Int {
        var number = 1
        var position = 0
        let end = min(index, text.length)
        while position < end {
            let found = text.range(of: "\n", options: .literal, range: NSRange(location: position, length: end - position))
            if found.location == NSNotFound { break }
            number += 1
            position = found.location + 1
        }
        return number
    }

    /// How many lines the gutter numbers: a final newline starts one more.
    static func lineCount(_ text: NSString) -> Int {
        lineNumber(at: text.length, in: text)
    }

    private static func quotes(for language: TextLanguage?) -> Set<Character> {
        switch language {
        // Prose, where quotes are mostly apostrophes.
        case .markdown, nil: return []
        case .javascript, .typescript, .tsx, .bash: return ["\"", "'", "`"]
        default: return ["\"", "'"]
        }
    }

    private static func insert(_ string: String, in selection: NSRange) -> CodeEdit {
        CodeEdit(
            range: selection, text: string,
            selection: NSRange(location: selection.location + (string as NSString).length, length: 0))
    }

    /// The text from the start of the line up to `index`.
    private static func lineBefore(_ index: Int, in text: NSString) -> String {
        let start = lineStart(index, in: text)
        return text.substring(with: NSRange(location: start, length: index - start))
    }

    /// Where the line holding `index` starts: just after the newline before.
    static func lineStart(_ index: Int, in text: NSString) -> Int {
        let end = max(0, min(index, text.length))
        let found = text.range(of: "\n", options: [.backwards, .literal], range: NSRange(location: 0, length: end))
        return found.location == NSNotFound ? 0 : found.location + 1
    }

    private static func character(in text: NSString, at index: Int) -> Character? {
        guard index >= 0, index < text.length else { return nil }
        return text.substring(with: NSRange(location: index, length: 1)).first
    }
}
