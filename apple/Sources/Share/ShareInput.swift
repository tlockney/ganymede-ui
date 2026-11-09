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

    static func input(_ items: [Item]) -> RunInput {
        var input = RunInput()
        for item in items {
            switch item {
            case let .text(text) where input.text == nil: input.text = text
            case let .link(url) where input.url == nil: input.url = url
            case let .file(name, type, data) where data.count <= DeviceBridge.maxBinaryBytes:
                input.files.append(RunFile(name: name, type: type, data: data))
            default: break
            }
        }
        return input
    }

    /// Loads the providers' items: a file URL as a file, a web link as a
    /// link, plain text as text, and any other data as a file.
    static func load(_ providers: [NSItemProvider]) async -> [Item] {
        var items: [Item] = []
        for provider in providers {
            if let item = await load(provider) { items.append(item) }
        }
        return items
    }

    private static func load(_ provider: NSItemProvider) async -> Item? {
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
           let url = try? await provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier) as? URL {
            return file(at: url)
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
            return url.isFileURL ? file(at: url) : .link(url)
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
           let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
            return .text(text)
        }
        guard let type = provider.registeredTypeIdentifiers.first.flatMap { UTType($0) },
              let data = try? await provider.loadItem(forTypeIdentifier: type.identifier) as? Data
        else { return nil }
        let name = provider.suggestedName ?? "shared"
        return .file(name: type.preferredFilenameExtension.map { "\(name).\($0)" } ?? name, type: type.preferredMIMEType ?? "", data: data)
    }

    private static func file(at url: URL) -> Item? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        guard size <= DeviceBridge.maxBinaryBytes, let data = try? Data(contentsOf: url) else { return nil }
        let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? ""
        return .file(name: url.lastPathComponent, type: type, data: data)
    }
}
