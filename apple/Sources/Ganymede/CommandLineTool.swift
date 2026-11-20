#if os(macOS)
import Foundation

/// The `ganymede` command line tool the Mac app bundles in
/// `Contents/Helpers` (#686), and the link Settings makes to it at
/// `~/.local/bin/ganymede`, the place ganymede's install script uses.
///
/// Installing creates a symbolic link and nothing else: no copy, no admin
/// prompt, and nothing the app didn't create is ever replaced or removed.
/// A link is the app's own when it points at a path ending in
/// `.app/Contents/Helpers/ganymede`, even a stale one for an app that
/// moved or was replaced. Anything else at the link path (a file from
/// `install.sh`, a Homebrew link, a folder) blocks the install, and the
/// message says what is there.
///
/// Every function takes the places it reads (the bundle, the link, the
/// PATH, the file manager), so the tests use temporary folders.
enum CommandLineTool {
    /// What the link is at the moment.
    enum Status: Equatable {
        /// The app has no bundled tool (bootstrap.sh skipped it).
        case unavailable
        case notInstalled
        /// The app's own link, pointing at this app's tool.
        case installed
        /// The app's own link, but pointing elsewhere (an app that moved
        /// or was replaced) or at nothing; installing again fixes it.
        case stale(target: String)
        /// Something else is at the link path; `what` describes it.
        case blocked(what: String)
    }

    /// The link's status, with whether new terminals find it.
    struct State: Equatable {
        var status: Status
        /// `~/.local/bin` (the link's folder) is on the PATH.
        var directoryOnPath: Bool
        /// The `ganymede` that comes first on the PATH when it isn't this
        /// app's tool, such as Homebrew's or the install script's.
        var otherOnPath: String?
    }

    enum ToolError: LocalizedError, Equatable {
        case noBundledTool
        case translocated
        case blocked(link: String, what: String)
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .noBundledTool:
                "This copy of Ganymede has no command line tool."
            case .translocated:
                "Ganymede is running from a temporary location. Move it to the Applications folder, open it from there, and try again."
            case .blocked(let link, let what):
                "\(link) already exists (\(what)), and Ganymede didn’t create it, so it won’t replace it. "
                    + "Move it away, for example with mv \(CommandLineTool.shellQuoted(link)) \(CommandLineTool.shellQuoted(link + ".old")), and try again."
            case .failed(let message):
                message
            }
        }
    }

    /// What the app's own links point at, whichever app they were made for.
    static let helperSuffix = ".app/Contents/Helpers/ganymede"

    /// `text` in single quotes for a shell, so `"`, `$` and spaces in a path
    /// are safe.
    static func shellQuoted(_ text: String) -> String {
        "'" + text.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    /// The line that puts the link's folder on the PATH of new terminals.
    static let pathLine = #"export PATH="$HOME/.local/bin:$PATH""#

    /// `~/.local/bin/ganymede`.
    static func defaultLink(
        home: URL = FileManager.default.homeDirectoryForCurrentUser
    ) -> URL {
        home.appendingPathComponent(".local/bin/ganymede")
    }

    /// The tool inside the app at `bundle`, or nil when it isn't there.
    static func bundledTool(
        bundle: URL = Bundle.main.bundleURL,
        fileManager: FileManager = .default
    ) -> URL? {
        let tool = bundle.appendingPathComponent("Contents/Helpers/ganymede")
        return fileManager.isExecutableFile(atPath: tool.path) ? tool : nil
    }

    // MARK: Looking at the link

    /// What is at the link path.
    enum Found: Equatable {
        case nothing
        /// A symbolic link ending in `helperSuffix`, to `target`.
        case ours(target: String)
        /// Anything else, described for the person.
        case other(String)
    }

    static func inspect(_ link: URL, fileManager: FileManager = .default) -> Found {
        let attributes: [FileAttributeKey: Any]
        do {
            attributes = try fileManager.attributesOfItem(atPath: link.path)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile {
            return .nothing
        } catch {
            return .other("something that can’t be read")
        }
        // attributesOfItem looks at the link itself, not where it leads.
        let type = attributes[.type] as? FileAttributeType
        if type == .typeSymbolicLink {
            guard let target = try? fileManager.destinationOfSymbolicLink(atPath: link.path) else {
                return .other("a link that can’t be read")
            }
            let absolute = absoluteTarget(target, relativeTo: link)
            return absolute.hasSuffix(helperSuffix) ? .ours(target: absolute) : .other("a link to \(absolute)")
        }
        if type == .typeDirectory { return .other("a folder") }
        if type == .typeRegular { return .other("a file") }
        return .other("something that isn’t a file or a link")
    }

    private static func absoluteTarget(_ target: String, relativeTo link: URL) -> String {
        if target.hasPrefix("/") { return URL(fileURLWithPath: target).standardizedFileURL.path }
        return URL(fileURLWithPath: target, relativeTo: link.deletingLastPathComponent())
            .absoluteURL.standardizedFileURL.path
    }

    /// The link's status, and where it stands on the PATH. `path` is the
    /// login shell's PATH the app adopted at launch.
    static func state(
        bundled: URL?,
        link: URL,
        path: String = ProcessInfo.processInfo.environment["PATH"] ?? "",
        fileManager: FileManager = .default
    ) -> State {
        let status: Status
        if let bundled {
            switch inspect(link, fileManager: fileManager) {
            case .nothing:
                status = .notInstalled
            case .ours(let target):
                let here = bundled.standardizedFileURL.path
                status = target == here ? .installed : .stale(target: target)
            case .other(let what):
                status = .blocked(what: what)
            }
        } else {
            status = .unavailable
        }
        return State(
            status: status,
            directoryOnPath: isOnPath(link.deletingLastPathComponent(), path: path),
            otherOnPath: otherOnPath(bundled: bundled, link: link, path: path)
        )
    }

    /// Whether `directory` is one of the PATH's folders.
    static func isOnPath(_ directory: URL, path: String) -> Bool {
        let wanted = directory.standardizedFileURL.path
        return path.split(separator: ":").contains {
            URL(fileURLWithPath: String($0)).standardizedFileURL.path == wanted
        }
    }

    /// The first `ganymede` on `path`, unless it is the link (ours, even a
    /// stale one that leads to another copy of the app) or leads to the
    /// bundled tool.
    static func otherOnPath(
        bundled: URL?, link: URL, path: String
    ) -> String? {
        guard let first = AppMCP.ganymedeCommand(path: path) else { return nil }
        if URL(fileURLWithPath: first).standardizedFileURL.path == link.standardizedFileURL.path { return nil }
        if let bundled,
           URL(fileURLWithPath: first).resolvingSymlinksInPath().path
            == bundled.resolvingSymlinksInPath().path { return nil }
        return first
    }

    /// What Claude Desktop's MCP config runs: the `ganymede` on `path`,
    /// else the bundled tool's full path, else the bare name. Claude
    /// Desktop doesn't use the shell's PATH, so a path is better.
    static func desktopCommand(
        path: String = ProcessInfo.processInfo.environment["PATH"] ?? "",
        bundled: URL? = bundledTool()
    ) -> String {
        AppMCP.ganymedeCommand(path: path) ?? bundled?.path ?? "ganymede"
    }

    /// The first line of `binary --version`, or nil when it doesn't run,
    /// fails or takes longer than `timeout` seconds. Blocks: call it off
    /// the main thread.
    static func version(of binary: String, timeout: TimeInterval = 3) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binary)
        process.arguments = ["--version"]
        let output = Pipe()
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        process.standardInput = FileHandle.nullDevice
        let exited = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in exited.signal() }
        do {
            try process.run()
        } catch {
            return nil
        }
        if exited.wait(timeout: .now() + timeout) == .timedOut {
            process.terminate()
            return nil
        }
        let text = String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        guard process.terminationStatus == 0 else { return nil }
        let line = text.split(whereSeparator: \.isNewline).first.map(String.init)?
            .trimmingCharacters(in: .whitespaces)
        return line?.isEmpty == false ? line : nil
    }

    /// What to tell someone whose PATH from the login shell lacks
    /// `~/.local/bin`. The app takes its PATH from `$SHELL -l`
    /// (`LoginShell`), which reads the login profile, not the file for
    /// interactive shells that terminals also read; Claude Desktop starts
    /// the command with launchd's PATH.
    static func pathAdvice(shell: String? = ProcessInfo.processInfo.environment["SHELL"]) -> String {
        let zsh = shell?.hasSuffix("zsh") == true
        let file = zsh ? "~/.zprofile" : "your login shell’s profile"
        let interactive = zsh ? "~/.zshrc" : "the file your terminal reads"
        return "Ganymede’s login shell doesn’t have ~/.local/bin on its PATH. A line in \(interactive) reaches your terminals but not Ganymede or Claude Desktop, so add this to \(file):"
    }

    // MARK: Installing and removing

    /// Moves `url` to the Trash: the item itself, so a link goes and what
    /// it points at stays.
    static func moveToTrash(_ url: URL) throws {
        try FileManager.default.trashItem(at: url, resultingItemURL: nil)
    }

    /// Links `link` to `bundled`: creates `~/.local/bin` if needed, and
    /// replaces the app's own link, even a stale one. Anything else at
    /// `link` stops it with `ToolError.blocked`, unless `force` (the
    /// person confirmed): then `trash` moves it aside first, and if that
    /// fails it stays where it is and nothing is linked.
    static func install(
        bundled: URL?, link: URL, force: Bool = false, fileManager: FileManager = .default,
        trash: (URL) throws -> Void = moveToTrash
    ) throws {
        guard let bundled else { throw ToolError.noBundledTool }
        // Gatekeeper runs a downloaded app from a randomized read-only
        // copy until it is moved; a link to that would break at the next
        // launch.
        if bundled.path.contains("/AppTranslocation/") { throw ToolError.translocated }
        switch inspect(link, fileManager: fileManager) {
        case .other(let what):
            guard force else { throw ToolError.blocked(link: link.path, what: what) }
            do {
                try trash(link)
            } catch {
                throw ToolError.failed(
                    "Couldn’t move \(link.path) to the Trash, so it is still there: \(error.localizedDescription)"
                )
            }
        case .nothing, .ours:
            break
        }
        let directory = link.deletingLastPathComponent()
        do {
            try fileManager.createDirectory(
                at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o755]
            )
        } catch {
            throw ToolError.failed("Couldn’t create \(directory.path): \(error.localizedDescription)")
        }
        // A new link renamed over the old one, so a failure leaves the old
        // one in place and a terminal never finds the command missing.
        let temp = directory.appendingPathComponent(".ganymede-\(UUID().uuidString)")
        do {
            try fileManager.createSymbolicLink(at: temp, withDestinationURL: bundled)
        } catch {
            throw ToolError.failed("Couldn’t link \(link.path): \(error.localizedDescription)")
        }
        guard rename(temp.path, link.path) == 0 else {
            let reason = String(cString: strerror(errno))
            try? fileManager.removeItem(at: temp)
            throw ToolError.failed("Couldn’t link \(link.path): \(reason)")
        }
    }

    /// Removes the app's own link. Anything else at `link` stays, with
    /// `ToolError.blocked`; nothing there is not an error.
    static func uninstall(link: URL, fileManager: FileManager = .default) throws {
        switch inspect(link, fileManager: fileManager) {
        case .nothing:
            return
        case .other(let what):
            throw ToolError.blocked(link: link.path, what: what)
        case .ours:
            do {
                // Removes the link, not what it points at.
                try fileManager.removeItem(at: link)
            } catch {
                throw ToolError.failed("Couldn’t remove \(link.path): \(error.localizedDescription)")
            }
        }
    }
}
#endif
