import XCTest

/// Where `ganymede://open` links may read on iPad and iPhone (#640): the
/// folder the app has open and the folders the person granted, by any
/// spelling of the path, and nowhere else.
final class LinkFoldersTests: XCTestCase {
    private var base = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        base = FileManager.default.temporaryDirectory
            .appendingPathComponent("LinkFoldersTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: base)
    }

    /// A folder under the temp folder, made.
    @discardableResult
    private func folder(_ parts: String...) throws -> URL {
        let url = parts.reduce(base) { $0.appendingPathComponent($1, isDirectory: true) }
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// A file in `folder` (its subfolders made), with a little content.
    @discardableResult
    private func file(_ name: String, in folder: URL) throws -> URL {
        let url = folder.appendingPathComponent(name)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{}".utf8).write(to: url)
        return url
    }

    private func link(_ at: URL, to target: URL) throws {
        try FileManager.default.createSymbolicLink(at: at, withDestinationURL: target)
    }

    private func real(_ url: URL) -> String {
        url.standardizedFileURL.resolvingSymlinksInPath().path
    }

    private func resolve(
        _ target: LinkFolders.Target, root: URL, granted: [URL] = []
    ) throws -> (folder: URL, file: URL) {
        try LinkFolders.resolve(target, root: root, granted: granted)
    }

    /// The error `resolve` threw, nil if it resolved.
    private func failure(_ target: LinkFolders.Target, root: URL, granted: [URL] = []) -> LinkFolderError? {
        do {
            _ = try resolve(target, root: root, granted: granted)
            return nil
        } catch {
            return error as? LinkFolderError
        }
    }

    // MARK: Inside

    func testFileInGrantedFolder() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let note = try file("Daily/a.ipynb", in: vault)
        let byName = try resolve(.inFolder(folder: "Vault", file: "Daily/a.ipynb"), root: root, granted: [vault])
        XCTAssertEqual(real(byName.folder), real(vault))
        XCTAssertEqual(byName.file.path, real(note))
        let byPath = try resolve(.path(note.path), root: root, granted: [vault])
        XCTAssertEqual(real(byPath.folder), real(vault))
        XCTAssertEqual(byPath.file.path, real(note))
    }

    func testFileInRoot() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let note = try file("a.ipynb", in: root)
        let relative = try resolve(.path("a.ipynb"), root: root, granted: [vault])
        XCTAssertEqual(real(relative.folder), real(root))
        XCTAssertEqual(relative.file.path, real(note))
        let absolute = try resolve(.path(note.path), root: root, granted: [vault])
        XCTAssertEqual(absolute.file.path, real(note))
        let byName = try resolve(.inFolder(folder: "Documents", file: "a.ipynb"), root: root, granted: [vault])
        XCTAssertEqual(real(byName.folder), real(root))
        XCTAssertEqual(byName.file.path, real(note))
    }

    func testOutsideEveryFolder() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let outside = try file("secret.ipynb", in: try folder("Elsewhere"))
        XCTAssertEqual(failure(.path(outside.path), root: root, granted: [vault]), .notGranted)
        XCTAssertEqual(failure(.path("/etc/hosts"), root: root, granted: [vault]), .notGranted)
        // The sibling that only shares a prefix with a granted folder.
        let sibling = try file("a.ipynb", in: try folder("VaultOld"))
        XCTAssertEqual(failure(.path(sibling.path), root: root, granted: [vault]), .notGranted)
        // A file that isn't there reads the same, so a page can't tell.
        let missing = base.appendingPathComponent("Elsewhere/none.ipynb")
        XCTAssertEqual(failure(.path(missing.path), root: root, granted: [vault]), .notGranted)
        XCTAssertEqual(LinkFolderError.notGranted.errorDescription,
                       "Ganymede can only open files in folders you’ve let it use. Grant access to the folder that holds this notebook.")
    }

    func testNothingGrantedStillServesTheRoot() throws {
        let root = try folder("Documents")
        let note = try file("a.ipynb", in: root)
        XCTAssertEqual(try resolve(.path(note.path), root: root).file.path, real(note))
        XCTAssertEqual(failure(.inFolder(folder: "Vault", file: "a.ipynb"), root: root), .notGranted)
    }

    // MARK: Dots

    func testDotDotInFileEscaping() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        try file("secret.ipynb", in: base)
        XCTAssertEqual(failure(.inFolder(folder: "Vault", file: "../secret.ipynb"), root: root, granted: [vault]), .notGranted)
        XCTAssertEqual(failure(.inFolder(folder: "Vault", file: "a/../../secret.ipynb"), root: root, granted: [vault]), .notGranted)
        // Into the sibling folder that is the root.
        try file("r.ipynb", in: root)
        XCTAssertEqual(failure(.inFolder(folder: "Vault", file: "../Documents/r.ipynb"), root: root, granted: [vault]), .notGranted)
    }

    func testDotDotInPathEscaping() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        try file("x.ipynb", in: try folder("Elsewhere"))
        XCTAssertEqual(failure(.path(vault.path + "/../Elsewhere/x.ipynb"), root: root, granted: [vault]), .notGranted)
        XCTAssertEqual(failure(.path("../Elsewhere/x.ipynb"), root: root, granted: [vault]), .notGranted)
    }

    func testDotDotStayingInside() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let note = try file("b.ipynb", in: vault)
        let byName = try resolve(.inFolder(folder: "Vault", file: "a/../b.ipynb"), root: root, granted: [vault])
        XCTAssertEqual(byName.file.path, real(note))
        let byPath = try resolve(.path(vault.path + "/a/../b.ipynb"), root: root, granted: [vault])
        XCTAssertEqual(byPath.file.path, real(note))
    }

    // MARK: Symlinks

    func testSymlinkPointingOutsideIsRefused() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let outside = try folder("Elsewhere")
        let secret = try file("secret.ipynb", in: outside)
        try link(vault.appendingPathComponent("file.ipynb"), to: secret)
        try link(vault.appendingPathComponent("dir"), to: outside)
        for name in ["file.ipynb", "dir/secret.ipynb"] {
            XCTAssertEqual(failure(.inFolder(folder: "Vault", file: name), root: root, granted: [vault]), .notGranted, name)
            XCTAssertEqual(failure(.path(vault.path + "/" + name), root: root, granted: [vault]), .notGranted, name)
        }
    }

    func testSymlinkPointingInsideIsAllowed() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let target = try file("real/a.ipynb", in: vault)
        try link(vault.appendingPathComponent("alias.ipynb"), to: target)
        let byName = try resolve(.inFolder(folder: "Vault", file: "alias.ipynb"), root: root, granted: [vault])
        XCTAssertEqual(byName.file.path, real(target))
        let byPath = try resolve(.path(vault.path + "/alias.ipynb"), root: root, granted: [vault])
        XCTAssertEqual(byPath.file.path, real(target))
    }

    func testGrantedThroughASymlinkStillMatches() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let note = try file("a.ipynb", in: vault)
        let alias = base.appendingPathComponent("Alias")
        try link(alias, to: vault)
        // Granted by the alias, linked by the real path, and the other way.
        XCTAssertEqual(try resolve(.path(note.path), root: root, granted: [alias]).file.path, real(note))
        XCTAssertEqual(try resolve(.path(alias.path + "/a.ipynb"), root: root, granted: [vault]).file.path, real(note))
        // Named by the alias's name or the folder's own.
        XCTAssertEqual(try resolve(.inFolder(folder: "Alias", file: "a.ipynb"), root: root, granted: [alias]).file.path, real(note))
        XCTAssertEqual(try resolve(.inFolder(folder: "Vault", file: "a.ipynb"), root: root, granted: [alias]).file.path, real(note))
    }

    func testVarAndPrivateVarSpellings() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let note = try file("a.ipynb", in: vault)
        // Temp folders are under /var, which is /private/var.
        let other: String
        if vault.path.hasPrefix("/private/var/") {
            other = String(vault.path.dropFirst("/private".count))
        } else if vault.path.hasPrefix("/var/") {
            other = "/private" + vault.path
        } else {
            throw XCTSkip("the temporary folder isn't under /var")
        }
        let granted = URL(fileURLWithPath: other, isDirectory: true)
        XCTAssertEqual(try resolve(.path(note.path), root: root, granted: [granted]).file.path, real(note))
        XCTAssertEqual(try resolve(.path(other + "/a.ipynb"), root: root, granted: [vault]).file.path, real(note))
        XCTAssertEqual(try resolve(.inFolder(folder: "Vault", file: "a.ipynb"), root: root, granted: [granted]).file.path, real(note))
    }

    // MARK: Bad values

    func testAbsoluteFileIsRefused() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let note = try file("a.ipynb", in: vault)
        XCTAssertEqual(failure(.inFolder(folder: "Vault", file: note.path), root: root, granted: [vault]), .badPath(note.path))
        XCTAssertEqual(failure(.inFolder(folder: "Vault", file: "/etc/hosts"), root: root, granted: [vault]), .badPath("/etc/hosts"))
        XCTAssertEqual(failure(.inFolder(folder: "Vault", file: ""), root: root, granted: [vault]), .badPath(""))
    }

    func testTildePathIsRefused() throws {
        let root = try folder("Documents")
        XCTAssertEqual(failure(.path("~/x.ipynb"), root: root), .badPath("~/x.ipynb"))
        XCTAssertEqual(failure(.path("~"), root: root), .badPath("~"))
        // Not read as a folder named "~" in the root, either.
        try file("~/x.ipynb", in: root)
        XCTAssertEqual(failure(.path("~/x.ipynb"), root: root), .badPath("~/x.ipynb"))
    }

    func testUnknownFolderName() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        try file("a.ipynb", in: vault)
        XCTAssertEqual(failure(.inFolder(folder: "Nope", file: "a.ipynb"), root: root, granted: [vault]), .notGranted)
        // Exact: not a case-insensitive or partial match, and not a path.
        XCTAssertEqual(failure(.inFolder(folder: "vault", file: "a.ipynb"), root: root, granted: [vault]), .notGranted)
        XCTAssertEqual(failure(.inFolder(folder: "Vau", file: "a.ipynb"), root: root, granted: [vault]), .notGranted)
        XCTAssertEqual(failure(.inFolder(folder: base.path, file: "Vault/a.ipynb"), root: root, granted: [vault]), .notGranted)
    }

    func testAmbiguousFolderName() throws {
        let root = try folder("Documents")
        let one = try folder("One", "Vault")
        let two = try folder("Two", "Vault")
        let a = try file("a.ipynb", in: one)
        let b = try file("b.ipynb", in: two)
        XCTAssertEqual(failure(.inFolder(folder: "Vault", file: "a.ipynb"), root: root, granted: [one, two]), .ambiguousFolder("Vault"))
        // `path=` still tells them apart.
        XCTAssertEqual(try resolve(.path(a.path), root: root, granted: [one, two]).file.path, real(a))
        XCTAssertEqual(try resolve(.path(b.path), root: root, granted: [one, two]).file.path, real(b))
        // Granting one folder twice is not ambiguity.
        XCTAssertEqual(try resolve(.inFolder(folder: "Vault", file: "a.ipynb"), root: root, granted: [one, one]).file.path, real(a))
        // A granted folder named like the open one is.
        let rootNamedVault = try folder("Three", "Vault")
        XCTAssertEqual(failure(.inFolder(folder: "Vault", file: "a.ipynb"), root: rootNamedVault, granted: [one]), .ambiguousFolder("Vault"))
    }

    func testMostSpecificFolderIsChosen() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let sub = try folder("Vault", "Sub")
        let inSub = try file("x.ipynb", in: sub)
        let inVault = try file("y.ipynb", in: vault)
        for granted in [[vault, sub], [sub, vault]] {
            XCTAssertEqual(real(try resolve(.path(inSub.path), root: root, granted: granted).folder), real(sub))
            XCTAssertEqual(real(try resolve(.path(inVault.path), root: root, granted: granted).folder), real(vault))
        }
        // The open folder inside a grant, too.
        XCTAssertEqual(real(try resolve(.path(inSub.path), root: sub, granted: [vault]).folder), real(sub))
        XCTAssertEqual(real(try resolve(.path(inSub.path), root: vault, granted: [sub]).folder), real(sub))
    }

    // MARK: Notebooks

    func testCheckNotebook() throws {
        let dir = try folder("Vault")
        let notebook = try file("a.ipynb", in: dir)
        let upper = try file("B.IPYNB", in: dir)
        let text = try file("c.txt", in: dir)
        let directory = try folder("Vault", "d.ipynb")
        XCTAssertNoThrow(try LinkFolders.checkNotebook(notebook))
        XCTAssertNoThrow(try LinkFolders.checkNotebook(upper))
        XCTAssertThrowsError(try LinkFolders.checkNotebook(dir.appendingPathComponent("none.ipynb"))) {
            XCTAssertEqual($0 as? LinkFolderError, .notFound("none.ipynb"))
        }
        XCTAssertThrowsError(try LinkFolders.checkNotebook(text)) {
            XCTAssertEqual($0 as? LinkFolderError, .notNotebook("c.txt"))
        }
        XCTAssertThrowsError(try LinkFolders.checkNotebook(directory)) {
            XCTAssertEqual($0 as? LinkFolderError, .notNotebook("d.ipynb"))
        }
        XCTAssertThrowsError(try LinkFolders.checkNotebook(dir)) {
            XCTAssertEqual($0 as? LinkFolderError, .notNotebook("Vault"))
        }
    }

    func testICloudPlaceholderStartsADownload() throws {
        let dir = try folder("Vault")
        let placeholder = dir.appendingPathComponent(".n.ipynb.icloud")
        try Data().write(to: placeholder)
        var started: [URL] = []
        XCTAssertThrowsError(try LinkFolders.checkNotebook(dir.appendingPathComponent("n.ipynb"), startDownload: { started.append($0) })) {
            XCTAssertEqual($0 as? LinkFolderError, .downloading("n.ipynb"))
        }
        XCTAssertEqual(started.map(\.lastPathComponent), ["n.ipynb"])
        // No placeholder: not found, and nothing to download.
        started = []
        XCTAssertThrowsError(try LinkFolders.checkNotebook(dir.appendingPathComponent("m.ipynb"), startDownload: { started.append($0) })) {
            XCTAssertEqual($0 as? LinkFolderError, .notFound("m.ipynb"))
        }
        // A file that is there is checked as before.
        let here = try file("h.ipynb", in: dir)
        XCTAssertNoThrow(try LinkFolders.checkNotebook(here, startDownload: { started.append($0) }))
        XCTAssertEqual(started, [])
        XCTAssertTrue(LinkFolders.isICloudPlaceholder(of: dir.appendingPathComponent("n.ipynb")))
        XCTAssertFalse(LinkFolders.isICloudPlaceholder(of: dir.appendingPathComponent("m.ipynb")))
        // A failed start is reported as it is, not as a download.
        struct Refused: Error {}
        XCTAssertThrowsError(try LinkFolders.checkNotebook(dir.appendingPathComponent("n.ipynb"), startDownload: { _ in throw Refused() })) {
            XCTAssertTrue($0 is Refused)
        }
    }

    func testAPlaceholderOutsideTheFoldersIsStillNotGranted() throws {
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let elsewhere = try folder("Elsewhere")
        try Data().write(to: elsewhere.appendingPathComponent(".n.ipynb.icloud"))
        XCTAssertEqual(failure(.path(elsewhere.path + "/n.ipynb"), root: root, granted: [vault]), .notGranted)
        XCTAssertEqual(LinkFolderError.downloading("n.ipynb").errorDescription,
                       "“n.ipynb” is downloading from iCloud. Open the link again in a moment.")
    }

    // MARK: Granted folders

    private func makeDefaults() throws -> UserDefaults {
        let suite = "LinkFoldersTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        return defaults
    }

    @MainActor
    func testStoreAddsAndKeepsFolders() throws {
        let defaults = try makeDefaults()
        let vault = try folder("Vault")
        let notes = try folder("Notes")
        let store = LinkFolderStore(defaults: defaults)
        XCTAssertTrue(store.folders.isEmpty)
        try store.add(vault)
        try store.add(notes)
        XCTAssertEqual(store.folders.map(\.name), ["Vault", "Notes"])
        XCTAssertEqual(store.folders.compactMap { $0.url.map { real($0) } }, [real(vault), real(notes)])
        // Kept across launches.
        let again = LinkFolderStore(defaults: defaults)
        XCTAssertEqual(again.folders.map(\.name), ["Vault", "Notes"])
        XCTAssertEqual(again.folders.compactMap { $0.url.map { real($0) } }, [real(vault), real(notes)])
    }

    @MainActor
    func testStoreDoesNotAddAFolderTwice() throws {
        let defaults = try makeDefaults()
        let vault = try folder("Vault")
        let alias = base.appendingPathComponent("Alias")
        try link(alias, to: vault)
        let store = LinkFolderStore(defaults: defaults)
        try store.add(vault)
        try store.add(vault)
        try store.add(alias)
        try store.add(vault.appendingPathComponent("../Vault"))
        XCTAssertEqual(store.folders.count, 1)
        XCTAssertEqual(LinkFolderStore(defaults: defaults).folders.count, 1)
    }

    @MainActor
    func testStoreRevokes() throws {
        let defaults = try makeDefaults()
        let vault = try folder("Vault")
        let notes = try folder("Notes")
        let store = LinkFolderStore(defaults: defaults)
        try store.add(vault)
        try store.add(notes)
        let first = try XCTUnwrap(store.folders.first)
        store.remove(first.id)
        XCTAssertEqual(store.folders.map(\.name), ["Notes"])
        XCTAssertEqual(LinkFolderStore(defaults: defaults).folders.map(\.name), ["Notes"])
        // Revoked, a link into it is refused again.
        let note = try file("a.ipynb", in: vault)
        let root = try folder("Documents")
        let granted = store.withAccess { $0 }
        XCTAssertEqual(failure(.path(note.path), root: root, granted: granted), .notGranted)
    }

    @MainActor
    func testStoreFailsToAddAFolderThatIsGone() throws {
        let defaults = try makeDefaults()
        let store = LinkFolderStore(defaults: defaults)
        XCTAssertThrowsError(try store.add(base.appendingPathComponent("Gone", isDirectory: true)))
        XCTAssertTrue(store.folders.isEmpty)
        XCTAssertNil(defaults.array(forKey: LinkFolderStore.defaultsKey))
    }

    @MainActor
    func testStoreWithAccessResolvesLinks() throws {
        let defaults = try makeDefaults()
        let root = try folder("Documents")
        let vault = try folder("Vault")
        let note = try file("n/a.ipynb", in: vault)
        let store = LinkFolderStore(defaults: defaults)
        try store.add(vault)
        let resolved = try store.withAccess { granted in
            try LinkFolders.resolve(.inFolder(folder: "Vault", file: "n/a.ipynb"), root: root, granted: granted)
        }
        XCTAssertEqual(resolved.file.path, real(note))
        XCTAssertEqual(real(resolved.folder), real(vault))
        // Errors from the body come out.
        XCTAssertThrowsError(try store.withAccess { _ -> Int in throw LinkFolderError.notGranted }) {
            XCTAssertEqual($0 as? LinkFolderError, .notGranted)
        }
    }

    @MainActor
    func testStoreKeepsFoldersThatNoLongerResolve() throws {
        let defaults = try makeDefaults()
        let vault = try folder("Vault")
        let store = LinkFolderStore(defaults: defaults)
        try store.add(vault)
        let good = try XCTUnwrap(store.folders.first)
        let bad = Data("not a bookmark".utf8)
        defaults.set([bad, good.id], forKey: LinkFolderStore.defaultsKey)
        let reloaded = LinkFolderStore(defaults: defaults)
        XCTAssertEqual(reloaded.folders.map(\.isAvailable), [false, true])
        // Skipped when resolving, but listed, and revoked like the others.
        let granted = reloaded.withAccess { $0 }
        XCTAssertEqual(granted.map { real($0) }, [real(vault)])
        reloaded.remove(bad)
        XCTAssertEqual(reloaded.folders.map(\.name), ["Vault"])
        XCTAssertEqual(LinkFolderStore(defaults: defaults).folders.count, 1)
    }
}
