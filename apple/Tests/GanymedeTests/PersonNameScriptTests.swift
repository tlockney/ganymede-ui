import WebKit
import XCTest

/// The person's name reaches a machine's page only when its setting says so (#842).
@MainActor
final class PersonNameScriptTests: XCTestCase {
    private let loaded = URL(string: "http://127.0.0.1:8123/?kernels=both")!

    private func script(place: Place, sharesName: Bool) throws -> WKUserScript? {
        try XCTSkipIf(PersonName.name == nil, "no account name on this runner")
        return PersonName.pageScript(for: loaded, place: place, sharesName: sharesName)
    }

    func testAMachinesPageGetsTheNameOnlyWithItsSettingOn() throws {
        XCTAssertNotNil(try script(place: .machine("m1"), sharesName: true))
        XCTAssertNil(try script(place: .machine("m1"), sharesName: false))
    }

    func testThisDevicesPageAlwaysGetsTheName() throws {
        XCTAssertNotNil(try script(place: .thisDevice, sharesName: false))
    }
}
