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
        let fira = CodeFontSetting(font: "fira-code", size: 99, ligatures: false, features: ["ss01", "ss01", "xx01"])
        XCTAssertEqual(
            CodeFont.normalized(fira, catalog: fonts),
            CodeFontSetting(font: "fira-code", size: 32, ligatures: false, features: ["ss01"])
        )
        let unknown = CodeFontSetting(font: "comic-sans", size: nil, ligatures: true, features: ["ss01"])
        XCTAssertEqual(CodeFont.normalized(unknown, catalog: fonts), CodeFontSetting())
    }

    func testFeatureSettingsTurnOffLigatures() {
        let setting = CodeFontSetting(font: "fira-code", size: nil, ligatures: false, features: ["ss01"])
        let tags = CodeFont.featureSettings(setting, ligatures: true).map {
            $0[PlatformFontDescriptor.FeatureKey(rawValue: kCTFontFeatureOpenTypeTagKey as String)] as? String
        }
        XCTAssertEqual(tags, ["ss01", "calt", "liga", "dlig"])
        XCTAssertEqual(CodeFont.featureSettings(CodeFontSetting(), ligatures: false).count, 0)
    }

    /// The page reads the same JSON shape (`parseCodeFont`).
    func testPageJSONRoundTrips() throws {
        let setting = CodeFontSetting(font: "iosevka", size: 15, ligatures: true, features: ["ss04"])
        let data = try XCTUnwrap(CodeFont.json(setting).data(using: .utf8))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["font"] as? String, "iosevka")
        XCTAssertEqual(object["size"] as? Double, 15)
        XCTAssertEqual(object["features"] as? [String], ["ss04"])
    }
}
