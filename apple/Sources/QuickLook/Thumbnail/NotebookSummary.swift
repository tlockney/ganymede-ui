import Foundation

/// The start of a notebook, as the Finder's thumbnail draws it (#135):
/// headings and text from Markdown cells, code, and its outputs' text or
/// first image. Read straight from the file's JSON, with no web view.
struct NotebookSummary: Equatable {
    enum Block: Equatable {
        case heading(String, level: Int)
        case text(String)
        case code([String])
        case output([String])
        case image(Data)
    }

    struct NotANotebook: LocalizedError {
        var errorDescription: String? { "The file is not an nbformat 4 notebook." }
    }

    var blocks: [Block] = []

    /// Enough for a page: a thumbnail cuts off whatever doesn't fit anyway.
    static let maxBlocks = 16
    static let maxCodeLines = 14
    static let maxOutputLines = 6
    /// A paragraph can be a whole inline `data:` image; a page shows far less.
    static let maxParagraph = 400

    init(data: Data) throws {
        guard let notebook = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cells = notebook["cells"] as? [[String: Any]]
        else { throw NotANotebook() }
        for cell in cells {
            switch cell["cell_type"] as? String {
            case "markdown": addMarkdown(Self.string(cell["source"]))
            case "code": addCode(cell)
            default: continue
            }
            if blocks.count >= Self.maxBlocks { break }
        }
        if blocks.count > Self.maxBlocks { blocks.removeLast(blocks.count - Self.maxBlocks) }
    }

    /// nbformat's multiline strings: one string, or an array of lines.
    static func string(_ value: Any?) -> String {
        if let s = value as? String { return s }
        if let lines = value as? [String] { return lines.joined() }
        return ""
    }

    private static func lines(_ text: String, max: Int) -> [String] {
        var lines = text.components(separatedBy: "\n")
        while lines.last?.trimmingCharacters(in: .whitespaces).isEmpty == true { lines.removeLast() }
        while lines.first?.trimmingCharacters(in: .whitespaces).isEmpty == true { lines.removeFirst() }
        return Array(lines.prefix(max))
    }

    private mutating func addMarkdown(_ source: String) {
        var paragraph: [String] = []
        var fence: [String]?
        /// The opening fence's character and length: CommonMark closes a
        /// fence only on a run of the same character at least as long.
        var opener: (Character, Int) = ("`", 0)
        func flush() {
            let text = paragraph.joined(separator: " ")
            if !text.isEmpty { blocks.append(.text(String(text.prefix(Self.maxParagraph)))) }
            paragraph = []
        }
        for raw in source.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            // Fenced code is code: a `# comment` in it is not a heading.
            if let mark = line.first, mark == "`" || mark == "~" {
                let run = line.prefix(while: { $0 == mark }).count
                if run >= 3, fence == nil {
                    flush()
                    fence = []
                    opener = (mark, run)
                    continue
                }
                if let code = fence, mark == opener.0, run >= opener.1,
                   line.dropFirst(run).allSatisfy({ $0 == " " }) {
                    if !code.isEmpty { blocks.append(.code(Array(code.prefix(Self.maxCodeLines)))) }
                    fence = nil
                    continue
                }
            }
            if fence != nil {
                fence!.append(raw)
                continue
            }
            let hashes = line.prefix(while: { $0 == "#" }).count
            if (1...6).contains(hashes), line.dropFirst(hashes).first == " " {
                flush()
                blocks.append(.heading(line.dropFirst(hashes).trimmingCharacters(in: .whitespaces), level: hashes))
            } else if line.isEmpty {
                flush()
            } else {
                paragraph.append(line)
            }
        }
        flush()
        if let code = fence, !code.isEmpty { blocks.append(.code(Array(code.prefix(Self.maxCodeLines)))) }
    }

    private mutating func addCode(_ cell: [String: Any]) {
        let source = Self.lines(Self.string(cell["source"]), max: Self.maxCodeLines)
        if !source.isEmpty { blocks.append(.code(source)) }
        for output in cell["outputs"] as? [[String: Any]] ?? [] {
            if let block = Self.block(for: output) {
                blocks.append(block)
                // One output a cell: the first says what the cell made.
                break
            }
        }
    }

    private static func block(for output: [String: Any]) -> Block? {
        switch output["output_type"] as? String {
        case "stream":
            let text = lines(string(output["text"]), max: maxOutputLines)
            return text.isEmpty ? nil : .output(text)
        case "error":
            let name = output["ename"] as? String ?? "Error"
            let value = output["evalue"] as? String ?? ""
            return .output([value.isEmpty ? name : "\(name): \(value)"])
        case "display_data", "execute_result":
            let data = output["data"] as? [String: Any] ?? [:]
            for mime in ["image/png", "image/jpeg"] {
                if let image = Data(base64Encoded: string(data[mime]), options: .ignoreUnknownCharacters),
                   !image.isEmpty {
                    return .image(image)
                }
            }
            let text = lines(string(data["text/plain"]), max: maxOutputLines)
            return text.isEmpty ? nil : .output(text)
        default:
            return nil
        }
    }
}
