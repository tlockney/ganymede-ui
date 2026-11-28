import XCTest

/// Contrast and tint verification for the Mac sidebar's shared palette and
/// `SidebarCaption` (#896, #878).
final class SidebarStyleTests: XCTestCase {
    private static let minimumAAContrast = 4.5
    private static let minimumAAAContrast = 7.0

    func testLightCaptionMeetsWCAGAAOverLightSidebarBackdrops() {
        let backdrops: [(String, SidebarRGB)] = [
            ("white", SidebarRGB(red: 1, green: 1, blue: 1)),
            ("WindowBackground light (#FBF9F5)", SidebarRGB(red: 0.984314, green: 0.976471, blue: 0.960784)),
            ("system light glass (#ECECEE)", SidebarRGB(red: 0.925490, green: 0.925490, blue: 0.933333)),
            ("mid-grey (#808080)", SidebarRGB(red: 0.501961, green: 0.501961, blue: 0.501961)),
            ("dark desktop (#1E1E1E)", SidebarRGB(red: 0.117647, green: 0.117647, blue: 0.117647)),
        ]
        for (name, backdrop) in backdrops {
            let background = SidebarPalette.lightTint.composited(over: backdrop)
            let ratio = SidebarPalette.lightCaption.contrastRatio(against: background)
            XCTAssertGreaterThanOrEqual(
                ratio, Self.minimumAAContrast,
                "Light caption over \(name) measured \(ratio):1")
        }
    }

    func testDarkCaptionMeetsWCAGAAOverDarkSidebarBackdrops() {
        let backdrops: [(String, SidebarRGB)] = [
            ("WindowBackground dark (#181C2F)", SidebarRGB(red: 0.094118, green: 0.109804, blue: 0.184314)),
            ("system dark glass (#28282A)", SidebarRGB(red: 0.156863, green: 0.156863, blue: 0.164706)),
            ("black (#000000)", SidebarRGB(red: 0, green: 0, blue: 0)),
        ]
        for (name, backdrop) in backdrops {
            let background = SidebarPalette.darkTint.composited(over: backdrop)
            let ratio = SidebarPalette.darkCaption.contrastRatio(against: background)
            XCTAssertGreaterThanOrEqual(
                ratio, Self.minimumAAContrast,
                "Dark caption over \(name) measured \(ratio):1")
        }
    }

    func testCaptionsStayAboveWCAGAAInInspector() {
        let lightInspector = SidebarRGB(red: 1, green: 1, blue: 1)
        let darkInspector = SidebarRGB(red: 0.117647, green: 0.117647, blue: 0.117647)

        XCTAssertGreaterThanOrEqual(
            SidebarPalette.lightCaption.contrastRatio(against: lightInspector),
            Self.minimumAAContrast)
        XCTAssertGreaterThanOrEqual(
            SidebarPalette.darkCaption.contrastRatio(against: darkInspector),
            Self.minimumAAContrast)
    }

    func testBrandAndPrimaryInkClearAAAOverDefaultSidebarSurfaces() {
        let lightSurface = SidebarPalette.lightTint.composited(
            over: SidebarRGB(red: 0.925490, green: 0.925490, blue: 0.933333))
        let darkSurface = SidebarPalette.darkTint.composited(
            over: SidebarRGB(red: 0.094118, green: 0.109804, blue: 0.184314))

        XCTAssertGreaterThanOrEqual(
            SidebarPalette.lightInk.contrastRatio(against: lightSurface),
            Self.minimumAAAContrast)
        XCTAssertGreaterThanOrEqual(
            SidebarPalette.darkBrand.contrastRatio(against: darkSurface),
            Self.minimumAAAContrast)
    }

    func testSidebarTintsKeepGlassTranslucency() {
        XCTAssertGreaterThan(SidebarPalette.lightTint.alpha, 0)
        XCTAssertLessThan(SidebarPalette.lightTint.alpha, 1)
        XCTAssertGreaterThan(SidebarPalette.darkTint.alpha, 0)
        XCTAssertLessThan(SidebarPalette.darkTint.alpha, 1)
    }

    func testContrastMathEndpoints() {
        let black = SidebarRGB(red: 0, green: 0, blue: 0)
        let white = SidebarRGB(red: 1, green: 1, blue: 1)
        XCTAssertEqual(black.contrastRatio(against: white), 21.0, accuracy: 0.001)
        XCTAssertEqual(white.contrastRatio(against: white), 1.0, accuracy: 0.001)
    }

    #if os(macOS)
    @MainActor
    func testSidebarGlassTintAppliesLightAndDarkTintToEnclosingGlassView() throws {
        let glass = NSGlassEffectView(frame: NSRect(x: 0, y: 0, width: 240, height: 400))
        let content = NSView(frame: glass.bounds)
        let host = SidebarGlassTint.TintHostView()
        glass.contentView = content
        glass.appearance = NSAppearance(named: .aqua)
        content.addSubview(host)

        let light = try XCTUnwrap(glass.tintColor?.usingColorSpace(.sRGB))
        XCTAssertEqual(light.redComponent, SidebarPalette.lightTint.red, accuracy: 0.001)
        XCTAssertEqual(light.greenComponent, SidebarPalette.lightTint.green, accuracy: 0.001)
        XCTAssertEqual(light.blueComponent, SidebarPalette.lightTint.blue, accuracy: 0.001)
        XCTAssertEqual(light.alphaComponent, SidebarPalette.lightTint.alpha, accuracy: 0.001)

        glass.appearance = NSAppearance(named: .darkAqua)
        host.viewDidChangeEffectiveAppearance()
        let dark = try XCTUnwrap(glass.tintColor?.usingColorSpace(.sRGB))
        XCTAssertEqual(dark.redComponent, SidebarPalette.darkTint.red, accuracy: 0.001)
        XCTAssertEqual(dark.greenComponent, SidebarPalette.darkTint.green, accuracy: 0.001)
        XCTAssertEqual(dark.blueComponent, SidebarPalette.darkTint.blue, accuracy: 0.001)
        XCTAssertEqual(dark.alphaComponent, SidebarPalette.darkTint.alpha, accuracy: 0.001)
    }
    #endif
}
