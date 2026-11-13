import CoreText
import Foundation
import SwiftUI
import WebKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// The code font (#354): face, size, ligatures and style (#565) for
/// notebook cells and outputs, the file editor and the terminal; and the
/// font of rendered Markdown in notebooks (#565).
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
    /// `CodeFont.standardStyle` or one of the font's `styles`.
    var style: String = CodeFont.standardStyle
    /// The rendered Markdown's font: `system`, `serif` or `mono`
    /// (`MARKDOWN_FONTS` in `src/lib/code-font.ts`).
    var markdown: String = "system"
    /// What a setting saved before styles turned on; `normalized` turns it
    /// into the style with just those. Never saved.
    var legacyFeatures: [String]?

    init(
        font: String = CodeFont.system,
        size: Double? = nil,
        ligatures: Bool = true,
        style: String = CodeFont.standardStyle,
        markdown: String = "system"
    ) {
        self.font = font
        self.size = size
        self.ligatures = ligatures
        self.style = style
        self.markdown = markdown
    }

    private enum CodingKeys: String, CodingKey {
        case font, size, ligatures, style, markdown, features
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        font = try c.decodeIfPresent(String.self, forKey: .font) ?? CodeFont.system
        size = try c.decodeIfPresent(Double.self, forKey: .size)
        ligatures = try c.decodeIfPresent(Bool.self, forKey: .ligatures) ?? true
        markdown = try c.decodeIfPresent(String.self, forKey: .markdown) ?? "system"
        if let style = try c.decodeIfPresent(String.self, forKey: .style) {
            self.style = style
        } else {
            legacyFeatures = try c.decodeIfPresent([String].self, forKey: .features)
        }
    }

    /// The code font alone, without the Markdown font, which only pages use.
    var codeOnly: CodeFontSetting {
        var value = self
        value.markdown = "system"
        return value
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(font, forKey: .font)
        try c.encodeIfPresent(size, forKey: .size)
        try c.encode(ligatures, forKey: .ligatures)
        try c.encode(style, forKey: .style)
        try c.encode(markdown, forKey: .markdown)
    }
}

/// One bundled font, as `catalog.json` lists it.
struct CatalogFont: Decodable, Identifiable, Equatable {
    struct Feature: Decodable, Equatable, Identifiable {
        let tag: String
        let label: String
        var id: String { tag }
    }

    /// A named set of the font's features (#565).
    struct Style: Decodable, Equatable, Identifiable {
        let id: String
        let name: String
        let features: [String]
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
    /// Besides its standard look.
    let styles: [Style]
    /// Features holding its ligatures, which the Ligatures switch turns
    /// on (Monaspace's ss01-ss10); without them it turns `calt` off.
    let ligatureFeatures: [String]?

    func style(_ id: String) -> Style? {
        styles.first { $0.id == id }
    }
}

enum CodeFont {
    static let system = "system"
    static let standardStyle = "standard"
    /// `.codeFontChanged`'s user-info key: true when only the Markdown font changed.
    static let markdownOnlyKey = "markdownOnly"
    /// The Markdown fonts, as the page names them.
    static let markdownFonts: [MarkdownFont] = [
        MarkdownFont(id: "system", name: "System"),
        MarkdownFont(id: "serif", name: "Serif, as Published Notebooks"),
        MarkdownFont(id: "mono", name: "Monospace, the Code Font"),
    ]

    struct MarkdownFont: Identifiable {
        let id: String
        let name: String
    }
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
            let old = setting
            guard value != old else { return }
            if let data = try? JSONEncoder().encode(value) {
                UserDefaults.standard.set(data, forKey: defaultsKey)
            }
            cacheLock.lock()
            cache = [:]
            cacheLock.unlock()
            // Only the pages show Markdown: the editor and terminal skip a
            // change to it alone (`observeCodeFont`).
            NotificationCenter.default.post(
                name: .codeFontChanged, object: nil,
                userInfo: [markdownOnlyKey: old.codeOnly == value.codeOnly]
            )
        }
    }

    /// Drops an unknown font, style or Markdown font, and clamps the size.
    /// A setting saved before styles gets the style with just its features.
    static func normalized(_ value: CodeFontSetting, catalog: [CatalogFont] = catalog) -> CodeFontSetting {
        var value = value
        let font = catalog.first { $0.id == value.font }
        if font == nil { value.font = system }
        if let old = value.legacyFeatures {
            let wanted = Set(old)
            value.style = font?.styles.first { Set($0.features) == wanted }?.id ?? standardStyle
            value.legacyFeatures = nil
        }
        if font?.style(value.style) == nil { value.style = standardStyle }
        if !markdownFonts.contains(where: { $0.id == value.markdown }) { value.markdown = "system" }
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
        let features = featureSettings(setting, font: entry)
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

    /// OpenType features as Core Text takes them: the style's on, and the
    /// ligatures as `featureSettings` in `src/lib/code-font.ts` sets them.
    static func featureSettings(_ setting: CodeFontSetting, font: CatalogFont) -> [[PlatformFontDescriptor.FeatureKey: Any]] {
        var on = font.style(setting.style)?.features ?? []
        if setting.ligatures, let sets = font.ligatureFeatures { on += sets }
        var seen = Set<String>()
        var tags = on.filter { seen.insert($0).inserted }.map { ($0, 1) }
        if !setting.ligatures && font.ligatures && font.ligatureFeatures == nil {
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

/// The face, size, ligatures and style, with a preview, and the Markdown
/// font: the Mac's Settings › Appearance and the iPad and iPhone's
/// Settings screen.
struct CodeFontSettings: View {
    @State private var setting = CodeFont.setting

    static let sample = "fn(x) => x != 0 && @param <= 10 // 0O 1lI |> ->"

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
            if let entry, !entry.styles.isEmpty {
                Picker("Style", selection: $setting.style) {
                    Text("Standard").tag(CodeFont.standardStyle)
                    ForEach(entry.styles) { style in
                        Text(style.name).tag(style.id)
                    }
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
        Section {
            Picker("Font", selection: $setting.markdown) {
                ForEach(CodeFont.markdownFonts) { font in
                    Text(font.name).tag(font.id)
                }
            }
        } header: {
            Text("Markdown Font")
        } footer: {
            Text("Text cells in notebooks. Serif is the font of pages from ganymede nb publish.")
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

    /// A new face starts in its standard style.
    private var fontBinding: Binding<String> {
        Binding(
            get: { setting.font },
            set: { font in
                guard font != setting.font else { return }
                setting.font = font
                setting.style = CodeFont.standardStyle
            }
        )
    }

    private var sizeBinding: Binding<Double> {
        Binding(
            get: { setting.size ?? CodeFont.defaultSize },
            set: { setting.size = $0 }
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
