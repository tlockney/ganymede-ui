import Foundation

/// What Spotlight indexes of a notebook (#305): its title (the first
/// heading, or the file name), its Markdown text and headings, the
/// kernel's language, and with `code`, its code cells. Never outputs.
/// Read straight from the file's JSON.
struct NotebookIndexText: Equatable {
    var title: String
    var text: String
    var headings: [String]
    var language: String?
    /// A line for under the title: the first line of Markdown prose, not
    /// a heading or fenced code.
    var summary: String?

    struct NotANotebook: LocalizedError {
        var errorDescription: String? { "The file is not an nbformat 4 notebook." }
    }

    /// Spotlight needs no more to find a phrase; a huge Markdown cell
    /// (an inline image) would only slow the index.
    static let maxText = 200_000
    static let maxHeadings = 100

    init(data: Data, fileName: String, code: Bool) throws {
        guard let notebook = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cells = notebook["cells"] as? [[String: Any]]
        else { throw NotANotebook() }
        var parts: [String] = []
        var headings: [String] = []
        var summary: String?
        for cell in cells {
            let source = Self.string(cell["source"])
            switch cell["cell_type"] as? String {
            case "markdown":
                let lines = Self.lines(in: source)
                headings += lines.compactMap(\.heading)
                if summary == nil {
                    summary = lines.first { $0.heading == nil && !$0.code && !$0.text.isEmpty }
                        .map { String($0.text.prefix(300)) }
                }
                parts.append(source)
            case "code" where code:
                parts.append(source)
            default:
                continue
            }
        }
        let metadata = notebook["metadata"] as? [String: Any]
        let kernelspec = metadata?["kernelspec"] as? [String: Any]
        let info = metadata?["language_info"] as? [String: Any]
        language = (kernelspec?["language"] as? String ?? info?["name"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        title = headings.first ?? (fileName as NSString).deletingPathExtension
        self.headings = Array(headings.prefix(Self.maxHeadings))
        self.summary = summary
        let joined = parts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
        text = String(joined.prefix(Self.maxText))
    }

    /// nbformat's multiline strings: one string, or an array of lines.
    static func string(_ value: Any?) -> String {
        if let s = value as? String { return s }
        if let lines = value as? [String] { return lines.joined() }
        return ""
    }

    /// A Markdown line: its text, whether it is in fenced code, and the
    /// heading it makes, if any.
    struct Line {
        var text: String
        var code: Bool
        var heading: String?
    }

    /// `markdown`'s lines, with fenced code and ATX headings marked. A
    /// fence closes only on a bare run of its character, at least as long
    /// as the one that opened it, as CommonMark has it.
    static func lines(in markdown: String) -> [Line] {
        var found: [Line] = []
        var fence: (Character, Int)?
        for raw in markdown.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if let mark = line.first, mark == "`" || mark == "~" {
                let run = line.prefix(while: { $0 == mark }).count
                if run >= 3 {
                    if let open = fence {
                        if open.0 == mark, run >= open.1, line.dropFirst(run).allSatisfy({ $0 == " " }) {
                            fence = nil
                            continue
                        }
                    } else {
                        fence = (mark, run)
                        continue
                    }
                }
            }
            if fence != nil {
                found.append(Line(text: line, code: true))
                continue
            }
            found.append(Line(text: line, code: false, heading: heading(line)))
        }
        return found
    }

    /// ATX headings outside fenced code, without their `#`s.
    static func headings(in markdown: String) -> [String] {
        lines(in: markdown).compactMap(\.heading)
    }

    /// The heading `line` makes, if it is one. A closing run of `#`s goes
    /// only after a space: `# Intro to C#` keeps its `#`.
    private static func heading(_ line: String) -> String? {
        let hashes = line.prefix(while: { $0 == "#" }).count
        guard (1...6).contains(hashes), line.dropFirst(hashes).first == " " else { return nil }
        var heading = line.dropFirst(hashes).trimmingCharacters(in: .whitespaces)
        if let range = heading.range(of: #"(^|\s)#+$"#, options: .regularExpression) {
            heading.removeSubrange(range)
        }
        heading = heading.trimmingCharacters(in: .whitespaces)
        return heading.isEmpty ? nil : heading
    }
}

/// Which notebooks to index again and which to drop, from what is wanted
/// now and what the index holds (#305).
struct SpotlightPlan: Equatable {
    var index: [String]
    var remove: [String]

    /// `wanted`: the notebooks to show, by path, with their modification
    /// dates (files gone or too big left out). `indexed`: what the index
    /// holds, with the dates it was indexed at. `all` indexes everything
    /// wanted again, as when the code setting changed.
    static func make(wanted: [String: Date], indexed: [String: Date], all: Bool) -> SpotlightPlan {
        SpotlightPlan(
            index: wanted.filter { all || indexed[$0.key] != $0.value }.keys.sorted(),
            remove: indexed.keys.filter { wanted[$0] == nil }.sorted()
        )
    }
}

/// The Spotlight settings (#305), kept in UserDefaults.
enum SpotlightKeys {
    /// Whether notebooks are in Spotlight at all (default on).
    static let enabled = "spotlightEnabled"
    /// Whether code cells are indexed too (default off).
    static let code = "spotlightCode"
    /// Folders whose notebooks are indexed too (Mac).
    static let folders = "spotlightFolders"
}
