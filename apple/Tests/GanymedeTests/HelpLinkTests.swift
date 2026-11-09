import XCTest

/// The Help menu and Settings link to pages the site publishes (#409).
final class HelpLinkTests: XCTestCase {
    func testLinksPointAtTheSitesPages() {
        XCTAssertEqual(HelpLink.website.url.absoluteString, "https://ganymede-server.com")
        XCTAssertEqual(HelpLink.docs.url.absoluteString, "https://ganymede-server.com/docs/")
        XCTAssertEqual(HelpLink.apps.url.absoluteString, "https://ganymede-server.com/docs/ganymede-ui/apps")
    }

    /// The site publishes this repo's docs/<name>.md at /docs/ganymede-ui/<name>,
    /// so renaming the apps guide would break Help > Apps Guide.
    func testAppsGuidePageExists() {
        let repo = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // GanymedeTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // apple
            .deletingLastPathComponent()
        let page = repo.appending(path: "docs/\(HelpLink.apps.url.lastPathComponent).md")
        XCTAssertTrue(FileManager.default.fileExists(atPath: page.path), page.path)
    }

    func testPrivacyPageIsOnTheSite() {
        XCTAssertEqual(HelpLink.privacy.absoluteString, "https://ganymede-server.com/docs/privacy")
    }

    func testEachLinkHasItsOwnTitle() {
        let titles = HelpLink.allCases.map(\.title)
        XCTAssertEqual(Set(titles).count, titles.count)
    }
}
