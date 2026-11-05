import XCTest

/// What crash reports may carry (#318).
final class CrashScrubTests: XCTestCase {
    func testDropsHomesAndURLHosts() {
        XCTAssertEqual(
            CrashScrub.text("open /Users/thomas/notes/a.ipynb via http://127.0.0.1:8888/api/contents/a.ipynb?token=abc"),
            "open ~/notes/a.ipynb via /api/contents/a.ipynb"
        )
        XCTAssertEqual(
            CrashScrub.text("/private/var/mobile/Containers/Data/Application/0A1B-2C3D/Documents/x.ipynb"),
            "~/Documents/x.ipynb"
        )
    }

    func testCutsLongMessages() {
        XCTAssertEqual(CrashScrub.text(String(repeating: "x", count: 1000)).count, CrashScrub.maxMessage + 1)
    }

    func testKeepsOnlyOSDeviceAndAppBasics() {
        let kept = CrashScrub.context([
            "os": ["name": "macOS", "version": "26.1"],
            "device": ["model": "Mac16,1", "name": "Thomas's MacBook", "free_memory": 1],
            "app": ["app_version": "0.3.0", "app_name": "Ganymede", "device_app_hash": "abc"],
            "culture": ["locale": "en_US"],
        ])!
        XCTAssertEqual(Set(kept.keys), ["os", "device", "app"])
        XCTAssertEqual(Set(kept["device"]!.keys), ["model"])
        XCTAssertEqual(Set(kept["app"]!.keys), ["app_version"])
    }
}
