#if os(macOS)
import AppKit
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

    func testAfterLaunchTheyOpenAtOnceEvenWithNotebookWindows() {
        let requests = OpenRequests()
        requests.finishLaunching()
        var opened: [WindowTarget] = []
        requests.openWindow = { opened.append($0) }
        requests.register(UUID(), blank: false)
        requests.register(UUID(), blank: true)
        requests.add([a])
        XCTAssertEqual(opened, [.file(a)])
        XCTAssertTrue(requests.pending.isEmpty)
    }

    func testAfterLaunchWithNoWindowYetTheyWait() {
        let requests = OpenRequests()
        requests.finishLaunching()
        requests.add([a])
        XCTAssertEqual(requests.pending, [.file(a)])
    }

    func testFilesFromAnOpenDocumentsEvent() {
        let event = NSAppleEventDescriptor(
            eventClass: AEEventClass(kCoreEventClass), eventID: AEEventID(kAEOpenDocuments),
            targetDescriptor: nil, returnID: AEReturnID(kAutoGenerateReturnID),
            transactionID: AETransactionID(kAnyTransactionID)
        )
        let list = NSAppleEventDescriptor.list()
        list.insert(NSAppleEventDescriptor(fileURL: a), at: 1)
        list.insert(NSAppleEventDescriptor(fileURL: b), at: 2)
        event.setParam(list, forKeyword: keyDirectObject)
        XCTAssertEqual(OpenRequests.fileURLs(in: event), [a, b])

        event.setParam(NSAppleEventDescriptor(fileURL: a), forKeyword: keyDirectObject)
        XCTAssertEqual(OpenRequests.fileURLs(in: event), [a])
    }

    func testFilesThatComeLateInLaunchStillGoToTheBlankWindow() {
        // AppKit can deliver them after applicationDidFinishLaunching; the
        // app ends launch a moment later (#266).
        let requests = OpenRequests()
        var opened: [WindowTarget] = []
        requests.openWindow = { opened.append($0) }
        requests.register(UUID(), blank: true)
        requests.add([a])
        XCTAssertTrue(opened.isEmpty)
        XCTAssertEqual(requests.take(blank: true).shown, .file(a))
        requests.finishLaunching()
        XCTAssertTrue(opened.isEmpty)
    }

    func testFilesNoWindowTookAtLaunchOpenWhenLaunchEnds() {
        let requests = OpenRequests()
        var opened: [WindowTarget] = []
        requests.openWindow = { opened.append($0) }
        requests.add([a, b])
        requests.finishLaunching()
        XCTAssertEqual(opened, [.file(a), .file(b)])
        XCTAssertTrue(requests.pending.isEmpty)
    }

    func testAColdLaunchWithNoWindowOpensThemFromTheMenus() {
        // Launched from the Finder, SwiftUI made no window (#266).
        let requests = OpenRequests()
        var opened: [WindowTarget] = []
        requests.fallbackOpenWindow = { opened.append($0) }
        requests.add([a])
        XCTAssertTrue(opened.isEmpty)
        requests.finishLaunching()
        XCTAssertEqual(opened, [.file(a)])
    }

    func testTheFirstFileAtLaunchIsBroughtForwardWhenLaunchEnds() {
        // Restored windows can come back in front of it (#268).
        let requests = OpenRequests()
        requests.add([a, b])
        XCTAssertNil(requests.front)
        _ = requests.take(blank: false)
        requests.finishLaunching()
        XCTAssertEqual(requests.front, .file(a))
    }

    func testNothingIsBroughtForwardAfterAPlainLaunch() {
        let requests = OpenRequests()
        requests.finishLaunching()
        XCTAssertNil(requests.front)
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
