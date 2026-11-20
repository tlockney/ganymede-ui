import XCTest

/// The page asks for Settings at a tab, and the Shortcuts tab loads the
/// page's list alone (#332).
final class SettingsTabTests: XCTestCase {
    func testReadsTheTabThePageNames() {
        XCTAssertEqual(SettingsTab(message: "agent"), .agent)
        XCTAssertEqual(SettingsTab(message: "shortcuts"), .shortcuts)
        XCTAssertNil(SettingsTab(message: "everything"))
        XCTAssertNil(SettingsTab(message: ["tab": "agent"]))
    }

    func testDeveloperTabShowsOnlyWhileItIsOn() {
        XCTAssertEqual(SettingsTab.developer.shown(developer: true), .developer)
        // The tab kept from the last launch, with the switch since turned off.
        XCTAssertEqual(SettingsTab.developer.shown(developer: false), .general)
        for tab in SettingsTab.allCases where tab != .developer {
            XCTAssertEqual(tab.shown(developer: false), tab)
            XCTAssertEqual(tab.shown(developer: true), tab)
        }
    }

    func testThePageCannotOpenTheDeveloperTab() {
        XCTAssertNil(SettingsTab(message: "developer"))
    }

    func testShortcutsPageKeepsTheServersQuery() throws {
        let server = try XCTUnwrap(URL(string: "http://127.0.0.1:8888/?token=abc"))
        let url = ShortcutsPane.url(server: server)
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(url.host, "127.0.0.1")
        XCTAssertEqual(url.port, 8888)
        XCTAssertEqual(items.first { $0.name == "token" }?.value, "abc")
        XCTAssertEqual(items.filter { $0.name == "view" }.map(\.value), ["shortcuts"])
    }

    func testShortcutsPageReplacesAnEarlierView() throws {
        let server = try XCTUnwrap(URL(string: "http://127.0.0.1:8888/?view=other"))
        let items = URLComponents(url: ShortcutsPane.url(server: server), resolvingAgainstBaseURL: false)?.queryItems
        XCTAssertEqual(items?.filter { $0.name == "view" }.map(\.value), ["shortcuts"])
    }
}
