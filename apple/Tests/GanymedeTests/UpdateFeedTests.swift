#if os(macOS)
import XCTest

/// Only a build with a feed and a key updates itself (#411).
final class UpdateFeedTests: XCTestCase {
    private let feed = "https://github.com/tlockney/ganymede-ui/releases/latest/download/appcast.xml"

    func testReleaseBuildHasAFeed() {
        let url = UpdateFeed.url(in: ["SUFeedURL": feed, "SUPublicEDKey": "abc="])
        XCTAssertEqual(url?.absoluteString, feed)
    }

    func testOtherBuildsHaveNone() {
        // project.yml leaves both empty outside release-app.sh.
        XCTAssertNil(UpdateFeed.url(in: ["SUFeedURL": "", "SUPublicEDKey": ""]))
        XCTAssertNil(UpdateFeed.url(in: [:]))
        XCTAssertNil(UpdateFeed.url(in: ["SUFeedURL": feed]))
        XCTAssertNil(UpdateFeed.url(in: ["SUFeedURL": feed, "SUPublicEDKey": "  "]))
        XCTAssertNil(UpdateFeed.url(in: ["SUPublicEDKey": "abc="]))
    }

    func testFeedMustBeHTTPS() {
        let plain = "http://github.com/tlockney/ganymede-ui/releases/latest/download/appcast.xml"
        XCTAssertNil(UpdateFeed.url(in: ["SUFeedURL": plain, "SUPublicEDKey": "abc="]))
        XCTAssertNil(UpdateFeed.url(in: ["SUFeedURL": "$(SPARKLE_FEED_URL)", "SUPublicEDKey": "abc="]))
    }
}
#endif
