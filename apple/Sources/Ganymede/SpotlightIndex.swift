import CoreSpotlight
import Foundation
import SwiftUI
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#endif

/// Notebooks in Spotlight (#305): the ones opened lately, and on the Mac
/// the notebooks in folders added in Settings. A search finds a notebook
/// by its title, Markdown text and headings (and code, if asked), and the
/// result opens it in the app. Indexing runs off the main thread.
actor SpotlightIndex {
    static let shared = SpotlightIndex()
    /// The `CSSearchableItem` domain, which the app's items share.
    static let domain = "notebooks"
    /// Bigger files are left out: their size is mostly outputs, which
    /// aren't indexed, and reading them would hold up the rest.
    static let maxSize = 5 * 1024 * 1024

    private struct Manifest: Codable {
        var code = false
        /// Path to the modification date it was indexed at.
        var files: [String: Date] = [:]
    }

    private let index = CSSearchableIndex(name: "notebooks")
    private let manifestFile: URL?
    private var manifest: Manifest

    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        manifestFile = support?
            .appendingPathComponent(Bundle.main.bundleIdentifier ?? "Ganymede", isDirectory: true)
            .appendingPathComponent("spotlight.json")
        manifest = manifestFile
            .flatMap { try? Data(contentsOf: $0) }
            .flatMap { try? JSONDecoder().decode(Manifest.self, from: $0) } ?? Manifest()
    }

    /// The file a Spotlight result names, when the person opened one.
    nonisolated static func file(of activity: NSUserActivity) -> URL? {
        guard activity.activityType == CSSearchableItemActionType,
              let path = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String
        else { return nil }
        return URL(fileURLWithPath: path)
    }

    /// Makes the index hold exactly the notebooks in `urls` (those still
    /// there and small enough), indexing only what changed since.
    func sync(_ urls: [URL], code: Bool) async {
        var wanted: [String: Date] = [:]
        for url in urls {
            if let date = Self.indexable(url) { wanted[url.standardizedFileURL.path] = date }
        }
        let plan = SpotlightPlan.make(wanted: wanted, indexed: manifest.files, all: code != manifest.code)
        manifest.code = code
        await apply(plan, dates: wanted, code: code)
    }

    /// Indexes `url` again if it is in the index, as after a save.
    func refresh(_ url: URL, code: Bool) async {
        let path = url.standardizedFileURL.path
        guard manifest.files[path] != nil else { return }
        var wanted: [String: Date] = [:]
        if let date = Self.indexable(url) { wanted[path] = date }
        let plan = SpotlightPlan.make(wanted: wanted, indexed: [path: manifest.files[path]!], all: code != manifest.code)
        await apply(plan, dates: wanted, code: code)
    }

    /// Takes `url` out of the index, as when a result's file has gone.
    func remove(_ url: URL) async {
        let path = url.standardizedFileURL.path
        await apply(SpotlightPlan(index: [], remove: [path]), dates: [:], code: manifest.code)
    }

    /// Empties the index, as when Spotlight is turned off.
    func removeAll() async {
        do {
            try await index.deleteSearchableItems(withDomainIdentifiers: [Self.domain])
            manifest.files = [:]
            save()
        } catch {
            NSLog("Ganymede: Spotlight entries couldn't be removed: \(error.localizedDescription)")
        }
    }

    private func apply(_ plan: SpotlightPlan, dates: [String: Date], code: Bool) async {
        if !plan.remove.isEmpty {
            do {
                try await index.deleteSearchableItems(withIdentifiers: plan.remove)
                for path in plan.remove { manifest.files[path] = nil }
            } catch {
                NSLog("Ganymede: Spotlight entries couldn't be removed: \(error.localizedDescription)")
            }
        }
        var items: [CSSearchableItem] = []
        var indexed: [String: Date] = [:]
        for path in plan.index {
            guard let date = dates[path] else { continue }
            let url = URL(fileURLWithPath: path)
            guard let data = try? Data(contentsOf: url),
                  let text = try? NotebookIndexText(data: data, fileName: url.lastPathComponent, code: code)
            else {
                // Not a notebook (any more): nothing to find it by.
                if manifest.files[path] != nil {
                    try? await index.deleteSearchableItems(withIdentifiers: [path])
                    manifest.files[path] = nil
                }
                continue
            }
            items.append(Self.item(url, text: text, modified: date))
            indexed[path] = date
        }
        if !items.isEmpty {
            do {
                try await index.indexSearchableItems(items)
                manifest.files.merge(indexed) { $1 }
            } catch {
                NSLog("Ganymede: notebooks couldn't be added to Spotlight: \(error.localizedDescription)")
            }
        }
        save()
    }

    private func save() {
        guard let manifestFile, let data = try? JSONEncoder().encode(manifest) else { return }
        try? FileManager.default.createDirectory(
            at: manifestFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: manifestFile, options: .atomic)
    }

    /// The file's modification date, when it is a notebook to index.
    private static func indexable(_ url: URL) -> Date? {
        guard url.pathExtension.lowercased() == "ipynb",
              let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey, .isRegularFileKey]),
              values.isRegularFile == true,
              let size = values.fileSize, size <= maxSize
        else { return nil }
        return values.contentModificationDate ?? .distantPast
    }

    private static func item(_ url: URL, text: NotebookIndexText, modified: Date) -> CSSearchableItem {
        let attributes = CSSearchableItemAttributeSet(contentType: UTType("org.jupyter.ipynb") ?? .json)
        attributes.title = text.title
        attributes.displayName = text.title
        attributes.contentDescription = text.summary
            ?? (url.deletingLastPathComponent().path as NSString).abbreviatingWithTildeInPath
        attributes.textContent = text.text
        attributes.keywords = text.headings + [text.language].compactMap { $0 }
        attributes.contentURL = url
        attributes.path = url.path
        attributes.contentModificationDate = modified
        return CSSearchableItem(uniqueIdentifier: url.path, domainIdentifier: domain, attributeSet: attributes)
    }
}

/// The Spotlight settings and what to index from them (#305).
@MainActor
@Observable
final class SpotlightSettings {
    static let shared = SpotlightSettings()
    private let defaults = UserDefaults.standard

    var enabled: Bool {
        didSet {
            defaults.set(enabled, forKey: SpotlightKeys.enabled)
            if enabled {
                sync()
            } else {
                walking?.cancel()
                Task { await SpotlightIndex.shared.removeAll() }
            }
        }
    }
    var code: Bool {
        didSet {
            defaults.set(code, forKey: SpotlightKeys.code)
            sync()
        }
    }
    /// Folders whose notebooks are indexed too (the Mac's Settings).
    private(set) var folders: [URL]
    /// The notebooks opened lately, as the last caller of `sync(recents:)`
    /// gave them (the iPad's page keeps its own).
    @ObservationIgnored private var recents: [URL] = []
    @ObservationIgnored private var walking: Task<Void, Never>?
    @ObservationIgnored private var lastSync: ContinuousClock.Instant?

    private init() {
        enabled = defaults.object(forKey: SpotlightKeys.enabled) as? Bool ?? true
        code = defaults.bool(forKey: SpotlightKeys.code)
        folders = (defaults.stringArray(forKey: SpotlightKeys.folders) ?? [])
            .map { URL(fileURLWithPath: $0, isDirectory: true) }
    }

    func add(folder: URL) {
        guard !folders.contains(folder.standardizedFileURL) else { return }
        folders.append(folder.standardizedFileURL)
        saveFolders()
    }

    func remove(folder: URL) {
        folders.removeAll { $0 == folder }
        saveFolders()
    }

    private func saveFolders() {
        defaults.set(folders.map(\.path), forKey: SpotlightKeys.folders)
        sync()
    }

    /// Indexes `recents` and the folders' notebooks, and drops the rest.
    func sync(recents: [URL]) {
        self.recents = recents
        sync()
    }

    /// `sync()`, unless one ran in the last minute: for the app coming
    /// back to the front, which can happen often.
    func syncIfStale() {
        if let lastSync, ContinuousClock.now - lastSync < .seconds(60) { return }
        sync()
    }

    /// Indexes the last recents and the folders' notebooks again: files
    /// changed, moved or deleted since are updated in the index.
    func sync() {
        lastSync = ContinuousClock.now
        #if os(macOS)
        recents = Recents.shared.urls
        #endif
        let recents = recents
        let folders = folders
        let code = code
        guard enabled else { return }
        walking?.cancel()
        walking = Task.detached(priority: .utility) {
            var urls = recents.filter { $0.pathExtension.lowercased() == "ipynb" }
            #if os(macOS)
            for folder in folders {
                if Task.isCancelled { return }
                urls += NotebookFinder.notebooks(under: folder)
            }
            #endif
            if Task.isCancelled { return }
            await SpotlightIndex.shared.sync(urls, code: code)
        }
    }

    /// `url` was saved: its entry, if it has one, gets the new contents.
    func saved(_ url: URL) {
        guard enabled else { return }
        let code = code
        Task.detached(priority: .utility) { await SpotlightIndex.shared.refresh(url, code: code) }
    }

    /// Opens a Spotlight result's notebook through `open`; a file that has
    /// gone leaves the index instead. True when `activity` was one.
    func open(_ activity: NSUserActivity, with open: (URL) -> Void) -> Bool {
        guard let url = SpotlightIndex.file(of: activity) else { return false }
        if FileManager.default.fileExists(atPath: url.path) {
            open(url)
        } else {
            Task.detached { await SpotlightIndex.shared.remove(url) }
        }
        return true
    }
}

/// Settings › Spotlight: on or off, code or not, and on the Mac, folders.
struct SpotlightSettingsSection: View {
    @State private var settings = SpotlightSettings.shared

    var body: some View {
        Section {
            Toggle("Show notebooks in Spotlight", isOn: $settings.enabled)
            if settings.enabled {
                Toggle("Include code", isOn: $settings.code)
                #if os(macOS)
                ForEach(settings.folders, id: \.self) { folder in
                    LabeledContent {
                        Button("Remove") { settings.remove(folder: folder) }
                            .accessibilityLabel("Remove \(folder.lastPathComponent)")
                    } label: {
                        Text(folder.lastPathComponent)
                        Text((folder.path as NSString).abbreviatingWithTildeInPath)
                    }
                }
                LabeledContent("Folders") {
                    Button("Add Folder…", action: addFolder)
                }
                #endif
            }
        } header: {
            Text("Spotlight")
        } footer: {
            #if os(macOS)
            Text("Spotlight finds the notebooks opened lately, and those in the folders here, by their headings and text. Outputs are never indexed. The index stays on this Mac.")
            #else
            Text("Spotlight finds the notebooks opened lately by their headings and text. Outputs are never indexed. The index stays on this device.")
            #endif
        }
    }

    #if os(macOS)
    private func addFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.prompt = "Add"
        guard panel.runModal() == .OK else { return }
        for url in panel.urls { settings.add(folder: url) }
    }
    #endif
}
