import CoreText
import Foundation
import SwiftUI
import WebKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// The code font (#354): face, size, ligatures and stylistic alternates
/// for notebook cells and outputs, the file editor and the terminal.
///
/// The fonts are the web build's (`public/fonts/`, `scripts/fonts.py`),
/// listed in its `fonts/catalog.json`, which the page reads too. The app
/// keeps the setting in `UserDefaults`, registers the font files with
/// Core Text for its own views, gives each page the setting before it
/// loads (`pageScript`) and sends it again when it changes
/// (`window.ganymedeSetCodeFont`, `src/lib/code-font.ts`).
struct CodeFontSetting: Codable, Equatable {
    /// `CodeFont.system` or a catalog font's id.
    var font: String = CodeFont.system
    /// Points; nil keeps each view's own size.
    var size: Double?
    var ligatures: Bool = true
    /// OpenType feature tags turned on: `ss01`, `cv02`, `zero`.
    var features: [String] = []
}

/// One bundled font, as `catalog.json` lists it.
struct CatalogFont: Decodable, Identifiable, Equatable {
    struct Feature: Decodable, Equatable, Identifiable {
        let tag: String
        let label: String
        var id: String { tag }
    }

    struct File: Decodable, Equatable {
        let file: String
        let style: String
        let weight: String
    }

    let id: String
    let name: String
    let family: String
    let source: String
    let files: [File]
    let ligatures: Bool
    let features: [Feature]
}

enum CodeFont {
    static let system = "system"
    static let defaultsKey = "codeFont"
    static let minSize = 8.0
    static let maxSize = 32.0

    /// The size of the editor and terminal when the setting has none.
    static var defaultSize: Double {
        #if os(macOS)
        13
        #else
        14
        #endif
    }

    /// The web build's fonts folder in the app bundle.
    static var folder: URL? {
        Bundle.main.url(forResource: "web", withExtension: nil)?.appendingPathComponent("fonts")
    }

    /// The bundled fonts; empty when the bundle has none.
    static let catalog: [CatalogFont] = {
        guard let url = folder?.appendingPathComponent("catalog.json"),
              let data = try? Data(contentsOf: url)
        else { return [] }
        return load(data)
    }()

    static func load(_ data: Data) -> [CatalogFont] {
        struct Catalog: Decodable { let fonts: [CatalogFont] }
        return (try? JSONDecoder().decode(Catalog.self, from: data))?.fonts ?? []
    }

    static func entry(_ id: String) -> CatalogFont? {
        catalog.first { $0.id == id }
    }

    // MARK: The setting

    static var setting: CodeFontSetting {
        get {
            guard let data = UserDefaults.standard.data(forKey: defaultsKey),
                  let value = try? JSONDecoder().decode(CodeFontSetting.self, from: data)
            else { return CodeFontSetting() }
            return normalized(value)
        }
        set {
            let value = normalized(newValue)
            guard value != setting else { return }
            if let data = try? JSONEncoder().encode(value) {
                UserDefaults.standard.set(data, forKey: defaultsKey)
            }
            cacheLock.lock()
            cache = [:]
            cacheLock.unlock()
            NotificationCenter.default.post(name: .codeFontChanged, object: nil)
        }
    }

    /// Drops an unknown font, features the font lacks, and clamps the size.
    static func normalized(_ value: CodeFontSetting, catalog: [CatalogFont] = catalog) -> CodeFontSetting {
        var value = value
        let font = catalog.first { $0.id == value.font }
        if font == nil { value.font = system }
        let known = Set(font?.features.map(\.tag) ?? [])
        var seen = Set<String>()
        value.features = value.features.filter { known.contains($0) && seen.insert($0).inserted }
        value.size = value.size.map { min(maxSize, max(minSize, $0)) }
        return value
    }

    /// ⌘+ and ⌘−: one point at a time, from the default when unset.
    static func adjustSize(by delta: Double) {
        var value = setting
        value.size = min(maxSize, max(minSize, (value.size ?? defaultSize) + delta))
        setting = value
    }

    /// ⌘0: each view's own size again.
    static func resetSize() {
        var value = setting
        value.size = nil
        setting = value
    }

    // MARK: Fonts for the app's own views

    private static var registered = false

    /// Registers the bundled files for this process, once: before the
    /// editor or terminal asks for a face.
    static func registerBundledFonts() {
        guard !registered, let folder else { return }
        registered = true
        let urls = catalog.flatMap { font in font.files.map { folder.appendingPathComponent($0.file) } }
        guard !urls.isEmpty else { return }
        CTFontManagerRegisterFontURLs(urls as CFArray, .process, false, nil)
    }

    /// The current setting's fonts by default size: the line-number gutter
    /// asks for the editor's font once per line it draws. Cleared when the
    /// setting changes.
    private static var cache: [Double: PlatformFont] = [:]
    private static let cacheLock = NSLock()

    /// The font for the editor and terminal at the current setting, at its
    /// size or `size` when it has none.
    static func font(defaultSize size: Double = defaultSize) -> PlatformFont {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        if let font = cache[size] { return font }
        let font = font(defaultSize: size, setting: setting)
        cache[size] = font
        return font
    }

    /// The font for `setting`, at its size or `size` when it has none.
    static func font(defaultSize size: Double = defaultSize, setting: CodeFontSetting) -> PlatformFont {
        let points = CGFloat(setting.size ?? size)
        let fallback = PlatformFont.monospacedSystemFont(ofSize: points, weight: .regular)
        guard let entry = entry(setting.font) else { return fallback }
        registerBundledFonts()
        let features = featureSettings(setting, ligatures: entry.ligatures)
        var attributes: [PlatformFontDescriptor.AttributeName: Any] = [
            .family: entry.family,
            // Regular: the variable fonts' default instance is Light or
            // ExtraLight (Fira Code, Monaspace).
            .traits: [PlatformFontDescriptor.TraitKey.weight: PlatformFont.Weight.regular.rawValue],
            PlatformFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [wghtAxis: 400],
        ]
        if !features.isEmpty { attributes[.featureSettings] = features }
        let descriptor = PlatformFontDescriptor(fontAttributes: attributes)
        #if os(macOS)
        guard let font = NSFont(descriptor: descriptor, size: points) else { return fallback }
        #else
        let font = UIFont(descriptor: descriptor, size: points)
        #endif
        // Core Text answers a family it doesn't have with a default face.
        return font.familyName == entry.family ? font : fallback
    }

    /// The `wght` axis's tag, as Core Text's variation dictionary keys it.
    private static let wghtAxis = 0x7767_6874

    /// OpenType features as Core Text takes them: the alternates on, and
    /// ligatures off if asked.
    static func featureSettings(_ setting: CodeFontSetting, ligatures: Bool) -> [[PlatformFontDescriptor.FeatureKey: Any]] {
        var tags = setting.features.map { ($0, 1) }
        if !setting.ligatures && ligatures {
            tags += [("calt", 0), ("liga", 0), ("dlig", 0)]
        }
        return tags.map { tag, value in
            [
                PlatformFontDescriptor.FeatureKey(rawValue: kCTFontOpenTypeFeatureTag as String): tag,
                PlatformFontDescriptor.FeatureKey(rawValue: kCTFontOpenTypeFeatureValue as String): value,
            ]
        }
    }

    // MARK: The pages

    /// The setting as the page reads it (`parseCodeFont`).
    static func json(_ setting: CodeFontSetting = setting) -> String {
        guard let data = try? JSONEncoder().encode(setting), let text = String(data: data, encoding: .utf8) else {
            return "null"
        }
        return text
    }

    /// For a web view, before its page loads.
    static var pageScript: WKUserScript {
        WKUserScript(
            source: "window.ganymedeCodeFont = \(json());",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }

    /// Sends a change to a page already loaded.
    static var updateScript: String {
        let value = json()
        return "window.ganymedeCodeFont = \(value); window.ganymedeSetCodeFont?.(\(value));"
    }
}

#if os(macOS)
typealias PlatformFont = NSFont
typealias PlatformFontDescriptor = NSFontDescriptor
typealias PlatformColor = NSColor
#else
typealias PlatformFont = UIFont
typealias PlatformFontDescriptor = UIFontDescriptor
typealias PlatformColor = UIColor
#endif

extension Notification.Name {
    /// The code font setting changed (`CodeFont.setting`).
    static let codeFontChanged = Notification.Name("GanymedeCodeFontChanged")
}

/// The face, size, ligatures and alternates, with a preview: the Mac's
/// Settings › Appearance and the iPad and iPhone's Settings screen.
struct CodeFontSettings: View {
    @State private var setting = CodeFont.setting

    static let sample = "fn(x) => x != 0 && x <= 10 // 0O 1lI |> www ->"

    private var entry: CatalogFont? { CodeFont.entry(setting.font) }

    var body: some View {
        Section {
            Picker("Font", selection: fontBinding) {
                Text("System Monospace").tag(CodeFont.system)
                ForEach(CodeFont.catalog) { font in
                    Text(font.name).tag(font.id)
                }
            }
            Stepper(value: sizeBinding, in: CodeFont.minSize...CodeFont.maxSize, step: 1) {
                LabeledContent("Size") {
                    Text(setting.size.map { "\(Self.points($0)) pt" } ?? "Default")
                }
            }
            if entry?.ligatures == true {
                Toggle("Ligatures", isOn: $setting.ligatures)
            }
            Text(Self.sample)
                .font(Font(CodeFont.font(setting: setting) as CTFont))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .textSelection(.enabled)
        } header: {
            Text("Code Font")
        } footer: {
            Text(footer)
        }
        .onChange(of: setting) { _, value in
            CodeFont.setting = value
        }
        .onReceive(NotificationCenter.default.publisher(for: .codeFontChanged)) { _ in
            // ⌘+ and ⌘− while Settings shows.
            let current = CodeFont.setting
            if current != setting { setting = current }
        }
        if let entry, !entry.features.isEmpty {
            Section {
                ForEach(entry.features) { feature in
                    Toggle(isOn: featureBinding(feature.tag)) {
                        HStack {
                            Text(feature.tag).font(.system(.body, design: .monospaced)).foregroundStyle(.secondary)
                            Text(feature.label)
                        }
                    }
                }
            } header: {
                Text("Alternates")
            } footer: {
                Text("The font’s stylistic sets and character variants.")
            }
        }
    }

    private var footer: String {
        var text = "Notebook cells and outputs, the file editor and the terminal. "
        #if os(macOS)
        text += "View › Bigger (⌘+) and Smaller (⌘−) change the size. "
        #endif
        if let entry {
            text += "\(entry.source), under the SIL Open Font License."
        }
        return text
    }

    private static func points(_ size: Double) -> String {
        size == size.rounded() ? String(Int(size)) : String(format: "%.1f", size)
    }

    /// A new face starts without the last one's alternates.
    private var fontBinding: Binding<String> {
        Binding(
            get: { setting.font },
            set: { font in
                guard font != setting.font else { return }
                setting.font = font
                setting.features = []
            }
        )
    }

    private var sizeBinding: Binding<Double> {
        Binding(
            get: { setting.size ?? CodeFont.defaultSize },
            set: { setting.size = $0 }
        )
    }

    private func featureBinding(_ tag: String) -> Binding<Bool> {
        Binding(
            get: { setting.features.contains(tag) },
            set: { on in
                setting.features.removeAll { $0 == tag }
                if on { setting.features.append(tag) }
            }
        )
    }
}

/// View › Bigger, Smaller and Actual Size for the code font (⌘+, ⌘−, ⌘0):
/// the Mac's View menu and the iPad's.
struct CodeFontSizeCommands: View {
    var body: some View {
        Button("Bigger Code Font") { CodeFont.adjustSize(by: 1) }
            .keyboardShortcut("+")
        Button("Smaller Code Font") { CodeFont.adjustSize(by: -1) }
            .keyboardShortcut("-")
        Button("Actual Code Font Size") { CodeFont.resetSize() }
            .keyboardShortcut("0")
    }
}
