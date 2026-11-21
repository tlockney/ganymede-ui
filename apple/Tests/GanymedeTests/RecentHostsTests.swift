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

    func testExcludingIgnoresTheFieldsQueryAndFragment() {
        let list = ["http://host:8888/", "http://other/"]
        XCTAssertEqual(RecentHosts.excluding("http://host:8888/?token=abc", from: list), ["http://other/"])
        XCTAssertEqual(RecentHosts.excluding("http://host:8888/?token=abc#x", from: list), ["http://other/"])
        XCTAssertEqual(RecentHosts.excluding("http://host:8888/#x", from: list), ["http://other/"])
    }

    func testExcludingTreatsAMissingPathAsSlash() {
        XCTAssertEqual(RecentHosts.excluding("https://a.ts.net", from: ["https://a.ts.net/"]), [])
    }

    func testAddingNormalizesAnEmptyPath() {
        XCTAssertEqual(RecentHosts.adding("https://a.ts.net", to: []), ["https://a.ts.net/"])
        XCTAssertEqual(RecentHosts.adding("https://a.ts.net/", to: ["https://a.ts.net"]),
                       ["https://a.ts.net/"])
        XCTAssertEqual(RecentHosts.adding("https://a.ts.net", to: ["https://b.ts.net/", "https://a.ts.net/"]),
                       ["https://a.ts.net/", "https://b.ts.net/"])
    }

    func testAddingKeepsAPath() {
        XCTAssertEqual(RecentHosts.adding("https://a.ts.net/lab", to: []), ["https://a.ts.net/lab/"])
        // `/lab` and `/lab/` are one server, as `ServerEndpoint` takes them.
        XCTAssertEqual(RecentHosts.adding("https://a.ts.net/lab/", to: ["https://a.ts.net/lab"]),
                       ["https://a.ts.net/lab/"])
    }

    func testNormalizedDropsCredentialsAndLowercasesSchemeAndHost() {
        XCTAssertEqual(RecentHosts.normalized("https://alice:s3cret@host.ts.net/"), "https://host.ts.net/")
        XCTAssertEqual(RecentHosts.adding("https://alice@host.ts.net/", to: []), ["https://host.ts.net/"])
        XCTAssertEqual(RecentHosts.normalized("HTTPS://Mac.Tailnet.ts.net:8888/Lab"), "https://mac.tailnet.ts.net:8888/Lab/")
    }

    func testNormalizedKeepsAnIPv6Host() {
        XCTAssertEqual(RecentHosts.normalized("http://[fd7a::1]:8888"), "http://[fd7a::1]:8888/")
        XCTAssertTrue(RecentHosts.sameServer("http://[fd7a::1]:8888/?token=x", "http://[fd7a::1]:8888"))
    }

    func testLoadCleansWhatAnOlderBuildStored() throws {
        let suite = "RecentHostsTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set(["https://alice:pw@host.ts.net/", "https://a.ts.net", "https://b.ts.net/", "https://a.ts.net/"],
                     forKey: RecentHosts.key)
        XCTAssertEqual(RecentHosts.load(defaults),
                       ["https://host.ts.net/", "https://a.ts.net/", "https://b.ts.net/"])
    }

    func testPickingTheSameServerKeepsTheToken() {
        XCTAssertEqual(RecentHosts.tokenAfterPicking("http://host:8888/", field: "http://host:8888/?token=abc", token: "t"), "t")
        XCTAssertEqual(RecentHosts.tokenAfterPicking("https://a.ts.net/", field: "https://a.ts.net", token: "t"), "t")
        XCTAssertEqual(RecentHosts.tokenAfterPicking("http://other:8888/", field: "http://host:8888/", token: "t"), "")
        XCTAssertEqual(RecentHosts.tokenAfterPicking("http://host:8889/", field: "http://host:8888/", token: "t"), "")
    }

    func testSameServer() {
        XCTAssertTrue(RecentHosts.sameServer("http://host:8888/?token=abc", "http://host:8888/"))
        XCTAssertTrue(RecentHosts.sameServer("https://a.ts.net", " https://a.ts.net/ "))
        XCTAssertFalse(RecentHosts.sameServer("http://host:8888/", "http://other:8888/"))
        XCTAssertFalse(RecentHosts.sameServer("http://host:8888/", "http://host:8889/"))
        XCTAssertFalse(RecentHosts.sameServer("https://a.ts.net/lab", "https://a.ts.net/"))
        XCTAssertTrue(RecentHosts.sameServer("https://a.ts.net/lab", "https://a.ts.net/lab/"))
    }

    func testNormalizedOnlyTrimsWhatIsNotAURL() {
        XCTAssertEqual(RecentHosts.normalized("  not a url \n"), "not a url")
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
