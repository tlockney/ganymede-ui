import XCTest

/// The person's name the page sends in a notebook room's awareness (#606).
final class PersonNameTests: XCTestCase {
    func testSetsTheNameForAPageFromThisMac() throws {
        let source = try XCTUnwrap(PersonName.source("Thomas"))
        XCTAssertTrue(source.hasPrefix(#"if (["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)) "#))
        XCTAssertTrue(source.hasSuffix(#"window.ganymedeUser = {"name":"Thomas"};"#))
        // Quotes can't end the string early.
        XCTAssertTrue(
            try XCTUnwrap(PersonName.source(#"A "B" C"#))
                .hasSuffix(#"window.ganymedeUser = {"name":"A \"B\" C"};"#)
        )
    }

    func testSetsNothingWithoutAName() {
        XCTAssertNil(PersonName.source(nil))
    }
}
