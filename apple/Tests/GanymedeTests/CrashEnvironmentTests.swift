import XCTest

/// Main builds report to Sentry apart from releases (#539).
final class CrashEnvironmentTests: XCTestCase {
    func testReleaseBuildIsProduction() {
        XCTAssertEqual(CrashEnvironment.name(build: "24"), "production")
    }

    func testMainBuildIsMain() {
        XCTAssertEqual(CrashEnvironment.name(build: "24.7"), "main")
    }
}
