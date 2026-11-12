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
        for cell in cells {
            let source = Self.string(cell["source"])
            switch cell["cell_type"] as? String {
            case "markdown":
                headings += Self.headings(in: source)
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
        let joined = parts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
        text = String(joined.prefix(Self.maxText))
    }

    /// A line for under the title: the first Markdown line that isn't a
    /// heading or a fence.
    var summary: String? {
        for raw in text.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix("#") || line.hasPrefix("```") || line.hasPrefix("~~~") { continue }
            return String(line.prefix(300))
        }
        return nil
    }

    /// nbformat's multiline strings: one string, or an array of lines.
    static func string(_ value: Any?) -> String {
        if let s = value as? String { return s }
        if let lines = value as? [String] { return lines.joined() }
        return ""
    }

    /// ATX headings outside fenced code, without their `#`s.
    static func headings(in markdown: String) -> [String] {
        var found: [String] = []
        var fence: (Character, Int)?
        for raw in markdown.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if let mark = line.first, mark == "`" || mark == "~" {
                let run = line.prefix(while: { $0 == mark }).count
                if run >= 3 {
                    if let open = fence {
                        if open.0 == mark, run >= open.1 { fence = nil }
                    } else {
                        fence = (mark, run)
                    }
                    continue
                }
            }
            guard fence == nil else { continue }
            let hashes = line.prefix(while: { $0 == "#" }).count
            guard (1...6).contains(hashes), line.dropFirst(hashes).first == " " else { continue }
            var heading = line.dropFirst(hashes).trimmingCharacters(in: .whitespaces)
            // A closing sequence: `## Title ##`.
            while heading.hasSuffix("#") { heading.removeLast() }
            heading = heading.trimmingCharacters(in: .whitespaces)
            if !heading.isEmpty { found.append(heading) }
        }
        return found
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
