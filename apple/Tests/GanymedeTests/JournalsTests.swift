import XCTest

/// The native Journals tab's parsing, filtering and fetching (#705, #740),
/// matching `src/lib/journals.test.ts`.
final class JournalsTests: XCTestCase {
    private typealias Room = Journals.Room
    private let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"
    private let server = URL(string: "http://127.0.0.1:8123/?token=abc")!
    private let person = Journals.LastChange(at: "2026-11-20T10:00:00Z", by: "Thomas", person: true)
    private func agent(_ at: String) -> Journals.LastChange { .init(at: at, by: "Claude", person: false) }
    private func room(_ path: String, type: String? = nil, clients: [Journals.Client] = [], change: Journals.LastChange? = nil) -> Room {
        Room(path: path, type: type, clients: clients, lastChange: change)
    }

    func testParsesTheRoomsAnswer() {
        let body: [String: Any] = ["rooms": [
            [
                "path": "journal/day.ipynb", "type": "notebook",
                "clients": [
                    ["name": "Claude", "kind": "agent"], ["name": "Thomas", "kind": "person"],
                    ["name": "x", "kind": "robot"],
                ],
                "last_change": ["at": "2026-11-20T10:00:00Z", "by": "Claude", "person": false],
            ],
            ["path": "b.ipynb", "clients": [], "last_change": NSNull()],
            ["path": "c.ipynb", "last_change": ["by": "x"]],
            ["clients": []], ["path": ""], "junk",
        ]]
        XCTAssertEqual(Journals.parseRooms(body), [
            room("journal/day.ipynb", type: "notebook",
                 clients: [.init(name: "Claude", kind: .agent), .init(name: "Thomas", kind: .person)],
                 change: agent("2026-11-20T10:00:00Z")),
            room("b.ipynb"),
            room("c.ipynb"),
        ])
        XCTAssertEqual(Journals.parseRooms(nil), [])
        XCTAssertEqual(Journals.parseRooms(["rooms": "x"]), [])
    }

    func testAJournalHasAnAgentInItOrWasLastChangedByOne() {
        let claude = Journals.Client(name: "Claude", kind: .agent)
        XCTAssertTrue(Journals.isJournal(room("a.ipynb", clients: [claude])))
        XCTAssertTrue(Journals.isJournal(room("a.ipynb", change: agent("2026-11-20T09:00:00Z"))))
        XCTAssertFalse(Journals.isJournal(room("a.ipynb", clients: [.init(name: "T", kind: .person)], change: person)))
        XCTAssertFalse(Journals.isJournal(room("a.ipynb")))
        XCTAssertFalse(Journals.isJournal(room("a.md", type: "file", clients: [claude])))
    }

    func testRunningFirstThenNewestThenPath() {
        let list = Journals.journalsOf([
            room("people.ipynb", clients: [.init(name: "T", kind: .person)], change: person),
            room("old.ipynb", change: agent("2026-11-19T09:00:00Z")),
            room("new.ipynb", change: agent("2026-11-20T09:00:00Z")),
            room("live/Day 1.ipynb", clients: [.init(name: "Claude", kind: .agent)], change: agent("2026-11-18T09:00:00Z")),
            room("b.ipynb", change: agent("2026-11-19T09:00:00Z")),
        ])
        XCTAssertEqual(list.map(\.path), ["live/Day 1.ipynb", "new.ipynb", "b.ipynb", "old.ipynb"])
        XCTAssertEqual(list[0].name, "Day 1")
        XCTAssertEqual(list[0].agent, "Claude")
        XCTAssertTrue(list[0].running)
        XCTAssertEqual(list[1].agent, "Claude")
        XCTAssertFalse(list[1].running)
    }

    func testFractionalSecondsAndBadDates() {
        XCTAssertGreaterThan(Journals.time("2026-11-20T10:00:00.250Z"), 0)
        XCTAssertEqual(Journals.time("soon"), 0)
        XCTAssertEqual(Journals.time(nil), 0)
    }

    func testRoomsComeFromThisDeviceOrThroughTheMount() throws {
        let local = try XCTUnwrap(Journals.roomsURL(place: .thisDevice, server: server))
        XCTAssertEqual(local.path, "/api/collaboration/rooms")
        XCTAssertEqual(local.query, "token=abc")
        let machine = try XCTUnwrap(Journals.roomsURL(place: .machine(id), server: server))
        XCTAssertEqual(machine.path, "/machines/\(id)/api/collaboration/rooms")
        XCTAssertEqual(machine.query, "token=abc")
        XCTAssertNil(Journals.roomsURL(place: .machine("../x"), server: server))
    }

    func testA404MeansAnOlderServerAndOtherFailuresAreReported() async {
        XCTAssertEqual(Journals.result(status: 404, body: Data()), .unsupported)
        XCTAssertEqual(Journals.result(status: 502, body: Data()), .error("The server answered 502."))
        let ok = Journals.result(status: 200, body: Data(#"{"rooms":[{"path":"a.ipynb","clients":[]}]}"#.utf8))
        XCTAssertEqual(ok, .rooms([room("a.ipynb")]))
        let answer = await Journals.fetch(place: .machine(id), server: server, send: { request in
            XCTAssertEqual(request.url?.path, "/machines/\(self.id)/api/collaboration/rooms")
            let response = HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!
            return (Data(), response)
        })
        XCTAssertEqual(answer, .unsupported)
    }

    func testStatusSaysRunningOrWhenItLastChanged() {
        let now = Date(timeIntervalSince1970: Journals.time("2026-11-20T12:00:00Z"))
        func journal(running: Bool = false, at: String? = nil) -> Journals.Journal {
            .init(path: "a", name: "a", agent: nil, running: running, lastChangeAt: at)
        }
        XCTAssertEqual(Journals.status(journal(running: true), now: now), "running")
        XCTAssertEqual(Journals.status(journal(at: "2026-11-20T11:58:00Z"), now: now), "2 min ago")
        XCTAssertEqual(Journals.status(journal(at: "2026-11-20T09:00:00Z"), now: now), "3 h ago")
        XCTAssertEqual(Journals.status(journal(at: "2026-11-18T12:00:00Z"), now: now), "2 d ago")
        XCTAssertEqual(Journals.status(journal(at: "2026-11-20T11:59:30Z"), now: now), "just now")
        XCTAssertEqual(Journals.status(journal(at: "2026-11-20T12:05:00Z"), now: now), "just now", "a clock ahead")
        XCTAssertEqual(Journals.status(journal(), now: now), "no changes yet")
    }

    func testAMachineThatIsNotMountedIsNotAnOlderServer() {
        let body = Data(#"{"message":"No machine abc is mounted"}"#.utf8)
        XCTAssertEqual(Journals.result(status: 404, body: body), .error("This machine isn’t mounted."))
        XCTAssertEqual(Journals.result(status: 404, body: Data("Not Found".utf8)), .unsupported)
    }

    func testAnAnswerThatIsNotJSONIsAnError() {
        XCTAssertEqual(Journals.result(status: 200, body: Data("<html>".utf8)), .error("The server’s answer wasn’t JSON."))
        XCTAssertEqual(Journals.result(status: 200, body: Data("{}".utf8)), .rooms([]))
    }

    func testRoomsWhosePathClimbsOutAreDropped() {
        let bad = ["../../../api/contents/Users/me/x.ipynb", "a/../../x.ipynb", "./a.ipynb", "a/%2e%2E/b.ipynb",
                   "a\\b.ipynb", "///", "a/.."]
        let rooms = (bad + ["ok/a..b.ipynb"]).map { ["path": $0, "clients": []] as [String: Any] }
        XCTAssertEqual(Journals.parseRooms(["rooms": rooms]).map(\.path), ["ok/a..b.ipynb"])
    }
}
