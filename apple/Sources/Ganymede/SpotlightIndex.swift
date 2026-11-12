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

    /// Items indexed per call, so a big folder's first sync doesn't hold
    /// every notebook's text at once.
    static let batch = 50
    /// Everything is indexed again this often, in case Spotlight dropped
    /// entries itself (an index reset), which the app isn't told of.
    static let fullInterval: TimeInterval = 7 * 24 * 60 * 60

    private struct Manifest: Codable {
        var code = false
        /// Path to the modification date it was indexed at.
        var files: [String: Date] = [:]
        /// When everything was last indexed again.
        var fullAt: Date?
    }

    private let index = CSSearchableIndex(name: "notebooks")
    private let manifestFile: URL?
    private var manifest: Manifest
    /// Off: nothing is indexed, whatever sync was already on its way.
    private var enabled = UserDefaults.standard.object(forKey: SpotlightKeys.enabled) as? Bool ?? true
    /// Bumped when Spotlight is turned off or on: an `apply` that was
    /// suspended across the change (actor reentrancy) stops, and takes
    /// back what it had just indexed.
    private var generation = 0

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
    /// there and small enough), indexing only what changed since, or all
    /// of them when the code setting changed or a week has passed.
    func sync(_ urls: [URL], code: Bool) async {
        guard enabled else { return }
        var wanted: [String: Date] = [:]
        for url in urls {
            if let date = Self.indexable(url) { wanted[url.standardizedFileURL.path] = date }
        }
        let stale = manifest.fullAt.map { Date().timeIntervalSince($0) > Self.fullInterval } ?? true
        let all = stale || code != manifest.code
        let plan = SpotlightPlan.make(wanted: wanted, indexed: manifest.files, all: all)
        // The setting is recorded only once its entries are redone, so a
        // failure is tried again next time.
        if await apply(plan, dates: wanted, code: code), all {
            manifest.code = code
            manifest.fullAt = Date()
            save()
        }
    }

    /// Indexes `url`, leaving the other entries as they are: a notebook
    /// just opened, which is now a recent.
    func add(_ url: URL, code: Bool) async {
        await update(url, code: code, onlyIfIndexed: false)
    }

    /// Indexes `url` again if it is in the index, as after a save.
    func refresh(_ url: URL, code: Bool) async {
        await update(url, code: code, onlyIfIndexed: true)
    }

    private func update(_ url: URL, code: Bool, onlyIfIndexed: Bool) async {
        let path = url.standardizedFileURL.path
        guard enabled, !onlyIfIndexed || manifest.files[path] != nil,
              let date = Self.indexable(url)
        else { return }
        let indexed = manifest.files[path].map { [path: $0] } ?? [:]
        let plan = SpotlightPlan.make(wanted: [path: date], indexed: indexed, all: code != manifest.code)
        await apply(plan, dates: [path: date], code: code)
    }

    /// Takes `url` out of the index, as when a result's file has gone.
    func remove(_ url: URL) async {
        let path = url.standardizedFileURL.path
        await apply(SpotlightPlan(index: [], remove: [path]), dates: [:], code: manifest.code)
    }

    /// Turns indexing on or off; off empties the index.
    func setEnabled(_ on: Bool) async {
        enabled = on
        generation += 1
        if !on { await removeAll() }
    }

    /// Empties the index.
    private func removeAll() async {
        do {
            try await index.deleteSearchableItems(withDomainIdentifiers: [Self.domain])
            manifest.files = [:]
            save()
        } catch {
            NSLog("Ganymede: Spotlight entries couldn't be removed: \(error.localizedDescription)")
        }
    }

    /// Removes and indexes what `plan` says; true when all of it was
    /// done. Stops if Spotlight was turned off or on meanwhile.
    @discardableResult
    private func apply(_ plan: SpotlightPlan, dates: [String: Date], code: Bool) async -> Bool {
        let started = generation
        var done = true
        defer { save() }
        if !plan.remove.isEmpty {
            do {
                try await index.deleteSearchableItems(withIdentifiers: plan.remove)
                guard generation == started else { return false }
                for path in plan.remove { manifest.files[path] = nil }
            } catch {
                NSLog("Ganymede: Spotlight entries couldn't be removed: \(error.localizedDescription)")
                done = false
            }
        }
        var start = 0
        while start < plan.index.count {
            let paths = plan.index[start..<min(start + Self.batch, plan.index.count)]
            start += Self.batch
            var items: [CSSearchableItem] = []
            var indexed: [String: Date] = [:]
            var unreadable: [String] = []
            for path in paths {
                guard let date = dates[path] else { continue }
                let url = URL(fileURLWithPath: path)
                guard let data = try? Data(contentsOf: url),
                      let text = try? NotebookIndexText(data: data, fileName: url.lastPathComponent, code: code)
                else {
                    // Not a notebook (any more): nothing to find it by.
                    if manifest.files[path] != nil { unreadable.append(path) }
                    continue
                }
                items.append(Self.item(url, text: text, modified: date))
                indexed[path] = date
            }
            if !unreadable.isEmpty {
                try? await index.deleteSearchableItems(withIdentifiers: unreadable)
                guard generation == started else { return false }
                for path in unreadable { manifest.files[path] = nil }
            }
            guard !items.isEmpty else { continue }
            do {
                try await index.indexSearchableItems(items)
                guard generation == started else {
                    // Turned off meanwhile: take these back out.
                    try? await index.deleteSearchableItems(withIdentifiers: Array(indexed.keys))
                    return false
                }
                manifest.files.merge(indexed) { $1 }
            } catch {
                NSLog("Ganymede: notebooks couldn't be added to Spotlight: \(error.localizedDescription)")
                done = false
            }
        }
        return done
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
        // Spotlight drops items after about a month by default; these stay
        // until the app removes them.
        let item = CSSearchableItem(uniqueIdentifier: url.path, domainIdentifier: domain, attributeSet: attributes)
        item.expirationDate = .distantFuture
        return item
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
            let on = enabled
            if !on { walking?.cancel() }
            Task {
                await SpotlightIndex.shared.setEnabled(on)
                if on { sync() }
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

    /// `url` was just opened, so it is a recent: indexed now, without a
    /// walk of the folders (the next `sync()` drops recents that fell off).
    func opened(_ url: URL) {
        guard enabled else { return }
        let code = code
        Task.detached(priority: .utility) { await SpotlightIndex.shared.add(url, code: code) }
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
