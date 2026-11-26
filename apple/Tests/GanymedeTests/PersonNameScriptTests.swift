import WebKit
import XCTest

/// The person's name reaches a machine's page only when its setting says so (#842).
@MainActor
final class PersonNameScriptTests: XCTestCase {
    private let loaded = URL(string: "http://127.0.0.1:8123/?kernels=both")!

    /// iOS has no name (`PersonName.name`), so there is nothing to give.
    /// Skipped here, at the top of a test: an `XCTSkip` thrown inside an
    /// assertion counts as a failure.
    override func setUpWithError() throws {
        try XCTSkipIf(PersonName.name == nil, "no account name on this platform")
    }

    private func script(place: Place, sharesName: Bool) -> WKUserScript? {
        PersonName.pageScript(for: loaded, place: place, sharesName: sharesName)
    }

    func testAMachinesPageGetsTheNameOnlyWithItsSettingOn() {
        XCTAssertNotNil(script(place: .machine("m1"), sharesName: true))
        XCTAssertNil(script(place: .machine("m1"), sharesName: false))
    }

    func testThisDevicesPageAlwaysGetsTheName() {
        XCTAssertNotNil(script(place: .thisDevice, sharesName: false))
    }
}
