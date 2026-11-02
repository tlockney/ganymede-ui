import Foundation
import Neon
import SwiftTreeSitter
import TreeSitterBash
import TreeSitterJavaScript
import TreeSitterJSON
import TreeSitterMarkdown
import TreeSitterMarkdownInline
import TreeSitterPython
import TreeSitterTOML
import TreeSitterTSX
import TreeSitterTypeScript
import TreeSitterYAML
#if os(macOS)
import AppKit
typealias PlatformColor = NSColor
typealias PlatformFont = NSFont
#else
import UIKit
typealias PlatformColor = UIColor
typealias PlatformFont = UIFont
#endif

/// Syntax highlighting with Neon and tree-sitter (#122): each language's
/// parser and highlight query, and the colors for the names the queries
/// give. The colors are the system's, so they follow light and dark.
enum Highlighting {
    /// The language's parser and queries; nil when they can't be loaded,
    /// and the file is shown without highlighting.
    static func configuration(for language: TextLanguage) -> LanguageConfiguration? {
        let js = "TreeSitterJavaScript_TreeSitterJavaScript"
        switch language {
        case .bash:
            return configuration(tree_sitter_bash(), name: "Bash", highlights: [("TreeSitterBash_TreeSitterBash", "highlights")])
        case .javascript:
            return configuration(
                tree_sitter_javascript(), name: "JavaScript", highlights: [(js, "highlights-jsx"), (js, "highlights")])
        case .json:
            return configuration(tree_sitter_json(), name: "JSON", highlights: [("TreeSitterJSON_TreeSitterJSON", "highlights")])
        case .markdown:
            let bundle = "TreeSitterMarkdown_TreeSitterMarkdown"
            return configuration(
                tree_sitter_markdown(), name: "Markdown", highlights: [(bundle, "highlights")],
                injections: (bundle, "injections"))
        case .python:
            return configuration(
                tree_sitter_python(), name: "Python", highlights: [("TreeSitterPython_TreeSitterPython", "highlights")])
        case .toml:
            return configuration(tree_sitter_toml(), name: "TOML", highlights: [("TreeSitterTOML_TreeSitterTOML", "highlights")])
        // TypeScript's queries add to JavaScript's, as its tree-sitter.json says.
        case .typescript:
            return configuration(
                tree_sitter_typescript(), name: "TypeScript",
                highlights: [("TreeSitterTypeScript_TreeSitterTypeScript", "highlights"), (js, "highlights")])
        case .tsx:
            return configuration(
                tree_sitter_tsx(), name: "TSX",
                highlights: [("TreeSitterTypeScript_TreeSitterTSX", "highlights"), (js, "highlights-jsx"), (js, "highlights")])
        case .yaml:
            return configuration(tree_sitter_yaml(), name: "YAML", highlights: [("TreeSitterYAML_TreeSitterYAML", "highlights")])
        }
    }

    /// Markdown's inline syntax, which Markdown's injections ask for.
    static func injected(_ name: String) -> LanguageConfiguration? {
        guard name == "markdown_inline" else { return nil }
        return configuration(
            tree_sitter_markdown_inline(), name: "MarkdownInline",
            highlights: [("TreeSitterMarkdown_TreeSitterMarkdownInline", "highlights")])
    }

    /// Builds a configuration from query files in the grammars' resource
    /// bundles. Only highlights (and injections) are compiled: a grammar's
    /// other queries aren't needed here.
    private static func configuration(
        _ parser: OpaquePointer?,
        name: String,
        highlights: [(bundle: String, file: String)],
        injections: (bundle: String, file: String)? = nil
    ) -> LanguageConfiguration? {
        guard let parser else { return nil }
        let language = Language(parser)
        var source = Data()
        for part in highlights {
            guard let data = query(part.bundle, part.file) else { return nil }
            source.append(data)
            source.append(0x0A)
        }
        do {
            var queries: [Query.Definition: Query] = [.highlights: try Query(language: language, data: source)]
            if let injections, let data = query(injections.bundle, injections.file) {
                queries[.injections] = try Query(language: language, data: data)
            }
            return LanguageConfiguration(language, name: name, queries: queries)
        } catch {
            return nil
        }
    }

    /// A query file from a grammar's bundle, wherever the build put it.
    private static func query(_ bundle: String, _ file: String) -> Data? {
        guard let url = Bundle.main.url(forResource: bundle, withExtension: "bundle") else { return nil }
        for folder in ["queries", "Contents/Resources/queries"] {
            let path = url.appendingPathComponent(folder).appendingPathComponent(file + ".scm")
            if let data = try? Data(contentsOf: path) { return data }
        }
        return nil
    }

    static var font: PlatformFont {
        #if os(macOS)
        .monospacedSystemFont(ofSize: 13, weight: .regular)
        #else
        .monospacedSystemFont(ofSize: 14, weight: .regular)
        #endif
    }

    static var textColor: PlatformColor {
        #if os(macOS)
        .textColor
        #else
        .label
        #endif
    }

    static func attributes(for token: Token) -> [NSAttributedString.Key: Any] {
        color(for: token.name).map { [.foregroundColor: $0] } ?? [:]
    }

    /// The color for a capture name, by its first part (`keyword.return`
    /// is a keyword). Nil leaves the text's own color.
    static func color(for name: String) -> PlatformColor? {
        let kind = name.split(separator: ".").first.map(String.init) ?? name
        switch kind {
        case "keyword", "conditional", "repeat", "include", "exception", "storageclass":
            return .systemPink
        case "string", "character":
            return name.hasPrefix("string.special") ? PlatformColor.systemOrange : PlatformColor.systemRed
        case "number", "float", "boolean", "constant":
            return .systemPurple
        case "comment":
            #if os(macOS)
            return .secondaryLabelColor
            #else
            return .secondaryLabel
            #endif
        case "function", "method":
            return .systemBlue
        case "type", "constructor", "class":
            return .systemTeal
        case "attribute", "tag", "label", "namespace", "module", "escape", "embedded":
            return .systemOrange
        // Markdown: headings, code, links.
        case "text", "markup":
            if name.contains("title") || name.contains("heading") { return .systemBlue }
            if name.contains("literal") || name.contains("raw") { return .systemRed }
            if name.contains("uri") || name.contains("link") || name.contains("reference") { return .systemTeal }
            return nil
        default:
            return nil
        }
    }
}
