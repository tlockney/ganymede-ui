import DeviceBridge
import Foundation
import UniformTypeIdentifiers

// What was shared, as `device.input` (#435): the first text, the first
// web link, and every file, each up to the bridge's 16 MiB.

enum ShareInput {
    /// One shared item, once loaded.
    enum Item: Equatable {
        case text(String)
        case link(URL)
        case file(name: String, type: String, data: Data)
    }

    /// The first text and link, and files while their total stays within
    /// the bridge's 16 MiB: an extension gets far less memory than an app,
    /// and the files are copied again as base64 into the script.
    static func input(_ items: [Item]) -> RunInput {
        var input = RunInput()
        var total = 0
        for item in items {
            switch item {
            case let .text(text) where input.text == nil: input.text = text
            case let .link(url) where input.url == nil: input.url = url
            case let .file(name, type, data) where total + data.count <= DeviceBridge.maxBinaryBytes:
                total += data.count
                input.files.append(RunFile(name: name, type: type, data: data))
            default: break
            }
        }
        return input
    }

    /// Loads the providers' items: a file URL as a file, a web link as a
    /// link, plain text as text, and any other data as a file. Files stop
    /// loading once their total passes 16 MiB, and a file is sized before
    /// it's read.
    static func load(_ providers: [NSItemProvider]) async -> [Item] {
        var items: [Item] = []
        var budget = DeviceBridge.maxBinaryBytes
        for provider in providers {
            guard let item = await load(provider, budget: budget) else { continue }
            if case let .file(_, _, data) = item { budget -= data.count }
            items.append(item)
        }
        return items
    }

    private static func load(_ provider: NSItemProvider, budget: Int) async -> Item? {
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
           let url = try? await provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier) as? URL {
            return file(at: url, budget: budget)
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
            return url.isFileURL ? file(at: url, budget: budget) : .link(url)
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
           let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
            return .text(text)
        }
        // Photos and Files usually hand over a file URL even for an image
        // or a document type, and sometimes the data itself.
        guard let type = provider.registeredTypeIdentifiers.first.flatMap({ UTType($0) }),
              let loaded = try? await provider.loadItem(forTypeIdentifier: type.identifier)
        else { return nil }
        if let url = loaded as? URL, url.isFileURL { return file(at: url, budget: budget) }
        guard let data = loaded as? Data, data.count <= budget else { return nil }
        let name = provider.suggestedName ?? "shared"
        return .file(name: type.preferredFilenameExtension.map { "\(name).\($0)" } ?? name, type: type.preferredMIMEType ?? "", data: data)
    }

    /// The file, if its size is known and within `budget`.
    static func file(at url: URL, budget: Int) -> Item? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, size <= budget,
              let data = try? Data(contentsOf: url), data.count <= budget
        else { return nil }
        let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? ""
        return .file(name: url.lastPathComponent, type: type, data: data)
    }
}
