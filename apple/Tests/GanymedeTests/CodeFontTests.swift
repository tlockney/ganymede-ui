import CoreText
import XCTest

/// The code font (#354): the web build's catalog and fonts, as the app
/// reads them for its editor and terminal.
final class CodeFontTests: XCTestCase {
    /// `public/fonts/` in the checkout: the test bundle has no web build.
    private static let fonts = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .appendingPathComponent("../../../public/fonts")
        .standardizedFileURL

    private func catalog() throws -> [CatalogFont] {
        let data = try Data(contentsOf: Self.fonts.appendingPathComponent("catalog.json"))
        let fonts = CodeFont.load(data)
        XCTAssertFalse(fonts.isEmpty)
        return fonts
    }

    /// Core Text reads each WOFF2 file, under the family the catalog names:
    /// the editor and terminal ask for the face by that name.
    func testCoreTextReadsEveryBundledFont() throws {
        for font in try catalog() {
            for file in font.files {
                let data = try Data(contentsOf: Self.fonts.appendingPathComponent(file.file))
                let descriptors = CTFontManagerCreateFontDescriptorsFromData(data as CFData) as? [CTFontDescriptor] ?? []
                let descriptor = try XCTUnwrap(descriptors.first, "\(file.file) didn't load")
                let ctFont = CTFontCreateWithFontDescriptor(descriptor, 13, nil)
                XCTAssertEqual(CTFontCopyFamilyName(ctFont) as String, font.family, file.file)
            }
        }
    }

    func testNormalizedDropsWhatTheFontLacks() throws {
        let fonts = try catalog()
        let fira = CodeFontSetting(font: "fira-code", size: 99, ligatures: false, style: "dotted-zero", markdown: "serif")
        XCTAssertEqual(CodeFont.normalized(fira, catalog: fonts), CodeFontSetting(
            font: "fira-code", size: 32, ligatures: false, style: "dotted-zero", markdown: "serif"
        ))
        let wrongStyle = CodeFontSetting(font: "fira-code", style: "classic", markdown: "comic")
        XCTAssertEqual(CodeFont.normalized(wrongStyle, catalog: fonts), CodeFontSetting(font: "fira-code"))
        let unknown = CodeFontSetting(font: "comic-sans", style: "slashed-zero")
        XCTAssertEqual(CodeFont.normalized(unknown, catalog: fonts), CodeFontSetting())
    }

    /// A setting saved before styles (#565) gets the style with its features.
    func testOldFeaturesBecomeAStyle() throws {
        let fonts = try catalog()
        let decode = { (json: String) throws -> CodeFontSetting in
            CodeFont.normalized(try JSONDecoder().decode(CodeFontSetting.self, from: Data(json.utf8)), catalog: fonts)
        }
        XCTAssertEqual(try decode(#"{"font":"jetbrains-mono","ligatures":true,"features":["zero"]}"#).style, "slashed-zero")
        XCTAssertEqual(try decode(#"{"font":"fira-code","ligatures":true,"features":["ss02"]}"#).style, "standard")
    }

    private func tags(_ setting: CodeFontSetting, _ font: CatalogFont) -> [String?] {
        CodeFont.featureSettings(setting, font: font).map {
            $0[PlatformFontDescriptor.FeatureKey(rawValue: kCTFontOpenTypeFeatureTag as String)] as? String
        }
    }

    func testFeatureSettings() throws {
        let fonts = try catalog()
        let fira = try XCTUnwrap(fonts.first { $0.id == "fira-code" })
        let setting = CodeFontSetting(font: "fira-code", ligatures: false, style: "alternate-letters")
        XCTAssertEqual(tags(setting, fira), ["cv01", "ss01", "ss03", "ss05", "calt", "liga", "dlig"])
        XCTAssertEqual(tags(CodeFontSetting(font: "fira-code"), fira), [])
        // Monaspace's ligatures are stylistic sets; `calt` is its texture healing.
        let neon = try XCTUnwrap(fonts.first { $0.id == "monaspace-neon" })
        XCTAssertEqual(tags(CodeFontSetting(font: "monaspace-neon"), neon).count, 10)
        XCTAssertEqual(tags(CodeFontSetting(font: "monaspace-neon", ligatures: false), neon), [])
    }

    /// The page reads the same JSON shape (`parseCodeFont`).
    func testPageJSONRoundTrips() throws {
        let setting = CodeFontSetting(font: "iosevka", size: 15, ligatures: true, style: "menlo", markdown: "serif")
        let data = try XCTUnwrap(CodeFont.json(setting).data(using: .utf8))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["font"] as? String, "iosevka")
        XCTAssertEqual(object["size"] as? Double, 15)
        XCTAssertEqual(object["style"] as? String, "menlo")
        XCTAssertEqual(object["markdown"] as? String, "serif")
        XCTAssertEqual(try JSONDecoder().decode(CodeFontSetting.self, from: data), setting)
    }
}
