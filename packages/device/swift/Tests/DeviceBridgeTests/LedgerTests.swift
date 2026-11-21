@testable import DeviceBridge
import XCTest

/// The app's prompt: records each ask, and the test answers it.
@MainActor
private final class FakePrompter: LedgerPrompter {
    var asked: [(capability: String, notebook: String, id: Int)] = []
    var dismissed: [Int] = []
    private var answers: [Int: @MainActor (LedgerAnswer?) -> Void] = [:]

    func askPermission(_ capability: String, notebook: String, id: Int, answer: @escaping @MainActor (LedgerAnswer?) -> Void) {
        asked.append((capability, notebook, id))
        answers[id] = answer
    }

    func dismissPermission(_ id: Int) {
        dismissed.append(id)
        answers[id] = nil
    }

    func answerPrompt(_ id: Int, _ answer: LedgerAnswer?) {
        guard let done = answers.removeValue(forKey: id) else { return XCTFail("no prompt \(id) up") }
        done(answer)
    }

    func answer(_ answer: LedgerAnswer?) {
        guard let last = asked.last, let done = answers.removeValue(forKey: last.id) else { return XCTFail("no prompt up") }
        done(answer)
    }
}

/// A system permission that's already granted, so only the ledger decides.
@MainActor
private final class Granted: Permission {
    var status = PermissionStatus.authorized
    var prompts = 0
    func request(_ done: @escaping @MainActor (PermissionStatus) -> Void) {
        prompts += 1
        done(status)
    }
}

@MainActor
private final class Replies {
    var all: [[String: Any]] = []
    var last: [String: Any]? { all.last }
    lazy var reply: ([String: Any]) -> Void = { [unowned self] in self.all.append($0) }
}

/// The files' stamps, as the test sets them: a path with none has no file.
private final class Files {
    var stamps: [String: String] = [:]
    func stamp(_ path: String) -> String? { stamps[path] }
}

@MainActor
final class LedgerTests: XCTestCase {
    private lazy var prompter = FakePrompter()
    private lazy var store = MemoryLedgerStore()
    private lazy var system = Granted()

    private func bridge(prompter: Bool = true) -> DeviceBridge {
        let bridge = DeviceBridge(clipboard: nil, ledger: PermissionLedger(store: store), appVersion: "")
        if prompter { bridge.ledgerPrompter = self.prompter }
        bridge.setNotebook("/notes/walk.ipynb", for: 1)
        bridge.addPermission("location", system)
        bridge.addMethod("location.current", permission: "location") { _, reply in
            reply(.success("here"))
            return nil
        }
        return bridge
    }

    private func call(_ bridge: DeviceBridge, id: Int, owner: Int = 1, _ method: String = "location.current", into replies: Replies) {
        bridge.respond(to: ["id": id, "owner": owner, "method": method, "params": [:]], reply: replies.reply)
    }

    private func errorCode(_ reply: [String: Any]?) -> String? {
        (reply?["error"] as? [String: Any])?["code"] as? String
    }

    func testAFirstCallAsksOnceAndAlwaysIsKept() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        XCTAssertEqual(prompter.asked.count, 1)
        XCTAssertEqual(prompter.asked[0].capability, "location")
        XCTAssertEqual(prompter.asked[0].notebook, "/notes/walk.ipynb")
        XCTAssertTrue(replies.all.isEmpty, "waits on the person")
        prompter.answer(.always)
        XCTAssertEqual(replies.last?["result"] as? String, "here")
        call(bridge, id: 2, into: replies)
        XCTAssertEqual(prompter.asked.count, 1, "not asked again")
        XCTAssertEqual(replies.last?["result"] as? String, "here")
        XCTAssertEqual(store.saved, [LedgerGrant(notebook: "/notes/walk.ipynb", capability: "location", answer: .always)])
    }

    func testDenyIsKeptAndRejectsWithoutTheSystemPrompt() {
        let bridge = bridge()
        let replies = Replies()
        system.status = .notDetermined
        call(bridge, id: 1, into: replies)
        prompter.answer(.deny)
        XCTAssertEqual(errorCode(replies.last), "denied")
        call(bridge, id: 2, into: replies)
        XCTAssertEqual(errorCode(replies.last), "denied")
        XCTAssertEqual(prompter.asked.count, 1)
        XCTAssertEqual(system.prompts, 0, "the system is never asked")
    }

    func testOnceAllowsThisCallOnly() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        prompter.answer(.once)
        XCTAssertEqual(replies.last?["result"] as? String, "here")
        call(bridge, id: 2, into: replies)
        XCTAssertEqual(prompter.asked.count, 2, "asked again")
        XCTAssertTrue(store.saved.isEmpty)
    }

    func testDismissingThePromptDeniesAndKeepsNothing() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        prompter.answer(nil)
        XCTAssertEqual(errorCode(replies.last), "denied")
        XCTAssertTrue(store.saved.isEmpty)
    }

    func testARevokeTakesEffectOnTheNextCall() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        prompter.answer(.always)
        bridge.ledger.revoke(notebook: "/notes/walk.ipynb", capability: "location")
        XCTAssertTrue(bridge.ledger.grants.isEmpty)
        call(bridge, id: 2, into: replies)
        XCTAssertEqual(prompter.asked.count, 2)
    }

    func testHeadlessRunsUseKeptAnswersAndDenyTheRest() {
        store.saved = [LedgerGrant(notebook: "/notes/walk.ipynb", capability: "location", answer: .always)]
        let bridge = bridge(prompter: false)
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        XCTAssertEqual(replies.last?["result"] as? String, "here", "the kept grant, loaded from the store")
        bridge.setNotebook("/notes/other.ipynb", for: 2)
        call(bridge, id: 2, owner: 2, into: replies)
        XCTAssertEqual(errorCode(replies.last), "denied")
    }

    func testAKernelWithNoNotebookIsDenied() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, owner: 9, into: replies)
        XCTAssertEqual(errorCode(replies.last), "denied")
        XCTAssertTrue(prompter.asked.isEmpty)
    }

    func testACancelDuringThePromptDismissesIt() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        call(bridge, id: 2, into: replies)
        XCTAssertEqual(prompter.asked.count, 1, "both wait on one prompt")
        _ = bridge.handle(["id": 1, "cancel": true])
        XCTAssertEqual(errorCode(replies.last), "cancelled")
        XCTAssertTrue(prompter.dismissed.isEmpty, "call 2 still waits on it")
        _ = bridge.handle(["id": 2, "cancel": true])
        XCTAssertEqual(prompter.dismissed, [prompter.asked[0].id])
        XCTAssertEqual(replies.all.compactMap { errorCode($0) }, ["cancelled", "cancelled"])
    }

    func testAReleaseDismissesItsPrompt() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        _ = bridge.handle(["owner": 1, "release": true])
        XCTAssertEqual(errorCode(replies.last), "cancelled")
        XCTAssertEqual(prompter.dismissed.count, 1)
    }

    func testRequestAuthorizationGoesThroughTheLedger() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, "location.requestAuthorization", into: replies)
        prompter.answer(.deny)
        XCTAssertEqual(replies.last?["result"] as? String, "denied")
        XCTAssertEqual(system.prompts, 0)
    }

    func testARenameKeepsTheGrantsAndTheKernel() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        prompter.answer(.always)
        bridge.notebookMoved(from: "/notes/walk.ipynb", to: "/notes/run.ipynb")
        XCTAssertEqual(bridge.ledger.notebook(for: 1), "/notes/run.ipynb")
        XCTAssertEqual(bridge.ledger.answer(notebook: "/notes/run.ipynb", capability: "location"), .always)
        call(bridge, id: 2, into: replies)
        XCTAssertEqual(prompter.asked.count, 1)
        XCTAssertEqual(replies.last?["result"] as? String, "here")
    }

    func testAReloadForgetsWhichNotebookEachKernelRuns() {
        let bridge = bridge()
        let first = Replies()
        call(bridge, id: 1, into: first)
        prompter.answer(.always)
        XCTAssertEqual(first.last?["result"] as? String, "here")
        // Kernel numbers start over with the page: owner 1 may now run another notebook.
        bridge.dropPage()
        let after = Replies()
        call(bridge, id: 1, into: after)
        XCTAssertEqual(errorCode(after.last), "denied")
        bridge.setNotebook("/notes/walk.ipynb", for: 1)
        bridge.dropAll()
        call(bridge, id: 2, into: after)
        XCTAssertEqual(errorCode(after.last), "denied")
    }

    func testDropRemoteForgetsOnlyRemoteKernels() {
        let bridge = bridge()
        bridge.setNotebook("/notes/remote.ipynb", for: -1)
        bridge.dropRemote()
        XCTAssertNil(bridge.ledger.notebook(for: -1))
        XCTAssertEqual(bridge.ledger.notebook(for: 1), "/notes/walk.ipynb")
    }

    func testARenameOntoOldAnswersReplacesThem() {
        let ledger = PermissionLedger(store: store)
        ledger.record(.always, notebook: "/new.ipynb", capability: "location")
        ledger.record(.always, notebook: "/new.ipynb", capability: "contacts")
        ledger.record(.deny, notebook: "/old.ipynb", capability: "location")
        ledger.move(from: "/old.ipynb", to: "/new.ipynb")
        XCTAssertEqual(ledger.answer(notebook: "/new.ipynb", capability: "location"), .deny)
        XCTAssertEqual(ledger.answer(notebook: "/new.ipynb", capability: "contacts"), .always)
        XCTAssertEqual(ledger.grants.filter { $0.notebook == "/new.ipynb" }.count, 2)
        XCTAssertTrue(ledger.grants.allSatisfy { $0.notebook != "/old.ipynb" })
    }

    func testAnAnswerIsKeptOnceUnderThePathItHasNow() {
        @MainActor final class CountingStore: LedgerStore {
            var saves = 0
            var saved: [LedgerGrant] = []
            func load() -> [LedgerGrant] { saved }
            func save(_ grants: [LedgerGrant]) {
                saves += 1
                saved = grants
            }
        }
        let counting = CountingStore()
        let bridge = DeviceBridge(clipboard: nil, ledger: PermissionLedger(store: counting), appVersion: "")
        bridge.ledgerPrompter = prompter
        bridge.setNotebook("/a.ipynb", for: 1)
        bridge.addPermission("location", system)
        bridge.addMethod("location.current", permission: "location") { _, reply in
            reply(.success("here"))
            return nil
        }
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        call(bridge, id: 2, into: replies)
        bridge.notebookMoved(from: "/a.ipynb", to: "/b.ipynb")
        prompter.answer(.deny)
        XCTAssertEqual(counting.saves, 1, "one save for both waiters")
        XCTAssertEqual(bridge.ledger.answer(notebook: "/b.ipynb", capability: "location"), .deny)
        XCTAssertNil(bridge.ledger.answer(notebook: "/a.ipynb", capability: "location"))
    }

    func testAnAnswerIsKeptUnderThePromptsNotebookEvenIfTheKernelNumberIsReused() {
        let bridge = bridge()
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        // The kernel number now runs another notebook (a reload elsewhere
        // reused it) while the prompt for walk.ipynb is still up.
        bridge.setNotebook("/notes/other.ipynb", for: 1)
        prompter.answer(.deny)
        XCTAssertEqual(bridge.ledger.answer(notebook: "/notes/walk.ipynb", capability: "location"), .deny)
        XCTAssertNil(bridge.ledger.answer(notebook: "/notes/other.ipynb", capability: "location"))
    }

    func testASystemRefusalSkipsTheAppPrompt() {
        let bridge = bridge()
        system.status = .denied
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        XCTAssertEqual(errorCode(replies.last), "denied")
        XCTAssertTrue(prompter.asked.isEmpty)
    }

    func testRequestAuthorizationAfterASystemRefusalSkipsTheAppPrompt() {
        let bridge = bridge()
        system.status = .restricted
        let replies = Replies()
        call(bridge, id: 1, "location.requestAuthorization", into: replies)
        XCTAssertEqual(replies.last?["result"] as? String, "restricted")
        XCTAssertTrue(prompter.asked.isEmpty)
        XCTAssertTrue(bridge.ledger.grants.isEmpty)
    }

    func testARenameOntoAPromptAlreadyUpJoinsIt() {
        let bridge = bridge()
        bridge.setNotebook("/notes/old.ipynb", for: 2)
        let first = Replies()
        let second = Replies()
        call(bridge, id: 1, into: first)
        call(bridge, id: 2, owner: 2, into: second)
        XCTAssertEqual(prompter.asked.count, 2)
        let moved = prompter.asked[1].id
        bridge.notebookMoved(from: "/notes/old.ipynb", to: "/notes/walk.ipynb")
        XCTAssertEqual(prompter.dismissed, [moved])
        // The prompt still up (walk.ipynb's) answers both calls.
        prompter.answerPrompt(prompter.asked[0].id, .always)
        XCTAssertEqual(first.last?["result"] as? String, "here")
        XCTAssertEqual(second.last?["result"] as? String, "here")
        XCTAssertEqual(bridge.ledger.grants.count, 1)
    }

    func testAuthorizationStatusReadsTheLedgersRefusal() {
        let bridge = bridge()
        let status = { (owner: Int) in
            bridge.handle(["id": 9, "owner": owner, "method": "location.authorizationStatus", "params": [:]])["result"] as? String
        }
        XCTAssertEqual(status(1), "authorized", "nothing kept: the system status")
        XCTAssertEqual(status(2), "denied", "no notebook")
        bridge.ledger.record(.deny, notebook: "/notes/walk.ipynb", capability: "location")
        XCTAssertEqual(status(1), "denied", "kept deny")
        XCTAssertTrue(prompter.asked.isEmpty)
    }

    func testDeclarationsListWhatIsStillToAsk() {
        store.saved = [LedgerGrant(notebook: "/n.ipynb", capability: "location", answer: .deny)]
        let bridge = bridge()
        bridge.addPermission("contacts", Granted())
        XCTAssertEqual(
            bridge.undecided(["location", "contacts", "contacts", "bluetooth"], notebook: "/n.ipynb"),
            ["contacts"],
            "location has an answer; bluetooth isn't in this app"
        )
    }

    func testPickersSkipTheLedger() {
        // No notebook and no prompter: a permissioned call would be denied,
        // but methods without a permission never reach the ledger.
        let bridge = DeviceBridge(clipboard: nil, ledger: PermissionLedger(store: store), appVersion: "")
        XCTAssertNil(bridge.handle(["id": 1, "owner": 5, "method": "info", "params": [:]])["error"])
        XCTAssertTrue(prompter.asked.isEmpty)
    }

    /// An app with a bridge per window, and a Settings screen, makes a
    /// ledger for each on one store: an answer or revoke in one is seen by
    /// the others, while each keeps its own owners.
    func testLedgersOnOneStoreShareAnswersButNotOwners() {
        let one = PermissionLedger(store: store)
        let two = PermissionLedger(store: store)
        one.record(.always, notebook: "/a.ipynb", capability: "location")
        XCTAssertEqual(two.answer(notebook: "/a.ipynb", capability: "location"), .always)
        two.revoke(notebook: "/a.ipynb")
        XCTAssertNil(one.answer(notebook: "/a.ipynb", capability: "location"))
        XCTAssertTrue(one.grants.isEmpty)

        two.record(.deny, notebook: "/b.ipynb", capability: "contacts")
        one.move(from: "/b.ipynb", to: "/c.ipynb")
        XCTAssertEqual(two.answer(notebook: "/c.ipynb", capability: "contacts"), .deny)

        one.setNotebook("/a.ipynb", for: 1)
        two.setNotebook("/b.ipynb", for: 1)
        XCTAssertEqual(one.notebook(for: 1), "/a.ipynb")
        XCTAssertEqual(two.notebook(for: 1), "/b.ipynb")
    }

    func testTheUserDefaultsStoreKeepsAlwaysAndDeny() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "ganymede.device.ledger.test"))
        defaults.removePersistentDomain(forName: "ganymede.device.ledger.test")
        let store = UserDefaultsLedgerStore(defaults: defaults)
        let grants = [
            LedgerGrant(notebook: "/a.ipynb", capability: "location", answer: .always),
            LedgerGrant(notebook: "/b.ipynb", capability: "contacts", answer: .deny),
        ]
        store.save(grants)
        XCTAssertEqual(store.load(), grants)
        defaults.removePersistentDomain(forName: "ganymede.device.ledger.test")
    }

    // MARK: Answers follow the file (#584)

    private func makeLedger(_ files: Files, store: LedgerStore? = nil) -> PermissionLedger {
        PermissionLedger(store: store ?? self.store, stamp: files.stamp)
    }

    func testAnAnswerIsForgottenWhenTheFileChangesOutsideTheApp() {
        let files = Files()
        files.stamps["/n.ipynb"] = "1:10:100"
        let ledger = makeLedger(files)
        ledger.record(.always, notebook: "/n.ipynb", capability: "location")
        ledger.record(.deny, notebook: "/n.ipynb", capability: "contacts")
        XCTAssertEqual(store.saved.map(\.stamp), ["1:10:100", "1:10:100"], "kept with the file's stamp")
        XCTAssertEqual(ledger.answer(notebook: "/n.ipynb", capability: "location"), .always)
        XCTAssertEqual(ledger.answer(notebook: "/n.ipynb", capability: "contacts"), .deny)
        // Replaced by rename: same size and time, another inode.
        files.stamps["/n.ipynb"] = "1:10:101"
        XCTAssertNil(ledger.answer(notebook: "/n.ipynb", capability: "location"))
        XCTAssertNil(ledger.answer(notebook: "/n.ipynb", capability: "contacts"))
        XCTAssertTrue(ledger.grants.isEmpty)
        XCTAssertTrue(store.saved.isEmpty, "dropped from the store too")
        XCTAssertEqual(ledger.undecided(["location", "contacts"], notebook: "/n.ipynb"), ["location", "contacts"])
    }

    func testACallAsksAgainAfterTheFileChanges() {
        let files = Files()
        files.stamps["/notes/walk.ipynb"] = "5:1:7"
        let bridge = DeviceBridge(clipboard: nil, ledger: makeLedger(files), appVersion: "")
        bridge.ledgerPrompter = prompter
        bridge.setNotebook("/notes/walk.ipynb", for: 1)
        bridge.addPermission("location", system)
        bridge.addMethod("location.current", permission: "location") { _, reply in
            reply(.success("here"))
            return nil
        }
        let replies = Replies()
        call(bridge, id: 1, into: replies)
        prompter.answer(.always)
        call(bridge, id: 2, into: replies)
        XCTAssertEqual(prompter.asked.count, 1, "the file is as it was: not asked")
        files.stamps["/notes/walk.ipynb"] = "6:2:7"
        call(bridge, id: 3, into: replies)
        XCTAssertEqual(prompter.asked.count, 2, "the file changed: asked again")
        prompter.answer(.deny)
        XCTAssertEqual(errorCode(replies.last), "denied")
        files.stamps["/notes/walk.ipynb"] = "6:3:8"
        call(bridge, id: 4, into: replies)
        XCTAssertEqual(prompter.asked.count, 3, "a deny is forgotten too")
    }

    func testAnUnchangedFileKeepsItsAnswers() {
        let files = Files()
        files.stamps["/n.ipynb"] = "1:10:100"
        let ledger = makeLedger(files)
        ledger.record(.always, notebook: "/n.ipynb", capability: "location")
        for _ in 0..<3 {
            XCTAssertEqual(ledger.answer(notebook: "/n.ipynb", capability: "location"), .always)
        }
        XCTAssertEqual(store.saved, [LedgerGrant(notebook: "/n.ipynb", capability: "location", answer: .always, stamp: "1:10:100")])
    }

    func testTheAppsOwnSaveKeepsTheAnswers() {
        let files = Files()
        files.stamps["/n.ipynb"] = "1:10:100"
        files.stamps["/other.ipynb"] = "9:9:9"
        let ledger = makeLedger(files)
        ledger.record(.always, notebook: "/n.ipynb", capability: "location")
        ledger.record(.deny, notebook: "/other.ipynb", capability: "location")
        // The app saved (a rename over the file): restamp.
        files.stamps["/n.ipynb"] = "2:20:101"
        ledger.restamp(notebook: "/n.ipynb")
        XCTAssertEqual(ledger.answer(notebook: "/n.ipynb", capability: "location"), .always)
        XCTAssertEqual(store.saved.first { $0.notebook == "/n.ipynb" }?.stamp, "2:20:101")
        XCTAssertEqual(store.saved.first { $0.notebook == "/other.ipynb" }?.stamp, "9:9:9", "other notebooks are left alone")
        // Then it is replaced from outside.
        files.stamps["/n.ipynb"] = "3:30:102"
        XCTAssertNil(ledger.answer(notebook: "/n.ipynb", capability: "location"))
        XCTAssertEqual(ledger.answer(notebook: "/other.ipynb", capability: "location"), .deny)
    }

    func testRestampWithNoFileLeavesTheAnswers() {
        let files = Files()
        files.stamps["/n.ipynb"] = "1:10:100"
        let ledger = makeLedger(files)
        ledger.record(.always, notebook: "/n.ipynb", capability: "location")
        files.stamps["/n.ipynb"] = nil
        ledger.restamp(notebook: "/n.ipynb")
        XCTAssertEqual(store.saved.first?.stamp, "1:10:100")
    }

    func testCheckForgetsOnlyThatNotebooksStaleAnswers() {
        let files = Files()
        files.stamps = ["/a.ipynb": "1:1:1", "/b.ipynb": "2:2:2"]
        let ledger = makeLedger(files)
        ledger.record(.always, notebook: "/a.ipynb", capability: "location")
        ledger.record(.always, notebook: "/b.ipynb", capability: "location")
        files.stamps = ["/a.ipynb": "1:1:9", "/b.ipynb": "2:2:9"]
        ledger.check(notebook: "/a.ipynb")
        XCTAssertEqual(store.saved.map(\.notebook), ["/b.ipynb"], "a's is gone from the store; b's is not looked at")
    }

    func testAMissingFileKeepsItsAnswersAndARenameCarriesThemWithTheirStamp() {
        let files = Files()
        files.stamps["/old.ipynb"] = "4:40:400"
        let ledger = makeLedger(files)
        ledger.record(.always, notebook: "/old.ipynb", capability: "location")
        // The server renamed the file before the app moved the answers.
        files.stamps["/old.ipynb"] = nil
        files.stamps["/new.ipynb"] = "4:40:400"
        XCTAssertEqual(ledger.answer(notebook: "/old.ipynb", capability: "location"), .always, "no file: kept as it is")
        ledger.move(from: "/old.ipynb", to: "/new.ipynb")
        XCTAssertEqual(store.saved, [LedgerGrant(notebook: "/new.ipynb", capability: "location", answer: .always, stamp: "4:40:400")])
        XCTAssertEqual(ledger.answer(notebook: "/new.ipynb", capability: "location"), .always, "the renamed file is the same file")
    }

    func testARenamedFileThatWasChangedAfterwardsForgetsItsAnswers() {
        let files = Files()
        files.stamps["/old.ipynb"] = "4:40:400"
        let ledger = makeLedger(files)
        ledger.record(.always, notebook: "/old.ipynb", capability: "location")
        files.stamps["/old.ipynb"] = nil
        files.stamps["/new.ipynb"] = "4:40:400"
        ledger.move(from: "/old.ipynb", to: "/new.ipynb")
        files.stamps["/new.ipynb"] = "5:50:500"
        XCTAssertNil(ledger.answer(notebook: "/new.ipynb", capability: "location"))
    }

    func testADifferentFileAtAMissingNotebooksPathForgetsItsAnswers() {
        let files = Files()
        files.stamps["/n.ipynb"] = "1:10:100"
        let ledger = makeLedger(files)
        ledger.record(.always, notebook: "/n.ipynb", capability: "location")
        files.stamps["/n.ipynb"] = nil
        XCTAssertEqual(ledger.answer(notebook: "/n.ipynb", capability: "location"), .always)
        files.stamps["/n.ipynb"] = "1:10:222"
        XCTAssertNil(ledger.answer(notebook: "/n.ipynb", capability: "location"))
    }

    func testAnAnswerWithNoStampTakesTheFilesOnFirstRead() {
        let files = Files()
        files.stamps["/n.ipynb"] = "1:10:100"
        store.saved = [LedgerGrant(notebook: "/n.ipynb", capability: "location", answer: .always)]
        let ledger = makeLedger(files)
        XCTAssertEqual(ledger.answer(notebook: "/n.ipynb", capability: "location"), .always)
        XCTAssertEqual(store.saved.first?.stamp, "1:10:100")
        files.stamps["/n.ipynb"] = "1:10:101"
        XCTAssertNil(ledger.answer(notebook: "/n.ipynb", capability: "location"), "stamped, so now it can go stale")
    }

    func testAnAnswerKeptBeforeTheFileWasThereIsStampedWhenItAppears() {
        let files = Files()
        let ledger = makeLedger(files)
        ledger.record(.deny, notebook: "/n.ipynb", capability: "location")
        XCTAssertNil(store.saved.first?.stamp)
        XCTAssertEqual(ledger.answer(notebook: "/n.ipynb", capability: "location"), .deny, "no file: kept")
        XCTAssertNil(store.saved.first?.stamp)
        files.stamps["/n.ipynb"] = "1:10:100"
        XCTAssertEqual(ledger.answer(notebook: "/n.ipynb", capability: "location"), .deny)
        XCTAssertEqual(store.saved.first?.stamp, "1:10:100")
    }

    func testReadsSaveOnlyWhenSomethingChanged() {
        @MainActor final class CountingStore: LedgerStore {
            var saves = 0
            var saved: [LedgerGrant] = []
            func load() -> [LedgerGrant] { saved }
            func save(_ grants: [LedgerGrant]) {
                saves += 1
                saved = grants
            }
        }
        let counting = CountingStore()
        let files = Files()
        files.stamps["/n.ipynb"] = "1:10:100"
        let ledger = makeLedger(files, store: counting)
        ledger.record(.always, notebook: "/n.ipynb", capability: "location")
        XCTAssertEqual(counting.saves, 1)
        _ = ledger.grants
        _ = ledger.answer(notebook: "/n.ipynb", capability: "location")
        ledger.check(notebook: "/n.ipynb")
        ledger.restamp(notebook: "/n.ipynb")
        XCTAssertEqual(counting.saves, 1, "nothing changed, nothing saved")
        files.stamps["/n.ipynb"] = "1:10:101"
        _ = ledger.grants
        XCTAssertEqual(counting.saves, 2)
    }

    func testTheUserDefaultsStoreKeepsTheStampAndLoadsRowsWithoutOne() throws {
        let suite = "ganymede.device.ledger.stamp.test"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsLedgerStore(defaults: defaults)
        let grants = [
            LedgerGrant(notebook: "/a.ipynb", capability: "location", answer: .always, stamp: "1:2:3"),
            LedgerGrant(notebook: "/b.ipynb", capability: "contacts", answer: .deny),
        ]
        store.save(grants)
        XCTAssertEqual(store.load(), grants)
        XCTAssertEqual(store.load().map(\.stamp), ["1:2:3", nil])
        // Rows written before stamps have no such key.
        defaults.set([["notebook": "/c.ipynb", "capability": "camera", "answer": "always"]], forKey: store.key)
        XCTAssertEqual(store.load(), [LedgerGrant(notebook: "/c.ipynb", capability: "camera", answer: .always)])
    }
}
