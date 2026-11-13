@testable import DeviceBridge
import XCTest

/// The app's prompt: records each ask, and the test answers it.
@MainActor
private final class Prompter: LedgerPrompter {
    var asked: [String] = []
    private var answers: [@MainActor (LedgerAnswer?) -> Void] = []

    func askPermission(_ capability: String, notebook: String, id: Int, answer: @escaping @MainActor (LedgerAnswer?) -> Void) {
        asked.append(capability)
        answers.append(answer)
    }

    func dismissPermission(_ id: Int) {}

    func answer(_ answer: LedgerAnswer?) {
        answers.removeFirst()(answer)
    }
}

private final class Opener: URLOpener {
    var opened: [URL] = []
    /// What `open(_:completion:)` reports; nil holds the answer back.
    var succeeds: Bool? = true
    func open(_ url: URL, inApp: Bool) { opened.append(url) }
    func open(_ url: URL, completion: @escaping @MainActor (Bool) -> Void) {
        opened.append(url)
        if let succeeds { completion(succeeds) }
    }
}

/// `device.shortcuts.run` (#40): the Shortcuts URL it opens, and the
/// callbacks that answer it.
@MainActor
final class ShortcutsTests: XCTestCase {
    private var opener: Opener!
    private var calls: ShortcutCalls!
    private var bridge: DeviceBridge!
    private var replies: [Int: [String: Any]] = [:]

    override func setUp() async throws {
        opener = Opener()
        calls = ShortcutCalls(callback: URL(string: "ganymede://device-callback/shortcuts")!)
        bridge = DeviceBridge(urlOpener: opener, ledger: PermissionLedger(store: MemoryLedgerStore()), appVersion: "")
        bridge.addShortcuts(calls)
        bridge.setNotebook("/n/A.ipynb", for: 1)
        for name in ["Log it", "Ping", "A", "B", "Slow"] {
            bridge.ledger.record(.always, notebook: "/n/A.ipynb", capability: DeviceBridge.shortcutCapability(name))
        }
        replies = [:]
    }

    private func run(_ params: [String: Any], id: Int = 1) {
        bridge.respond(to: ["id": id, "owner": 1, "method": "shortcuts.run", "params": params]) { [weak self] in
            self?.replies[id] = $0
        }
    }

    private func code(_ id: Int) -> String? {
        (replies[id]?["error"] as? [String: Any])?["code"] as? String
    }

    /// The callback URL the opened Shortcuts URL names for `outcome`.
    private func callback(_ outcome: String, query: String = "") throws -> URL {
        let opened = try XCTUnwrap(opener.opened.last)
        let items = URLComponents(url: opened, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let base = try XCTUnwrap(items.first { $0.name == "x-\(outcome)" }?.value)
        return try XCTUnwrap(URL(string: base + query))
    }

    func testOpensTheShortcutWithItsInputAndAnswersWithItsResult() throws {
        run(["name": "Log it", "input": "a+b & c"])
        let opened = try XCTUnwrap(opener.opened.first)
        XCTAssertEqual(opened.scheme, "shortcuts")
        XCTAssertEqual(opened.host, "x-callback-url")
        XCTAssertEqual(opened.path, "/run-shortcut")
        let items = URLComponents(url: opened, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(items.first { $0.name == "name" }?.value, "Log it")
        XCTAssertEqual(items.first { $0.name == "input" }?.value, "text")
        XCTAssertEqual(items.first { $0.name == "text" }?.value, "a+b & c")
        XCTAssertFalse(opened.absoluteString.contains("a+b"), "a + is encoded, not left to read as a space")
        XCTAssertNil(replies[1], "waits for the callback")
        XCTAssertTrue(calls.handle(try callback("success", query: "?result=logged%20it")))
        XCTAssertEqual(replies[1]?["result"] as? String, "logged it")
        XCTAssertEqual(calls.waitingCount, 0)
    }

    func testNoInputAndNoOutput() throws {
        run(["name": "Ping"])
        let items = URLComponents(url: try XCTUnwrap(opener.opened.first), resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertNil(items.first { $0.name == "input" })
        XCTAssertTrue(calls.handle(try callback("success")))
        XCTAssertTrue(replies[1]?["result"] is NSNull)
    }

    func testCancelAndErrorReject() throws {
        run(["name": "A"], id: 1)
        XCTAssertTrue(calls.handle(try callback("cancel")))
        XCTAssertEqual(code(1), "cancelled")
        run(["name": "B"], id: 2)
        XCTAssertTrue(calls.handle(try callback("error", query: "?errorMessage=No%20such%20shortcut")))
        XCTAssertEqual(code(2), "failed")
        XCTAssertTrue(((replies[2]?["error"] as? [String: Any])?["message"] as? String)?.contains("No such shortcut") == true)
    }

    func testAnInterruptStopsWaitingAndALateCallbackIsIgnored() throws {
        run(["name": "Slow"])
        let late = try callback("success", query: "?result=late")
        bridge.respond(to: ["id": 1, "owner": 1, "cancel": true]) { _ in }
        XCTAssertEqual(code(1), "cancelled")
        XCTAssertEqual(calls.waitingCount, 0)
        XCTAssertTrue(calls.handle(late), "still ours, so the app does nothing else with it")
        XCTAssertEqual(code(1), "cancelled")
    }

    func testAShortcutsAppThatCantBeOpenedFailsTheCall() throws {
        opener.succeeds = false
        run(["name": "A"])
        XCTAssertEqual(code(1), "unavailable")
        XCTAssertEqual(calls.waitingCount, 0)
    }

    func testAnUnknownOutcomeLeavesTheCallWaiting() throws {
        run(["name": "A"])
        let success = try callback("success", query: "?result=ok")
        let odd = URL(string: success.absoluteString.replacingOccurrences(of: "/success?", with: "/other?"))!
        XCTAssertTrue(calls.handle(odd))
        XCTAssertNil(replies[1])
        XCTAssertTrue(calls.handle(success))
        XCTAssertEqual(replies[1]?["result"] as? String, "ok")
    }

    func testOtherURLsAreNotItsOwn() throws {
        run(["name": "A"])
        XCTAssertFalse(calls.handle(URL(string: "ganymede://open?path=/a.ipynb")!))
        XCTAssertFalse(calls.handle(URL(string: "ganymede://device-callback/other/x/success")!))
        XCTAssertFalse(calls.handle(URL(string: "other://device-callback/shortcuts/x/success")!))
        XCTAssertTrue(calls.handle(URL(string: "ganymede://device-callback/shortcuts/unknown-token/success")!), "a guessed token answers nothing")
        XCTAssertNil(replies[1])
    }

    func testBadArgumentsFailBeforeOpening() {
        run(["name": ""], id: 1)
        run(["name": 3], id: 2)
        run(["name": "A", "input": 4], id: 3)
        run(["name": String(repeating: "x", count: 257)], id: 4)
        XCTAssertEqual([code(1), code(2), code(3), code(4)], ["failed", "failed", "failed", "failed"])
        XCTAssertTrue(opener.opened.isEmpty)
    }

    func testNeedsTheLedgerAndIsListed() {
        XCTAssertTrue(bridge.capabilities.contains("shortcuts.run"))
        XCTAssertTrue(bridge.capabilities.contains("shortcuts.authorizationStatus"))
        bridge.setNotebook("/n/B.ipynb", for: 2)
        bridge.respond(to: ["id": 9, "owner": 2, "method": "shortcuts.run", "params": ["name": "A"]]) { [weak self] in
            self?.replies[9] = $0
        }
        XCTAssertEqual(code(9), "denied", "no prompter and no kept answer")
        XCTAssertTrue(opener.opened.isEmpty)
    }

    func testAlwaysIsKeptPerShortcut() {
        let prompter = Prompter()
        bridge.ledgerPrompter = prompter
        bridge.setNotebook("/n/B.ipynb", for: 2)
        func call(_ id: Int, _ name: String) {
            bridge.respond(to: ["id": id, "owner": 2, "method": "shortcuts.run", "params": ["name": name]]) { [weak self] in
                self?.replies[id] = $0
            }
        }
        call(1, "Log")
        XCTAssertEqual(prompter.asked, ["shortcuts:Log"], "the prompt names the Shortcut")
        prompter.answer(.always)
        XCTAssertEqual(opener.opened.count, 1)
        XCTAssertEqual(bridge.ledger.answer(notebook: "/n/B.ipynb", capability: "shortcuts:Log"), .always)
        XCTAssertNil(bridge.ledger.answer(notebook: "/n/B.ipynb", capability: "shortcuts"))

        call(2, "Log")
        XCTAssertEqual(prompter.asked.count, 1, "the kept answer runs Log again")
        XCTAssertEqual(opener.opened.count, 2)

        call(3, "Delete Everything")
        XCTAssertEqual(prompter.asked, ["shortcuts:Log", "shortcuts:Delete Everything"], "another Shortcut asks")
        prompter.answer(.deny)
        XCTAssertEqual(code(3), "denied")
        XCTAssertEqual(opener.opened.count, 2)
    }

    func testAlwaysForAllShortcutsRunsNone() {
        bridge.setNotebook("/n/B.ipynb", for: 2)
        bridge.ledger.record(.always, notebook: "/n/B.ipynb", capability: "shortcuts")
        bridge.respond(to: ["id": 1, "owner": 2, "method": "shortcuts.run", "params": ["name": "A"]]) { [weak self] in
            self?.replies[1] = $0
        }
        XCTAssertEqual(code(1), "denied", "no prompter, and no answer kept for this Shortcut")
        XCTAssertTrue(opener.opened.isEmpty)
    }

    func testDenyForShortcutsRefusesEveryShortcut() {
        bridge.ledger.record(.deny, notebook: "/n/A.ipynb", capability: "shortcuts")
        run(["name": "A"])
        XCTAssertEqual(code(1), "denied", "a kept deny for shortcuts outranks Always for one")
        XCTAssertTrue(opener.opened.isEmpty)
    }

    func testNoNamespacePromptForShortcuts() {
        let prompter = Prompter()
        bridge.ledgerPrompter = prompter
        bridge.setNotebook("/n/B.ipynb", for: 2)
        XCTAssertEqual(bridge.undecided(["shortcuts", "unknown"], notebook: "/n/B.ipynb"), [], "Allow at open would grant no call")
        bridge.respond(to: ["id": 1, "owner": 2, "method": "shortcuts.requestAuthorization", "params": [:] as [String: Any]]) { [weak self] in
            self?.replies[1] = $0
        }
        XCTAssertTrue(prompter.asked.isEmpty)
        XCTAssertEqual(replies[1]?["result"] as? String, "authorized")
        XCTAssertNil(bridge.ledger.answer(notebook: "/n/B.ipynb", capability: "shortcuts"))
        bridge.ledger.record(.deny, notebook: "/n/B.ipynb", capability: "shortcuts")
        bridge.respond(to: ["id": 2, "owner": 2, "method": "shortcuts.requestAuthorization", "params": [:] as [String: Any]]) { [weak self] in
            self?.replies[2] = $0
        }
        XCTAssertEqual(replies[2]?["result"] as? String, "denied")
    }

    func testTheCapabilityNamesTheShortcut() {
        XCTAssertEqual(DeviceBridge.shortcutCapability("Log: daily"), "shortcuts:Log: daily")
        XCTAssertEqual(DeviceBridge.shortcutName("shortcuts:Log: daily"), "Log: daily")
        XCTAssertNil(DeviceBridge.shortcutName("shortcuts"))
        XCTAssertNil(DeviceBridge.shortcutName("location"))
    }

    func testNotInAHeadlessRun() {
        let device = bridge.engineDevice(headless: true)
        XCTAssertFalse(device.allows("shortcuts.run"))
    }
}
