import XCTest

// The Quick Look extensions are Mac-only.
#if os(macOS)

/// The Quick Look preview's files, served to its web view (#135).
final class PreviewResourcesTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root.appendingPathComponent("assets"), withIntermediateDirectories: true)
        try Data("<!doctype html>".utf8).write(to: root.appendingPathComponent("preview.html"))
        try Data("export {}".utf8).write(to: root.appendingPathComponent("assets/preview-1.js"))
    }

    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: root)
    }

    func testServesFilesUnderTheRoot() throws {
        let page = try XCTUnwrap(PreviewResources.file(for: PreviewResources.pageURL, in: root))
        XCTAssertEqual(page.lastPathComponent, "preview.html")
        let script = try XCTUnwrap(PreviewResources.file(
            for: URL(string: "ganymede-preview://app/assets/preview-1.js?v=1")!, in: root))
        XCTAssertEqual(try String(contentsOf: script, encoding: .utf8), "export {}")
    }

    func testRefusesAnythingElse() {
        for url in [
            "ganymede-preview://app/../secret",
            "ganymede-preview://app/assets/%2E%2E/%2E%2E/secret",
            "ganymede-preview://app/",
            "ganymede-preview://app//etc/passwd",
            "ganymede-preview://other/preview.html",
            "file:///etc/passwd",
            "https://app/preview.html",
        ] {
            XCTAssertNil(PreviewResources.file(for: URL(string: url)!, in: root), url)
        }
    }

    func testRefusesALinkOutOfTheRoot() throws {
        try FileManager.default.createSymbolicLink(
            at: root.appendingPathComponent("out"), withDestinationURL: URL(fileURLWithPath: "/etc"))
        XCTAssertNil(PreviewResources.file(for: URL(string: "ganymede-preview://app/out/hosts")!, in: root))
    }

    func testTypesModuleScriptsAsJavaScript() {
        XCTAssertEqual(PreviewResources.mimeType(for: URL(fileURLWithPath: "/a/b.js")), "text/javascript")
        XCTAssertEqual(PreviewResources.mimeType(for: URL(fileURLWithPath: "/a/b.css")), "text/css")
        XCTAssertEqual(PreviewResources.mimeType(for: URL(fileURLWithPath: "/a/b.woff")), "font/woff")
        XCTAssertEqual(PreviewResources.mimeType(for: URL(fileURLWithPath: "/a/preview.html")), "text/html")
    }
}
#endif
