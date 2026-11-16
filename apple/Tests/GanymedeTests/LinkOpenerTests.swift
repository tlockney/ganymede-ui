import XCTest

/// What a `ganymede://open` link does on iPad and iPhone (#640): opens in
/// the open folder, asks before switching to a granted one, and says how
/// to grant a folder, with the app's actions replaced by recorders.
final class LinkOpenerTests: XCTestCase {
    private var base = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        base = FileManager.default.temporaryDirectory
            .appendingPathComponent("LinkOpenerTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: base)
    }

    @discardableResult
    private func folder(_ name: String) throws -> URL {
        let url = base.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @discardableResult
    private func file(_ name: String, in folder: URL) throws -> URL {
        let url = folder.appendingPathComponent(name)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{}".utf8).write(to: url)
        return url
    }

    private func real(_ url: URL) -> String { AppURL.resolvedURL(url).path }

    private func link(_ route: String, _ items: [String: String]) throws -> URL {
        var parts = URLComponents()
        parts.scheme = "ganymede"
        parts.host = route
        parts.queryItems = items.map { URLQueryItem(name: $0.key, value: $0.value) }
        return try XCTUnwrap(parts.url)
    }

    /// The open folder, a vault with a notebook at `n/a.ipynb`, and an
    /// opener whose store holds only what a test adds.
    @MainActor
    private struct Fixture {
        var root: URL
        var vault: URL
        var note: URL
        var store: LinkFolderStore
        var opener: LinkOpener
    }

    @MainActor
    private func fixture(granting: Bool) throws -> Fixture {
        let suite = "LinkOpenerTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let note = try file("n/a.ipynb", in: vault)
        let store = LinkFolderStore(defaults: defaults)
        if granting { try store.add(vault) }
        return Fixture(root: root, vault: vault, note: note, store: store, opener: LinkOpener(store: store))
    }

    @MainActor
    private func switchRequest(_ notice: LinkOpener.Notice?) throws -> LinkOpener.FolderSwitch {
        guard case .switchFolder(let change)? = notice?.action else {
            XCTFail("not a folder switch: \(String(describing: notice?.title))")
            throw LinkFolderError.notGranted
        }
        return change
    }

    // MARK: Routing

    func testShortcutsCallbacksAreKeptApart() throws {
        XCTAssertTrue(LinkOpener.isShortcutsCallback(try XCTUnwrap(URL(string: "ganymede://device-callback/shortcuts/t/success?result=1"))))
        XCTAssertTrue(LinkOpener.isShortcutsCallback(try XCTUnwrap(URL(string: "ganymede://DEVICE-CALLBACK/shortcuts/t/error"))))
        XCTAssertFalse(LinkOpener.isShortcutsCallback(try XCTUnwrap(URL(string: "ganymede://open?path=/a.ipynb"))))
        XCTAssertFalse(LinkOpener.isShortcutsCallback(try XCTUnwrap(URL(string: "ganymede://x-callback-url/open?path=/a"))))
        XCTAssertFalse(LinkOpener.isShortcutsCallback(try XCTUnwrap(URL(string: "ganymede://run?path=/device-callback"))))
    }

    // MARK: Opening

    @MainActor
    func testFileInTheOpenFolderOpensAtOnce() throws {
        let f = try fixture(granting: false)
        try file("a.ipynb", in: f.root)
        var shown: [String] = []
        f.opener.handle(try link("open", ["path": "a.ipynb"]), root: f.root, openFiles: { [] }) { shown.append($0) }
        XCTAssertEqual(shown, ["a.ipynb"])
        XCTAssertNil(f.opener.notice)
        // The folder form too, and a file under the open folder that a
        // grant inside it also holds.
        let sub = try folder("Documents/Sub")
        try file("b.ipynb", in: sub)
        try f.store.add(sub)
        f.opener.handle(try link("open", ["folder": "Sub", "file": "b.ipynb"]), root: f.root, openFiles: { [] }) { shown.append($0) }
        XCTAssertEqual(shown, ["a.ipynb", "Sub/b.ipynb"])
        XCTAssertNil(f.opener.notice)
    }

    @MainActor
    func testFileInAnotherGrantedFolderAsksBeforeSwitching() throws {
        let f = try fixture(granting: true)
        var shown: [String] = []
        f.opener.handle(try link("open", ["folder": "Vault", "file": "n/a.ipynb"]), root: f.root, openFiles: { [] }) { shown.append($0) }
        XCTAssertEqual(shown, [])
        XCTAssertEqual(f.opener.notice?.title, "Open “a” from “Vault”?")
        XCTAssertEqual(
            f.opener.notice?.message,
            "Ganymede will switch from the folder “Documents” to “Vault”. Kernels running in “Documents” stop."
        )
        let change = try switchRequest(f.opener.notice)
        XCTAssertEqual(change.apiPath, "n/a.ipynb")
        XCTAssertEqual(real(change.folder), real(f.vault))
    }

    @MainActor
    func testFileInNoGrantedFolderOffersToGrant() throws {
        let f = try fixture(granting: false)
        let request = try link("open", ["path": f.note.path])
        var shown: [String] = []
        f.opener.handle(request, root: f.root, openFiles: { [] }) { shown.append($0) }
        XCTAssertEqual(shown, [])
        XCTAssertEqual(f.opener.notice?.title, "Ganymede can’t open this file")
        XCTAssertEqual(f.opener.notice?.message, LinkFolderError.notGranted.errorDescription)
        guard case .grant(let again)? = f.opener.notice?.action else { return XCTFail("no grant button") }
        XCTAssertEqual(again.command, .open(path: f.note.path))
        // A missing file outside the folders gets the same answer.
        f.opener.notice = nil
        f.opener.handle(try link("open", ["path": base.appendingPathComponent("Vault/none.ipynb").path]), root: f.root, openFiles: { [] }) { shown.append($0) }
        XCTAssertEqual(f.opener.notice?.message, LinkFolderError.notGranted.errorDescription)
    }

    @MainActor
    func testErrorsInAGrantedFolderArePlain() throws {
        let f = try fixture(granting: true)
        try file("c.txt", in: f.vault)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "c.txt"]), root: f.root, openFiles: { [] }) { _ in XCTFail("opened") }
        XCTAssertEqual(f.opener.notice?.title, "Ganymede couldn’t open the link")
        XCTAssertEqual(f.opener.notice?.message, LinkFolderError.notNotebook("c.txt").errorDescription)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "none.ipynb"]), root: f.root, openFiles: { [] }) { _ in XCTFail("opened") }
        XCTAssertEqual(f.opener.notice?.message, LinkFolderError.notFound("none.ipynb").errorDescription)
    }

    @MainActor
    func testBadLinksAreReported() throws {
        let f = try fixture(granting: false)
        f.opener.handle(try link("open", [:]), root: f.root, openFiles: { [] }) { _ in XCTFail("opened") }
        XCTAssertEqual(f.opener.notice?.message, "The URL needs “path”.")
        f.opener.handle(try link("delete", ["path": "/a"]), root: f.root, openFiles: { [] }) { _ in XCTFail("opened") }
        XCTAssertEqual(f.opener.notice?.message, AppURLError.unknownRoute("delete").errorDescription)
    }

    @MainActor
    func testRunAndNewWorkOnlyOnTheMac() throws {
        let f = try fixture(granting: true)
        for (route, items) in [("run", ["path": "a.ipynb"]), ("new", ["dir": "x"])] {
            f.opener.notice = nil
            f.opener.handle(try link(route, items), root: f.root, openFiles: { [] }) { _ in XCTFail("opened") }
            XCTAssertEqual(f.opener.notice?.message, "“\(route)” links work only on the Mac.")
            XCTAssertEqual(f.opener.notice?.title, "Ganymede couldn’t open the link")
        }
    }

    // MARK: iCloud

    @MainActor
    func testAnEvictedNotebookStartsDownloading() throws {
        let suite = "LinkOpenerTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let root = try folder("Documents")
        let vault = try folder("Vault")
        try Data().write(to: vault.appendingPathComponent(".n.ipynb.icloud"))
        let store = LinkFolderStore(defaults: defaults)
        try store.add(vault)
        var started: [URL] = []
        let opener = LinkOpener(store: store, isUbiquitous: { _ in true }, startDownload: { started.append($0) })
        opener.handle(try link("open", ["folder": "Vault", "file": "n.ipynb"]), root: root, openFiles: { [] }) { _ in XCTFail("opened") }
        XCTAssertEqual(opener.notice?.message, LinkFolderError.downloading("n.ipynb").errorDescription)
        XCTAssertEqual(started.map { real($0) }, [real(vault.appendingPathComponent("n.ipynb"))])
        // Outside the folders, the same file is only not granted: no download.
        started = []
        opener.handle(try link("open", ["path": base.appendingPathComponent("Documents/../Elsewhere/n.ipynb").path]), root: root, openFiles: { [] }) { _ in }
        XCTAssertEqual(opener.notice?.message, LinkFolderError.notGranted.errorDescription)
        XCTAssertEqual(started, [])
    }

    @MainActor
    func testAStrayPlaceholderIsJustMissing() throws {
        let suite = "LinkOpenerTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let root = try folder("Documents")
        let vault = try folder("Vault")
        try Data().write(to: vault.appendingPathComponent(".n.ipynb.icloud"))
        let store = LinkFolderStore(defaults: defaults)
        try store.add(vault)
        var started: [URL] = []
        // iCloud doesn't manage it: a hidden file of that name is a file.
        let opener = LinkOpener(store: store, isUbiquitous: { _ in false }, startDownload: { started.append($0) })
        opener.handle(try link("open", ["folder": "Vault", "file": "n.ipynb"]), root: root, openFiles: { [] }) { _ in XCTFail("opened") }
        XCTAssertEqual(opener.notice?.message, LinkFolderError.notFound("n.ipynb").errorDescription)
        XCTAssertEqual(started, [])
    }

    // MARK: Switching folders

    @MainActor
    func testASwitchIsRefusedWhileATextFileIsOpen() throws {
        let f = try fixture(granting: true)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "n/a.ipynb"]), root: f.root, openFiles: { ["/Documents/src/main.py"] }) {
            _ in XCTFail("opened")
        }
        XCTAssertEqual(f.opener.notice?.message, LinkFolderError.openFile("main.py").errorDescription)
        XCTAssertEqual(
            f.opener.notice?.message,
            "Close “main.py” first: Ganymede switches folders by restarting, and open files would save into the new folder."
        )
        guard case .dismiss? = f.opener.notice?.action else { return XCTFail("a plain notice") }
        // A notebook in the open folder doesn't need the switch.
        try file("a.ipynb", in: f.root)
        var shown: [String] = []
        f.opener.handle(try link("open", ["path": "a.ipynb"]), root: f.root, openFiles: { ["/Documents/src/main.py"] }) { shown.append($0) }
        XCTAssertEqual(shown, ["a.ipynb"])
    }

    @MainActor
    func testTheSwitchPathIsWorkedOutInsideTheFoldersAccess() throws {
        let f = try fixture(granting: true)
        try file("deep/er/b.ipynb", in: f.vault)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "deep/er/../er/b.ipynb"]), root: f.root, openFiles: { [] }) { _ in }
        XCTAssertEqual(try switchRequest(f.opener.notice).apiPath, "deep/er/b.ipynb")
    }

    @MainActor
    func testNoticesAfterAPickerOrAnActionWaitForTheScheduler() throws {
        let suite = "LinkOpenerTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let note = try file("n/a.ipynb", in: vault)
        let store = LinkFolderStore(defaults: defaults)
        var queued: [@MainActor () -> Void] = []
        let opener = LinkOpener(store: store, later: { queued.append($0) })
        // Right away: a link's own answer.
        opener.handle(try link("open", ["path": note.path]), root: root, openFiles: { [] }) { _ in }
        XCTAssertEqual(opener.notice?.title, "Ganymede can’t open this file")
        XCTAssertTrue(queued.isEmpty)
        // After the picker: the retry's notice waits.
        opener.notice = nil
        opener.beginGrant(for: try AppURL(try link("open", ["path": note.path])))
        opener.picked(.success(vault), root: root, openFiles: { [] }) { _ in }
        XCTAssertNil(opener.notice)
        XCTAssertEqual(queued.count, 1)
        queued.removeFirst()()
        let change = try switchRequest(opener.notice)
        // From an alert's action: the failure waits too.
        store.remove(try XCTUnwrap(store.folders.first).id)
        opener.notice = nil
        opener.confirm(change) { _ in XCTFail("opened") }
        XCTAssertNil(opener.notice)
        XCTAssertEqual(queued.count, 1)
        queued.removeFirst()()
        XCTAssertEqual(opener.notice?.message, LinkFolderError.notGranted.errorDescription)
        // And a picker's failure.
        opener.notice = nil
        opener.picked(.failure(CocoaError(.fileReadNoPermission)), root: root, openFiles: { [] }) { _ in }
        XCTAssertNil(opener.notice)
        queued.removeFirst()()
        XCTAssertEqual(opener.notice?.title, "Ganymede couldn’t add the folder")
    }

    @MainActor
    func testALinkThatLeavesItsFolderOffersNoGrant() throws {
        let f = try fixture(granting: true)
        try file("secret.ipynb", in: base)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "../secret.ipynb"]), root: f.root, openFiles: { [] }) {
            _ in XCTFail("opened")
        }
        XCTAssertEqual(f.opener.notice?.message, LinkFolderError.badPath("../secret.ipynb").errorDescription)
        guard case .dismiss? = f.opener.notice?.action else { return XCTFail("no Grant Access…") }
    }

    @MainActor
    func testConfirmOpensTheGrantedFolder() throws {
        let f = try fixture(granting: true)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "n/a.ipynb"]), root: f.root, openFiles: { [] }) { _ in }
        let change = try switchRequest(f.opener.notice)
        var opened: [URL] = []
        f.opener.confirm(change) { opened.append($0) }
        XCTAssertEqual(opened.map(real), [real(f.vault)])
        XCTAssertEqual(f.opener.pending?.apiPath, "n/a.ipynb")
    }

    @MainActor
    func testConfirmAfterRevokeOpensNothing() throws {
        let f = try fixture(granting: true)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "n/a.ipynb"]), root: f.root, openFiles: { [] }) { _ in }
        let change = try switchRequest(f.opener.notice)
        f.store.remove(try XCTUnwrap(f.store.folders.first).id)
        var opened: [URL] = []
        f.opener.confirm(change) { opened.append($0) }
        XCTAssertEqual(opened, [])
        XCTAssertNil(f.opener.pending)
        XCTAssertEqual(f.opener.notice?.message, LinkFolderError.notGranted.errorDescription)
    }

    @MainActor
    func testTheNotebookOpensWhenTheNewFoldersPageIsReady() throws {
        let f = try fixture(granting: true)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "n/a.ipynb"]), root: f.root, openFiles: { [] }) { _ in }
        f.opener.confirm(try switchRequest(f.opener.notice)) { _ in }
        var shown: [String] = []
        // Ready while the old folder's server runs (its start was still
        // queued at a cold launch) or none does: the notebook keeps waiting.
        f.opener.pageReady(served: f.root) { shown.append($0) }
        f.opener.pageReady(served: nil) { shown.append($0) }
        XCTAssertEqual(shown, [])
        XCTAssertNotNil(f.opener.pending)
        // Then the new folder's server is up.
        f.opener.pageReady(served: f.vault) { shown.append($0) }
        XCTAssertEqual(shown, ["n/a.ipynb"])
        XCTAssertNil(f.opener.pending)
        f.opener.pageReady(served: f.vault) { shown.append($0) }
        XCTAssertEqual(shown, ["n/a.ipynb"], "once")
    }

    @MainActor
    func testAnotherRootCancelsTheWaitingNotebook() throws {
        let f = try fixture(granting: true)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "n/a.ipynb"]), root: f.root, openFiles: { [] }) { _ in }
        f.opener.confirm(try switchRequest(f.opener.notice)) { _ in }
        // The folder the notebook waits for becoming the root keeps it.
        f.opener.rootChanged(to: f.vault)
        XCTAssertNotNil(f.opener.pending)
        f.opener.rootChanged(to: try folder("Other"))
        XCTAssertNil(f.opener.pending)
        var shown: [String] = []
        f.opener.pageReady(served: f.vault) { shown.append($0) }
        XCTAssertEqual(shown, [])
    }

    @MainActor
    func testAServerThatDoesNotStartCancelsTheWaitingNotebook() throws {
        let f = try fixture(granting: true)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "n/a.ipynb"]), root: f.root, openFiles: { [] }) { _ in }
        f.opener.confirm(try switchRequest(f.opener.notice)) { _ in }
        f.opener.startFailed()
        var shown: [String] = []
        f.opener.pageReady(served: f.vault) { shown.append($0) }
        XCTAssertEqual(shown, [])
    }

    @MainActor
    func testANewLinkCancelsTheWaitingNotebook() throws {
        let f = try fixture(granting: true)
        f.opener.handle(try link("open", ["folder": "Vault", "file": "n/a.ipynb"]), root: f.root, openFiles: { [] }) { _ in }
        f.opener.confirm(try switchRequest(f.opener.notice)) { _ in }
        f.opener.handle(try link("run", ["path": "x"]), root: f.root, openFiles: { [] }) { _ in }
        XCTAssertNil(f.opener.pending)
    }

    // MARK: Granting

    @MainActor
    func testPickingTheFolderKeepsItAndTriesTheLinkOnce() throws {
        let f = try fixture(granting: false)
        f.opener.handle(try link("open", ["path": f.note.path]), root: f.root, openFiles: { [] }) { _ in XCTFail("opened") }
        guard case .grant(let request)? = f.opener.notice?.action else { return XCTFail("no grant button") }
        f.opener.notice = nil
        f.opener.beginGrant(for: request)
        f.opener.picked(.success(f.vault), root: f.root, openFiles: { [] }) { _ in XCTFail("not in the open folder") }
        XCTAssertEqual(f.store.folders.map(\.name), ["Vault"])
        // Granted now, but not the open folder: the link asks to switch.
        XCTAssertEqual(try switchRequest(f.opener.notice).apiPath, "n/a.ipynb")
        // Tried once: a second pick has no link to try.
        f.opener.notice = nil
        f.opener.picked(.success(try folder("Other")), root: f.root, openFiles: { [] }) { _ in XCTFail("opened") }
        XCTAssertNil(f.opener.notice)
    }

    @MainActor
    func testPickingTheOpenFolderOpensTheLink() throws {
        // The folder picked holds the file and is the one the app serves:
        // the link opens at once, with no question.
        let f = try fixture(granting: false)
        f.opener.beginGrant(for: try AppURL(try link("open", ["path": f.note.path])))
        var shown: [String] = []
        f.opener.picked(.success(f.vault), root: f.vault, openFiles: { [] }) { shown.append($0) }
        XCTAssertEqual(shown, ["n/a.ipynb"])
        XCTAssertEqual(f.store.folders.count, 1)
    }

    @MainActor
    func testPickingAnotherFolderAsksAgain() throws {
        let f = try fixture(granting: false)
        let request = try AppURL(try link("open", ["path": f.note.path]))
        f.opener.beginGrant(for: request)
        let other = try folder("Other")
        f.opener.picked(.success(other), root: f.root, openFiles: { [] }) { _ in XCTFail("opened") }
        XCTAssertEqual(f.store.folders.map(\.name), ["Other"])
        XCTAssertEqual(f.opener.notice?.title, "Ganymede can’t open this file")
        guard case .grant(let again)? = f.opener.notice?.action else { return XCTFail("no grant button") }
        XCTAssertEqual(again, request)
    }

    @MainActor
    func testPickerAnswersThatAreNotFolders() throws {
        let f = try fixture(granting: false)
        f.opener.beginGrant(for: try AppURL(try link("open", ["path": f.note.path])))
        f.opener.picked(.failure(CocoaError(.userCancelled)), root: f.root, openFiles: { [] }) { _ in }
        XCTAssertNil(f.opener.notice, "cancelled")
        f.opener.beginGrant(for: try AppURL(try link("open", ["path": f.note.path])))
        f.opener.picked(.failure(CocoaError(.fileReadNoPermission)), root: f.root, openFiles: { [] }) { _ in }
        XCTAssertEqual(f.opener.notice?.title, "Ganymede couldn’t add the folder")
        // A folder that can't be kept is reported, and the link isn't tried.
        f.opener.notice = nil
        f.opener.beginGrant(for: try AppURL(try link("open", ["path": f.note.path])))
        f.opener.picked(.success(base.appendingPathComponent("Gone")), root: f.root, openFiles: { [] }) { _ in XCTFail("opened") }
        XCTAssertEqual(f.opener.notice?.title, "Ganymede couldn’t add the folder")
        XCTAssertTrue(f.store.folders.isEmpty)
    }

    // MARK: Alerts

    @MainActor
    func testDismissingAnAlertKeepsANewerOne() throws {
        let f = try fixture(granting: false)
        f.opener.handle(try link("run", ["path": "x"]), root: f.root, openFiles: { [] }) { _ in }
        let first = try XCTUnwrap(f.opener.notice?.id)
        f.opener.handle(try link("new", ["dir": "x"]), root: f.root, openFiles: { [] }) { _ in }
        let second = try XCTUnwrap(f.opener.notice?.id)
        f.opener.dismiss(first)
        XCTAssertEqual(f.opener.notice?.id, second)
        f.opener.dismiss(second)
        XCTAssertNil(f.opener.notice)
    }
}
