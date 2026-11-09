import XCTest

/// The Help menu and Settings link to pages the site publishes (#409).
final class HelpLinkTests: XCTestCase {
    func testLinksPointAtTheSitesPages() {
        XCTAssertEqual(HelpLink.website.url.absoluteString, "https://ganymede-server.com")
        XCTAssertEqual(HelpLink.docs.url.absoluteString, "https://ganymede-server.com/docs/")
        XCTAssertEqual(HelpLink.apps.url.absoluteString, "https://ganymede-server.com/docs/ganymede-ui/apps")
    }

    func testEachLinkHasItsOwnTitle() {
        let titles = HelpLink.allCases.map(\.title)
        XCTAssertEqual(Set(titles).count, titles.count)
    }
}
