import XCTest

/// Signing in over SSH on iPad/iPhone (#630): none before the key, for
/// Tailscale SSH, and its banners in the terminal.
final class SSHSignInTests: XCTestCase {
    func testOffersNoneThenTheKeyOnce() {
        XCTAssertEqual(SSHSignIn.next(offered: [], keysAccepted: true), SSHSignIn.Offer.none)
        XCTAssertEqual(SSHSignIn.next(offered: [], keysAccepted: false), SSHSignIn.Offer.none)
        XCTAssertEqual(SSHSignIn.next(offered: [.none], keysAccepted: true), .key)
        XCTAssertNil(SSHSignIn.next(offered: [.none], keysAccepted: false))
        XCTAssertNil(SSHSignIn.next(offered: [.none, .key], keysAccepted: true))
    }

    func testWaitsLongerAfterABannerWithALink() {
        XCTAssertEqual(SSHSignIn.timeLimit(linkShown: false), 30)
        XCTAssertEqual(SSHSignIn.timeLimit(linkShown: true), 300)
        XCTAssertTrue(SSHSignIn.hasLink("To authenticate, visit: https://login.tailscale.com/a/abc"))
        XCTAssertFalse(SSHSignIn.hasLink("Authorized use only."))
    }

    func testRefusalSaysWhatWasTried() {
        let key = SSHSignIn.refusal(user: "me", offered: [.none, .key])
        XCTAssertTrue(key.contains("did not accept the app's key"))
        XCTAssertTrue(key.contains("SSH policy"))
        let none = SSHSignIn.refusal(user: "me", offered: [.none])
        XCTAssertFalse(none.contains("authorized_keys"))
        XCTAssertTrue(none.contains("doesn't take keys"))
    }

    private func text(_ message: String) -> String {
        String(decoding: SSHSignIn.banner(message), as: UTF8.self)
    }

    func testBannerLinesAndLinks() {
        let osc = "\u{1B}]8;;"
        let st = "\u{1B}\\"
        XCTAssertEqual(
            text("# Tailscale SSH requires an additional check.\n# To authenticate, visit: https://login.tailscale.com/a/abc123\n"),
            "# Tailscale SSH requires an additional check.\r\n# To authenticate, visit: "
                + "\(osc)https://login.tailscale.com/a/abc123\(st)https://login.tailscale.com/a/abc123\(osc)\(st)\r\n"
        )
        XCTAssertEqual(
            text("See http://a.example/x. Or (https://b.example)"),
            "See \(osc)http://a.example/x\(st)http://a.example/x\(osc)\(st). "
                + "Or (\(osc)https://b.example\(st)https://b.example\(osc)\(st))\r\n"
        )
        XCTAssertEqual(
            text("<https://x.example/a> https://w.example/Foo_(bar)"),
            "<\(osc)https://x.example/a\(st)https://x.example/a\(osc)\(st)> "
                + "\(osc)https://w.example/Foo_(bar)\(st)https://w.example/Foo_(bar)\(osc)\(st)\r\n"
        )
        XCTAssertEqual(text("no link"), "no link\r\n")
        XCTAssertEqual(text("a\r\nb\rc"), "a\r\nb\r\nc\r\n")
    }

    func testBannerDropsControlCharacters() {
        XCTAssertEqual(text("\u{1B}[2Jcleared\u{07}\tok\u{9B}31m"), "[2Jcleared\tok31m\r\n")
    }
}
