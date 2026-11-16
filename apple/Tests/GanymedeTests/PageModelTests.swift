import XCTest

/// When the page counts as ready for commands (#205, #640).
@MainActor
final class PageModelTests: XCTestCase {
    private var connected: PageState {
        var state = PageState()
        state.backend = PageState.Backend(label: "Ganymede", detail: "local server")
        return state
    }

    func testAStateWithABackendMakesThePageReady() {
        let page = PageModel()
        page.update(PageState())
        XCTAssertFalse(page.ready, "no backend yet")
        page.update(connected)
        XCTAssertTrue(page.ready)
    }

    func testAResetForTheStartThePageHasWaitsOnlyForItsNextState() {
        let page = PageModel()
        page.update(connected)
        page.reset(forStart: 0)
        XCTAssertFalse(page.ready)
        page.update(connected)
        XCTAssertTrue(page.ready)
    }

    func testTheOldPageStateCountsForNothingUntilTheNewStartsPageCommits() {
        let page = PageModel()
        let first = NSObject()
        page.loadStarted(first, start: 1)
        page.committed(first)
        page.update(connected)
        XCTAssertTrue(page.ready)
        page.reset(forStart: 2)
        XCTAssertFalse(page.ready)
        // The parked old page posts again before the new page commits.
        page.update(connected)
        XCTAssertFalse(page.ready, "the old page's state makes nothing ready")
        let second = NSObject()
        page.loadStarted(second, start: 2)
        page.committed(second)
        XCTAssertFalse(page.ready, "a commit alone isn't ready")
        page.update(connected)
        XCTAssertTrue(page.ready, "the new start's page is")
    }

    func testALoadForTheOldServerThatCommitsLateDoesNotCount() {
        let page = PageModel()
        // The old server's page is still loading when the restart begins.
        let old = NSObject()
        page.loadStarted(old, start: 1)
        page.reset(forStart: 2)
        page.committed(old)
        page.update(connected)
        XCTAssertFalse(page.ready, "the old load's page is not the new server's")
        page.committed(nil)
        page.committed(NSObject())
        page.update(connected)
        XCTAssertFalse(page.ready, "nor a navigation the app didn't start")
        let new = NSObject()
        page.loadStarted(new, start: 2)
        page.committed(new)
        page.update(connected)
        XCTAssertTrue(page.ready)
    }

    func testTheRestartMayBeSeenAfterItsPageLoads() {
        let page = PageModel()
        // A quick start: the page loads for start 2 before the view hears
        // of start 2, and hears of it twice.
        let load = NSObject()
        page.loadStarted(load, start: 2)
        page.committed(load)
        page.reset(forStart: 2)
        page.reset(forStart: 2)
        page.update(connected)
        XCTAssertTrue(page.ready, "a later reset for the same start doesn't wait again")
    }

    func testAnOlderStartHeardLateDoesNotLowerTheBar() {
        let page = PageModel()
        let load = NSObject()
        page.loadStarted(load, start: 2)
        page.committed(load)
        page.reset(forStart: 3)
        page.reset(forStart: 2)
        page.update(connected)
        XCTAssertFalse(page.ready, "still waiting for start 3's page")
    }

    func testAnotherNavigationCommittingWhileTheAppLoadsDoesNotTakeItsStart() {
        let page = PageModel()
        page.reset(forStart: 2)
        let load = NSObject()
        page.loadStarted(load, start: 2)
        // The old page reloads itself and commits before the app's load.
        page.committed(NSObject())
        page.update(connected)
        XCTAssertFalse(page.ready, "the other page isn't start 2's")
        page.committed(load)
        page.update(connected)
        XCTAssertTrue(page.ready)
    }

    func testACommitMakesAReadyPageWaitForItsState() {
        let page = PageModel()
        page.update(connected)
        // A reload, with no server change.
        page.committed(NSObject())
        XCTAssertFalse(page.ready, "commands wait for the reloaded page's state")
        page.update(connected)
        XCTAssertTrue(page.ready, "a reload keeps the page's start")
    }

    func testOnlyTheAppsOwnLoadFailingIsLoadedAgain() {
        let page = PageModel()
        let load = NSObject()
        page.loadStarted(load, start: 1)
        XCTAssertFalse(page.loadFailed(NSObject()), "another navigation")
        XCTAssertFalse(page.loadFailed(nil))
        XCTAssertTrue(page.loadFailed(load))
        XCTAssertFalse(page.loadFailed(load), "once")
        // A failed load's late commit doesn't count either.
        page.reset(forStart: 1)
        page.committed(load)
        page.update(connected)
        XCTAssertFalse(page.ready)
    }

    func testARestartLoadsThePageAgainEvenOnTheSameURL() {
        var loads = PageLoads()
        let url = URL(string: "http://127.0.0.1:8888/")!
        XCTAssertTrue(loads.shouldLoad(url, start: 1))
        XCTAssertFalse(loads.shouldLoad(url, start: 1), "already loaded")
        XCTAssertTrue(loads.shouldLoad(url, start: 2), "a new start, same port")
        XCTAssertTrue(loads.shouldLoad(URL(string: "http://127.0.0.1:9999/")!, start: 2), "a new URL")
        loads.forget()
        XCTAssertTrue(loads.shouldLoad(url, start: 2), "forgotten: loads again")
    }

    func testAFailedLoadIsStartedAgainOnce() {
        var loads = PageLoads()
        XCTAssertNil(loads.retry(), "nothing loaded")
        let url = URL(string: "http://127.0.0.1:8888/")!
        _ = loads.shouldLoad(url, start: 3)
        let again = loads.retry()
        XCTAssertEqual(again?.url, url)
        XCTAssertEqual(again?.start, 3)
        XCTAssertNil(loads.retry(), "a server that doesn't answer isn't asked forever")
        _ = loads.shouldLoad(url, start: 4)
        XCTAssertNotNil(loads.retry(), "each new load may be retried once")
        XCTAssertNotNil(loads.retry(cancelled: true), "a load another navigation cancelled, always")
        XCTAssertNotNil(loads.retry(cancelled: true))
        XCTAssertNil(loads.retry(), "the once for other failures is still spent")
    }
}
