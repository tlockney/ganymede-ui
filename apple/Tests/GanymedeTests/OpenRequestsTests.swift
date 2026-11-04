#if os(macOS)
import Combine
import XCTest

/// Files the Finder asks the Mac app to open, and which window shows them
/// (#228).
@MainActor
final class OpenRequestsTests: XCTestCase {
    private let a = URL(fileURLWithPath: "/Users/me/a.ipynb")
    private let b = URL(fileURLWithPath: "/Users/me/b.ipynb")

    func testTheBlankWindowAtLaunchShowsTheFirstFile() {
        let requests = OpenRequests()
        requests.add([a, b])
        requests.finishLaunching()
        let (shown, others) = requests.take(blank: true)
        XCTAssertEqual(shown, .file(a))
        XCTAssertEqual(others, [.file(b)])
        XCTAssertTrue(requests.pending.isEmpty)
    }

    func testAWindowShowingSomethingOpensEveryFileInItsOwnWindow() {
        let requests = OpenRequests()
        requests.add([a, b])
        let (shown, others) = requests.take(blank: false)
        XCTAssertNil(shown)
        XCTAssertEqual(others, [.file(a), .file(b)])
    }

    func testAfterLaunchABlankWindowKeepsWhatItShows() {
        let requests = OpenRequests()
        requests.finishLaunching()
        requests.add([a])
        let (shown, others) = requests.take(blank: true)
        XCTAssertNil(shown)
        XCTAssertEqual(others, [.file(a)])
    }

    func testOnlyTheFirstWindowGetsThem() {
        let requests = OpenRequests()
        requests.add([a])
        _ = requests.take(blank: false)
        let (shown, others) = requests.take(blank: true)
        XCTAssertNil(shown)
        XCTAssertTrue(others.isEmpty)
    }

    func testEachFileOnceAndOnlyFiles() {
        let requests = OpenRequests()
        requests.add([a, a, URL(string: "https://example.com/c.ipynb")!])
        XCTAssertEqual(requests.pending, [.file(a)])
    }

    func testARestoredWindowLeavesThemToTheBlankLaunchWindow() {
        let requests = OpenRequests()
        let restored = UUID(), blank = UUID()
        requests.register(restored, blank: false)
        requests.register(blank, blank: true)
        requests.add([a])
        requests.finishLaunching()
        let first = requests.take(blank: false)
        XCTAssertNil(first.shown)
        XCTAssertTrue(first.others.isEmpty)
        XCTAssertEqual(requests.take(blank: true).shown, .file(a))
    }

    func testWithNoNotebookWindowEachOpensInANewOne() {
        let requests = OpenRequests()
        requests.finishLaunching()
        var opened: [WindowTarget] = []
        requests.openWindow = { opened.append($0) }
        requests.add([a, b])
        XCTAssertEqual(opened, [.file(a), .file(b)])
        XCTAssertTrue(requests.pending.isEmpty)
    }

    func testANotebookWindowTakesThemWhenThereIsOne() {
        let requests = OpenRequests()
        requests.finishLaunching()
        var opened: [WindowTarget] = []
        requests.openWindow = { opened.append($0) }
        requests.register(UUID(), blank: false)
        requests.add([a])
        XCTAssertTrue(opened.isEmpty)
        XCTAssertEqual(requests.pending, [.file(a)])
    }

    func testOnePublishPerBatch() {
        let requests = OpenRequests()
        var published = 0
        let watch = requests.$pending.dropFirst().sink { _ in published += 1 }
        requests.add([a, b])
        watch.cancel()
        XCTAssertEqual(published, 1)
    }
}
#endif
