#if os(macOS)
import XCTest

/// A check the person starts reads the feed, not an update Sparkle found
/// earlier and still holds (#666).
final class UpdateCheckTests: XCTestCase {
    func testNoSessionStartsFresh() {
        // Remind Me Later, or a closed update window, leaves the update
        // held with no session open (and no toolbar update).
        XCTAssertTrue(UpdateCheck.startsFresh(sessionInProgress: false, toolbarUpdateDownloaded: nil))
    }

    func testToolbarUpdateNotDownloadedStartsFresh() {
        // A scheduled check found it and the toolbar button shows it;
        // a newer release may have come out since.
        XCTAssertTrue(UpdateCheck.startsFresh(sessionInProgress: true, toolbarUpdateDownloaded: false))
    }

    func testBusySessionCarriesOn() {
        // A check or download running, or a window the person has seen.
        XCTAssertFalse(UpdateCheck.startsFresh(sessionInProgress: true, toolbarUpdateDownloaded: nil))
        // Downloaded already: installing it doesn't wait for a download.
        XCTAssertFalse(UpdateCheck.startsFresh(sessionInProgress: true, toolbarUpdateDownloaded: true))
    }
}
#endif
