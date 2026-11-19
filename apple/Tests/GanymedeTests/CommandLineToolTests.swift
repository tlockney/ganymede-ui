#if os(macOS)
import XCTest

/// Installing the bundled `ganymede` command line tool from Settings
/// (#686): a link at `~/.local/bin/ganymede` that replaces only the app's
/// own links, whatever app they were made for, and never anything else.
final class CommandLineToolTests: XCTestCase {
    private let fm = FileManager.default
    private var base = URL(fileURLWithPath: "/")
    private var bundled = URL(fileURLWithPath: "/")
    private var bin = URL(fileURLWithPath: "/")
    private var link = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        base = fm.temporaryDirectory
            .appendingPathComponent("CommandLineToolTests-\(UUID().uuidString)", isDirectory: true)
        bundled = try makeApp("Ganymede.app")
        // ~/.local/bin doesn't exist until the install creates it.
        bin = base.appendingPathComponent("home/.local/bin", isDirectory: true)
        link = bin.appendingPathComponent("ganymede")
    }

    override func tearDownWithError() throws {
        try? fm.removeItem(at: base)
    }

    /// An app folder holding an executable `Contents/Helpers/ganymede`.
    private func makeApp(_ name: String, under parent: URL? = nil) throws -> URL {
        let helpers = (parent ?? base).appendingPathComponent("\(name)/Contents/Helpers", isDirectory: true)
        try fm.createDirectory(at: helpers, withIntermediateDirectories: true)
        let tool = helpers.appendingPathComponent("ganymede")
        try "#!/bin/sh\necho ganymede 0.14.0\n".write(to: tool, atomically: true, encoding: .utf8)
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: tool.path)
        return tool
    }

    private func makeBin() throws {
        try fm.createDirectory(at: bin, withIntermediateDirectories: true)
    }

    private func linkTarget() throws -> String {
        try fm.destinationOfSymbolicLink(atPath: link.path)
    }

    // MARK: The bundled tool

    func testBundledToolIsFoundOnlyWhenExecutable() throws {
        let app = base.appendingPathComponent("Ganymede.app")
        XCTAssertEqual(CommandLineTool.bundledTool(bundle: app)?.path, bundled.path)
        XCTAssertNil(CommandLineTool.bundledTool(bundle: base.appendingPathComponent("Other.app")))
        try fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: bundled.path)
        XCTAssertNil(CommandLineTool.bundledTool(bundle: app), "not executable")
    }

    func testDefaultLink() {
        let home = URL(fileURLWithPath: "/Users/a", isDirectory: true)
        XCTAssertEqual(CommandLineTool.defaultLink(home: home).path, "/Users/a/.local/bin/ganymede")
    }

    // MARK: Install

    func testInstallCreatesTheFolderAndTheLink() throws {
        XCTAssertFalse(fm.fileExists(atPath: bin.path))
        try CommandLineTool.install(bundled: bundled, link: link)
        XCTAssertEqual(try linkTarget(), bundled.path)
        var isDirectory: ObjCBool = false
        XCTAssertTrue(fm.fileExists(atPath: bin.path, isDirectory: &isDirectory))
        XCTAssertTrue(isDirectory.boolValue)
        let mode = try fm.attributesOfItem(atPath: bin.path)[.posixPermissions] as? Int
        XCTAssertEqual(mode.map { $0 & 0o777 }, 0o755)
        XCTAssertTrue(fm.isExecutableFile(atPath: link.path), "the link leads to the tool")
        // No temporary link is left beside it.
        XCTAssertEqual(try fm.contentsOfDirectory(atPath: bin.path), ["ganymede"])
    }

    func testInstallAgainIsHarmless() throws {
        try CommandLineTool.install(bundled: bundled, link: link)
        try CommandLineTool.install(bundled: bundled, link: link)
        XCTAssertEqual(try linkTarget(), bundled.path)
        XCTAssertEqual(try fm.contentsOfDirectory(atPath: bin.path), ["ganymede"])
    }

    func testInstallRefusesARegularFileAndLeavesItAlone() throws {
        try makeBin()
        try "#!/bin/sh\n".write(to: link, atomically: true, encoding: .utf8)
        XCTAssertThrowsError(try CommandLineTool.install(bundled: bundled, link: link)) { error in
            XCTAssertEqual(error as? CommandLineTool.ToolError, .blocked(link: link.path, what: "a file"))
            let message = error.localizedDescription
            XCTAssertTrue(message.contains(link.path), message)
            XCTAssertTrue(message.contains("mv '\(link.path)' '\(link.path).old'"), "says how to move it away: \(message)")
        }
        XCTAssertEqual(try String(contentsOf: link, encoding: .utf8), "#!/bin/sh\n")
        XCTAssertEqual(try fm.contentsOfDirectory(atPath: bin.path), ["ganymede"])
    }

    func testInstallRefusesAFolder() throws {
        try fm.createDirectory(at: link, withIntermediateDirectories: true)
        XCTAssertThrowsError(try CommandLineTool.install(bundled: bundled, link: link)) { error in
            XCTAssertEqual(error as? CommandLineTool.ToolError, .blocked(link: link.path, what: "a folder"))
        }
    }

    func testInstallRefusesAForeignLink() throws {
        try makeBin()
        let homebrew = base.appendingPathComponent("Cellar/ganymede/bin/ganymede")
        try fm.createSymbolicLink(at: link, withDestinationURL: homebrew)
        XCTAssertThrowsError(try CommandLineTool.install(bundled: bundled, link: link)) { error in
            XCTAssertEqual(
                error as? CommandLineTool.ToolError,
                .blocked(link: link.path, what: "a link to \(homebrew.path)")
            )
        }
        XCTAssertEqual(try linkTarget(), homebrew.path, "still the other link")
    }

    func testInstallRefusesALinkThatOnlyLooksLikeOurs() throws {
        // The suffix is `.app/Contents/Helpers/ganymede`, not any path
        // ending in `ganymede`.
        try makeBin()
        let other = base.appendingPathComponent("Applications/Helpers/ganymede")
        try fm.createSymbolicLink(at: link, withDestinationURL: other)
        XCTAssertThrowsError(try CommandLineTool.install(bundled: bundled, link: link))
        XCTAssertEqual(try linkTarget(), other.path)
    }

    func testInstallReplacesOurStaleLink() throws {
        try makeBin()
        // For an app that moved: its tool is gone.
        let gone = base.appendingPathComponent("Old/Ganymede.app/Contents/Helpers/ganymede")
        try fm.createSymbolicLink(at: link, withDestinationURL: gone)
        try CommandLineTool.install(bundled: bundled, link: link)
        XCTAssertEqual(try linkTarget(), bundled.path)
        // And one for another copy of the app that still exists.
        let copy = try makeApp("Copy.app", under: base.appendingPathComponent("Elsewhere"))
        try fm.removeItem(at: link)
        try fm.createSymbolicLink(at: link, withDestinationURL: copy)
        try CommandLineTool.install(bundled: bundled, link: link)
        XCTAssertEqual(try linkTarget(), bundled.path)
        XCTAssertTrue(fm.fileExists(atPath: copy.path), "the other app is untouched")
        XCTAssertEqual(try fm.contentsOfDirectory(atPath: bin.path), ["ganymede"])
    }

    func testInstallWithoutABundledToolFails() {
        XCTAssertThrowsError(try CommandLineTool.install(bundled: nil, link: link)) { error in
            XCTAssertEqual(error as? CommandLineTool.ToolError, .noBundledTool)
        }
        XCTAssertFalse(fm.fileExists(atPath: bin.path), "nothing is created")
    }

    func testInstallRefusesAnAppRunFromATranslocatedPath() throws {
        let translocated = try makeApp("Ganymede.app", under: base.appendingPathComponent("AppTranslocation/ABC/d"))
        XCTAssertThrowsError(try CommandLineTool.install(bundled: translocated, link: link)) { error in
            XCTAssertEqual(error as? CommandLineTool.ToolError, .translocated)
        }
        XCTAssertFalse(fm.fileExists(atPath: bin.path))
    }

    func testInstallReportsAFolderItCannotCreate() throws {
        // `.local` can't be written to, so `.local/bin` can't be made.
        let home = base.appendingPathComponent("home2", isDirectory: true)
        try fm.createDirectory(
            at: home.appendingPathComponent(".local"), withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o555]
        )
        let blocked = CommandLineTool.defaultLink(home: home)
        XCTAssertThrowsError(try CommandLineTool.install(bundled: bundled, link: blocked)) { error in
            guard case .failed(let message)? = error as? CommandLineTool.ToolError else {
                return XCTFail("\(error)")
            }
            XCTAssertTrue(message.contains(".local/bin"), message)
        }
    }

    // MARK: Replacing what is there

    /// Moves the item aside into a folder of the test's own, as the Trash
    /// would, and records it.
    private func fakeTrash(_ moved: @escaping (URL) -> Void = { _ in }) -> (URL) throws -> Void {
        let trash = base.appendingPathComponent("Trash", isDirectory: true)
        return { [fm] url in
            try fm.createDirectory(at: trash, withIntermediateDirectories: true)
            try fm.moveItem(at: url, to: trash.appendingPathComponent(UUID().uuidString))
            moved(url)
        }
    }

    func testForceMovesARegularFileAsideAndInstalls() throws {
        try makeBin()
        try "mine".write(to: link, atomically: true, encoding: .utf8)
        var trashed: [URL] = []
        try CommandLineTool.install(bundled: bundled, link: link, force: true, trash: fakeTrash { trashed.append($0) })
        XCTAssertEqual(trashed.map(\.path), [link.path])
        XCTAssertEqual(try linkTarget(), bundled.path)
        let kept = try fm.contentsOfDirectory(atPath: base.appendingPathComponent("Trash").path)
        XCTAssertEqual(kept.count, 1)
        XCTAssertEqual(
            try String(contentsOf: base.appendingPathComponent("Trash/\(kept[0])"), encoding: .utf8), "mine",
            "the file is kept, not deleted"
        )
    }

    func testForceMovesAForeignLinkAsideWithoutTouchingItsTarget() throws {
        try makeBin()
        let target = base.appendingPathComponent("brew-ganymede")
        try "brew".write(to: target, atomically: true, encoding: .utf8)
        try fm.createSymbolicLink(at: link, withDestinationURL: target)
        try CommandLineTool.install(bundled: bundled, link: link, force: true, trash: fakeTrash())
        XCTAssertEqual(try linkTarget(), bundled.path)
        XCTAssertEqual(try String(contentsOf: target, encoding: .utf8), "brew", "the target is untouched")
    }

    func testForceMovesAFolderAside() throws {
        try fm.createDirectory(at: link, withIntermediateDirectories: true)
        try CommandLineTool.install(bundled: bundled, link: link, force: true, trash: fakeTrash())
        XCTAssertEqual(try linkTarget(), bundled.path)
    }

    func testWithoutForceNothingIsTrashed() throws {
        try makeBin()
        try "mine".write(to: link, atomically: true, encoding: .utf8)
        XCTAssertThrowsError(try CommandLineTool.install(bundled: bundled, link: link, trash: { _ in
            XCTFail("trashed without being asked")
        }))
        XCTAssertEqual(try String(contentsOf: link, encoding: .utf8), "mine")
    }

    func testForceLeavesTheFileWhenTrashingFails() throws {
        try makeBin()
        try "mine".write(to: link, atomically: true, encoding: .utf8)
        struct Refused: LocalizedError { var errorDescription: String? { "no Trash" } }
        XCTAssertThrowsError(try CommandLineTool.install(bundled: bundled, link: link, force: true, trash: { _ in
            throw Refused()
        })) { error in
            guard case .failed(let message)? = error as? CommandLineTool.ToolError else {
                return XCTFail("\(error)")
            }
            XCTAssertTrue(message.contains("no Trash") && message.contains("still there"), message)
        }
        XCTAssertEqual(try String(contentsOf: link, encoding: .utf8), "mine", "left in place, not replaced")
    }

    func testForceDoesNotTrashOurOwnLink() throws {
        try CommandLineTool.install(bundled: bundled, link: link)
        try CommandLineTool.install(bundled: bundled, link: link, force: true, trash: { _ in
            XCTFail("our own link is replaced, not trashed")
        })
        XCTAssertEqual(try linkTarget(), bundled.path)
    }

    // MARK: Uninstall

    func testUninstallRemovesOurLinkOnly() throws {
        try CommandLineTool.install(bundled: bundled, link: link)
        try CommandLineTool.uninstall(link: link)
        XCTAssertNil(try? fm.destinationOfSymbolicLink(atPath: link.path))
        XCTAssertFalse(fm.fileExists(atPath: link.path))
        XCTAssertTrue(fm.fileExists(atPath: bundled.path), "the app's tool stays")
        XCTAssertTrue(fm.fileExists(atPath: bin.path), "so does the folder")
    }

    func testUninstallRemovesAStaleLink() throws {
        try makeBin()
        try fm.createSymbolicLink(
            at: link,
            withDestinationURL: base.appendingPathComponent("Gone/Ganymede.app/Contents/Helpers/ganymede")
        )
        try CommandLineTool.uninstall(link: link)
        XCTAssertNil(try? fm.destinationOfSymbolicLink(atPath: link.path))
    }

    func testUninstallLeavesAFileAndAForeignLink() throws {
        try makeBin()
        try "x".write(to: link, atomically: true, encoding: .utf8)
        XCTAssertThrowsError(try CommandLineTool.uninstall(link: link)) { error in
            XCTAssertEqual(error as? CommandLineTool.ToolError, .blocked(link: link.path, what: "a file"))
        }
        XCTAssertEqual(try String(contentsOf: link, encoding: .utf8), "x")

        try fm.removeItem(at: link)
        let foreign = base.appendingPathComponent("elsewhere/ganymede")
        try fm.createSymbolicLink(at: link, withDestinationURL: foreign)
        XCTAssertThrowsError(try CommandLineTool.uninstall(link: link))
        XCTAssertEqual(try linkTarget(), foreign.path)
    }

    func testUninstallWithNothingThereIsFine() throws {
        XCTAssertNoThrow(try CommandLineTool.uninstall(link: link))
    }

    // MARK: Status

    private func status(path: String = "") -> CommandLineTool.State {
        CommandLineTool.state(bundled: bundled, link: link, path: path)
    }

    func testStatusWithoutABundledTool() {
        XCTAssertEqual(CommandLineTool.state(bundled: nil, link: link, path: "").status, .unavailable)
    }

    func testStatusNotInstalled() {
        XCTAssertEqual(status().status, .notInstalled)
    }

    func testStatusInstalled() throws {
        try CommandLineTool.install(bundled: bundled, link: link)
        XCTAssertEqual(status().status, .installed)
    }

    func testStatusInstalledFollowsARelativeLink() throws {
        try makeBin()
        // The same tool through a relative link.
        try fm.createSymbolicLink(
            atPath: link.path,
            withDestinationPath: "../../../Ganymede.app/Contents/Helpers/ganymede"
        )
        XCTAssertEqual(status().status, .installed)
    }

    func testStatusStale() throws {
        try makeBin()
        let old = base.appendingPathComponent("Old/Ganymede.app/Contents/Helpers/ganymede")
        try fm.createSymbolicLink(at: link, withDestinationURL: old)
        XCTAssertEqual(status().status, .stale(target: old.path), "pointing at nothing")

        let copy = try makeApp("Copy.app", under: base.appendingPathComponent("Elsewhere"))
        try fm.removeItem(at: link)
        try fm.createSymbolicLink(at: link, withDestinationURL: copy)
        XCTAssertEqual(status().status, .stale(target: copy.path), "pointing at another copy")
    }

    func testStatusBlocked() throws {
        try makeBin()
        try "x".write(to: link, atomically: true, encoding: .utf8)
        XCTAssertEqual(status().status, .blocked(what: "a file"))
        try fm.removeItem(at: link)
        let foreign = base.appendingPathComponent("usr/ganymede")
        try fm.createSymbolicLink(at: link, withDestinationURL: foreign)
        XCTAssertEqual(status().status, .blocked(what: "a link to \(foreign.path)"))
    }

    // MARK: The PATH

    func testDirectoryOnPath() {
        XCTAssertFalse(status(path: "/usr/bin:/bin").directoryOnPath)
        XCTAssertFalse(status(path: "").directoryOnPath)
        XCTAssertTrue(status(path: "/usr/bin:\(bin.path):/bin").directoryOnPath)
        XCTAssertTrue(status(path: "\(bin.path)/").directoryOnPath, "a trailing slash")
        XCTAssertTrue(status(path: "\(base.path)/home/./.local/bin").directoryOnPath, "a dot segment")
        XCTAssertFalse(status(path: "\(bin.path)x").directoryOnPath, "only whole folders")
    }

    func testAnotherGanymedeFirstOnPath() throws {
        try CommandLineTool.install(bundled: bundled, link: link)
        let brew = base.appendingPathComponent("brew/bin", isDirectory: true)
        try fm.createDirectory(at: brew, withIntermediateDirectories: true)
        let other = brew.appendingPathComponent("ganymede")
        try "#!/bin/sh\n".write(to: other, atomically: true, encoding: .utf8)
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: other.path)

        XCTAssertEqual(status(path: "\(brew.path):\(bin.path)").otherOnPath, other.path)
        XCTAssertNil(status(path: "\(bin.path):\(brew.path)").otherOnPath, "ours comes first")
        XCTAssertNil(status(path: "/nowhere").otherOnPath, "none at all")
    }

    func testALinkToTheBundledToolIsNotAnotherGanymede() throws {
        // A link elsewhere on the PATH that leads to the app's tool.
        let tools = base.appendingPathComponent("tools", isDirectory: true)
        try fm.createDirectory(at: tools, withIntermediateDirectories: true)
        try fm.createSymbolicLink(at: tools.appendingPathComponent("ganymede"), withDestinationURL: bundled)
        XCTAssertNil(status(path: tools.path).otherOnPath)
    }

    func testShellQuoting() {
        XCTAssertEqual(CommandLineTool.shellQuoted("/a b/c"), "'/a b/c'")
        XCTAssertEqual(CommandLineTool.shellQuoted("/a\"$HOME`x`"), "'/a\"$HOME`x`'")
        XCTAssertEqual(CommandLineTool.shellQuoted("/it's"), "'/it'\\''s'")
    }

    // MARK: Claude Desktop's command

    func testDesktopCommandFallsBack() throws {
        let tools = base.appendingPathComponent("tools", isDirectory: true)
        try fm.createDirectory(at: tools, withIntermediateDirectories: true)
        let onPath = tools.appendingPathComponent("ganymede")
        try "#!/bin/sh\n".write(to: onPath, atomically: true, encoding: .utf8)
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: onPath.path)

        XCTAssertEqual(CommandLineTool.desktopCommand(path: tools.path, bundled: bundled), onPath.path, "the PATH's first")
        XCTAssertEqual(CommandLineTool.desktopCommand(path: "/nowhere", bundled: bundled), bundled.path)
        XCTAssertEqual(CommandLineTool.desktopCommand(path: "/nowhere", bundled: nil), "ganymede")
    }

    // MARK: The other ganymede's version

    private func script(_ body: String) throws -> URL {
        let file = base.appendingPathComponent("script-\(UUID().uuidString)")
        try "#!/bin/sh\n\(body)\n".write(to: file, atomically: true, encoding: .utf8)
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: file.path)
        return file
    }

    func testVersionIsTheFirstLine() throws {
        XCTAssertEqual(CommandLineTool.version(of: bundled.path), "ganymede 0.14.0")
        let two = try script("echo 'ganymede 0.9.1'; echo more")
        XCTAssertEqual(CommandLineTool.version(of: two.path), "ganymede 0.9.1")
    }

    func testVersionIsNilWhenItFailsOrIsMissingOrHangs() throws {
        XCTAssertNil(CommandLineTool.version(of: try script("echo oops; exit 1").path), "fails")
        XCTAssertNil(CommandLineTool.version(of: base.appendingPathComponent("none").path), "missing")
        XCTAssertNil(CommandLineTool.version(of: try script("exec sleep 30").path, timeout: 0.5), "too slow")
    }

    func testPathAdviceNamesTheProfileByShell() {
        let zsh = CommandLineTool.pathAdvice(shell: "/bin/zsh")
        XCTAssertTrue(zsh.contains("~/.zprofile") && zsh.contains("~/.zshrc"), zsh)
        for shell in ["/bin/bash", "/opt/homebrew/bin/fish", nil] {
            let advice = CommandLineTool.pathAdvice(shell: shell)
            XCTAssertFalse(advice.contains("zprofile"), advice)
            XCTAssertTrue(advice.contains("your login shell’s profile"), advice)
        }
    }

    func testThePathLine() {
        XCTAssertEqual(CommandLineTool.pathLine, "export PATH=\"$HOME/.local/bin:$PATH\"")
    }
}
#endif
