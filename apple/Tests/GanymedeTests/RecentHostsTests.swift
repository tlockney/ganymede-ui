import XCTest

/// The remote form's list of server URLs used before (#731).
final class RecentHostsTests: XCTestCase {
    func testAddsToFront() {
        XCTAssertEqual(RecentHosts.adding("https://b.ts.net/", to: ["https://a.ts.net/"]),
                       ["https://b.ts.net/", "https://a.ts.net/"])
    }

    func testDedupesByMovingToFront() {
        let list = ["https://a.ts.net/", "https://b.ts.net/", "https://c.ts.net/"]
        XCTAssertEqual(RecentHosts.adding("https://c.ts.net/", to: list),
                       ["https://c.ts.net/", "https://a.ts.net/", "https://b.ts.net/"])
    }

    func testTrims() {
        XCTAssertEqual(RecentHosts.adding("  https://b.ts.net/ \n", to: ["https://a.ts.net/"]),
                       ["https://b.ts.net/", "https://a.ts.net/"])
        // Equal after trimming, so it isn't added a second time.
        XCTAssertEqual(RecentHosts.adding(" https://a.ts.net/", to: ["https://a.ts.net/"]),
                       ["https://a.ts.net/"])
    }

    func testSkipsEmpty() {
        let list = ["https://a.ts.net/"]
        XCTAssertEqual(RecentHosts.adding("", to: list), list)
        XCTAssertEqual(RecentHosts.adding("   ", to: list), list)
    }

    func testCapsAtLimit() {
        let list = (1...8).map { "https://h\($0).ts.net/" }
        let result = RecentHosts.adding("https://new.ts.net/", to: list)
        XCTAssertEqual(result.count, 8)
        XCTAssertEqual(result.first, "https://new.ts.net/")
        XCTAssertFalse(result.contains("https://h8.ts.net/"))
        XCTAssertEqual(RecentHosts.adding("https://x/", to: ["https://a/", "https://b/"], limit: 2),
                       ["https://x/", "https://a/"])
    }

    func testExcludingTrimsTheCurrentURL() {
        XCTAssertEqual(RecentHosts.excluding(" https://a.ts.net/ ", from: ["https://a.ts.net/", "https://b.ts.net/"]),
                       ["https://b.ts.net/"])
    }

    func testDropsAQueryAndFragment() {
        XCTAssertEqual(RecentHosts.adding("http://host:8888/?token=abc#x", to: []),
                       ["http://host:8888/"])
        XCTAssertEqual(RecentHosts.adding("http://host:8888/?token=abc", to: ["http://host:8888/"]),
                       ["http://host:8888/"])
    }

    func testRecordKeepsTheMostRecentFirst() throws {
        let suite = "RecentHostsTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        RecentHosts.record("https://a.ts.net/", defaults)
        RecentHosts.record("https://b.ts.net/", defaults)
        XCTAssertEqual(RecentHosts.load(defaults), ["https://b.ts.net/", "https://a.ts.net/"])
    }
}
