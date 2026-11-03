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
        func flush() {
            if !paragraph.isEmpty { blocks.append(.text(paragraph.joined(separator: " "))) }
            paragraph = []
        }
        for raw in source.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
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
