import Foundation

/// The Mac navigator's Search tab (#246): file and folder names under a
/// folder, and optionally the text of the notebooks there, read straight
/// from disk. The same limits as the page's search (#233), so a huge folder
/// stops early instead of hanging.
struct FileSearch {
    struct Match: Identifiable, Hashable {
        let entry: FolderEntry
        /// The first matching line of a notebook's cells, for a content match.
        let snippet: String?

        var id: URL { entry.url }
    }

    struct Results: Equatable {
        var names: [Match] = []
        var contents: [Match] = []
        /// A limit was reached, so some files weren't looked at.
        var stoppedEarly = false
    }

    var maxDepth = 6
    var maxFolders = 300
    var maxEntries = 5000
    var maxNotebooksRead = 200
    var maxResults = 200

    /// Whether `name` matches `query`: case-insensitive, and `.ipynb` is
    /// optional in the query.
    static func nameMatches(_ name: String, query: String) -> Bool {
        let q = normalized(query)
        guard !q.isEmpty else { return false }
        if name.localizedCaseInsensitiveContains(q) { return true }
        if name.lowercased().hasSuffix(".ipynb") {
            return String(name.dropLast(6)).localizedCaseInsensitiveContains(q)
        }
        return false
    }

    static func normalized(_ query: String) -> String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The first line of a notebook's cell sources that contains `query`,
    /// trimmed; nil when none does or the file isn't a notebook.
    static func snippet(inNotebook data: Data, query: String) -> String? {
        let q = normalized(query)
        guard !q.isEmpty,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cells = json["cells"] as? [[String: Any]]
        else { return nil }
        for cell in cells {
            let source: String
            if let lines = cell["source"] as? [String] {
                source = lines.joined()
            } else if let text = cell["source"] as? String {
                source = text
            } else {
                continue
            }
            for line in source.split(whereSeparator: \.isNewline) where line.localizedCaseInsensitiveContains(q) {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return trimmed.count > 160 ? String(trimmed.prefix(160)) + "…" : trimmed
            }
        }
        return nil
    }

    /// Searches `root` breadth first. `isCancelled` is checked between
    /// folders and files, so a newer query can stop an older one.
    func run(
        _ query: String,
        in root: URL,
        contents: Bool,
        fileManager: FileManager = .default,
        isCancelled: () -> Bool = { false }
    ) -> Results {
        var results = Results()
        guard !Self.normalized(query).isEmpty else { return results }
        var queue: [(URL, Int)] = [(root, 0)]
        var folders = 0
        var entries = 0
        var notebooksRead = 0
        while !queue.isEmpty {
            if isCancelled() { return results }
            let (folder, depth) = queue.removeFirst()
            folders += 1
            if folders > maxFolders {
                results.stoppedEarly = true
                break
            }
            guard let listed = try? FolderEntry.list(folder, fileManager: fileManager) else { continue }
            for entry in listed {
                if isCancelled() { return results }
                entries += 1
                if entries > maxEntries {
                    results.stoppedEarly = true
                    return results
                }
                if Self.nameMatches(entry.name, query: query) {
                    if results.names.count < maxResults {
                        results.names.append(Match(entry: entry, snippet: nil))
                    } else {
                        results.stoppedEarly = true
                    }
                }
                if entry.isDirectory {
                    if depth + 1 < maxDepth {
                        queue.append((entry.url, depth + 1))
                    } else {
                        results.stoppedEarly = true
                    }
                } else if contents, entry.isNotebook {
                    if notebooksRead >= maxNotebooksRead || results.contents.count >= maxResults {
                        results.stoppedEarly = true
                        continue
                    }
                    notebooksRead += 1
                    if let data = fileManager.contents(atPath: entry.url.path),
                       let snippet = Self.snippet(inNotebook: data, query: query) {
                        results.contents.append(Match(entry: entry, snippet: snippet))
                    }
                }
            }
        }
        return results
    }
}
