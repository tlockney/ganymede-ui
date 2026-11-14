import XCTest

/// The person's name the page sends in a notebook room's awareness (#606).
final class PersonNameTests: XCTestCase {
    func testSetsTheNameOnTheInAppServersPageOnly() throws {
        let source = try XCTUnwrap(PersonName.source("Thomas", origin: "http://127.0.0.1:4321"))
        XCTAssertEqual(
            source,
            #"if (location.origin === "http:\/\/127.0.0.1:4321") window.ganymedeUser = {"name":"Thomas"};"#
        )
        // Quotes can't end the string early.
        XCTAssertTrue(
            try XCTUnwrap(PersonName.source(#"A "B" C"#, origin: "http://127.0.0.1:1"))
                .hasSuffix(#"window.ganymedeUser = {"name":"A \"B\" C"};"#)
        )
    }

    func testTheOriginIsThePagesOwn() {
        XCTAssertEqual(PersonName.origin(URL(string: "http://127.0.0.1:4321/lab?x=1")), "http://127.0.0.1:4321")
        XCTAssertEqual(PersonName.origin(URL(string: "http://[::1]:8888/")), "http://[::1]:8888")
        XCTAssertNil(PersonName.origin(nil))
    }

    func testSetsNothingWithoutANameOrAPage() {
        XCTAssertNil(PersonName.source(nil, origin: "http://127.0.0.1:1"))
        XCTAssertNil(PersonName.source("Thomas", origin: nil))
    }
}
