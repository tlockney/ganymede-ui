import XCTest

/// The person's name the page sends in a notebook room's awareness (#606).
final class PersonNameTests: XCTestCase {
    func testSetsTheNameForThePage() {
        XCTAssertEqual(PersonName.source("Thomas"), #"window.ganymedeUser = {"name":"Thomas"};"#)
        // Quotes can't end the string early.
        XCTAssertEqual(
            PersonName.source(#"A "B" C"#),
            #"window.ganymedeUser = {"name":"A \"B\" C"};"#
        )
    }

    func testSetsNothingWithoutAName() {
        XCTAssertEqual(PersonName.source(nil), "")
    }
}
