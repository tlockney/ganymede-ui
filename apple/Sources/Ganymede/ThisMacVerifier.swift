#if os(macOS)
import Foundation
import Security

/// The lookups a this-Mac check makes (#883), behind a protocol so the
/// tests inject fakes: the info files on disk, the app's own identity, and
/// a process's liveness, signature and sockets.
protocol ThisMacProbe: Sendable {
    /// The server info files (`jpserver-<pid>.json`) in `directory`.
    func infoFiles(in directory: URL) -> [URL]
    /// The team ID in the running app's own signature; nil for an unsigned
    /// or ad-hoc-signed build, which trusts no server.
    var teamIdentifier: String? { get }
    /// The identifier in the signature of the app's bundled `ganymede`
    /// (`Contents/Helpers`); nil when the app bundles none.
    var helperIdentifier: String? { get }
    /// The version the bundled `ganymede` reports (`--version`); nil when it
    /// doesn't run.
    var bundledVersion: String? { get }
    /// Whether a process with this pid is running.
    func isRunning(_ pid: Int32) -> Bool
    /// Whether this pid's code is signed for `team`'s team, with
    /// `identifier`: the app's own bundled helper and nobody else's code.
    func hasSignature(pid: Int32, team: String, identifier: String) -> Bool
    /// Whether this pid holds a TCP socket listening on `port`.
    func isListening(pid: Int32, port: Int) -> Bool
}

/// Whether a `jpserver-<pid>.json` is this Mac's own Ganymede (#883).
///
/// The app can't trust a server for being on `localhost`: any process of
/// any user can listen on a loopback port, and the app sends that server
/// its token. So the check is who is listening: the info file this user's
/// Jupyter runtime directory holds (mode 0600, so only this user's
/// processes write one) names a loopback address, a live pid that is the
/// app's own bundled `ganymede` — signed for the app's team, with the
/// helper's identifier — that holds the listening socket, and the app's own
/// version. Anything else is an ordinary machine: a `cargo install` or
/// Homebrew `ganymede` stays one, and the bundled helper started from a
/// terminal qualifies.
struct ThisMacVerifier {
    let probe: any ThisMacProbe

    init(probe: any ThisMacProbe = SystemThisMacProbe()) {
        self.probe = probe
    }

    /// Whether `info`, one server info file's fields, is this Mac's own
    /// Ganymede. Every part must hold; a build that can't say who it is (a
    /// debug build, signed ad hoc) verifies nothing, which is intended.
    func verify(_ info: ThisMacServer) -> Bool {
        verify(
            info, team: probe.teamIdentifier, identifier: probe.helperIdentifier,
            version: probe.bundledVersion)
    }

    /// The servers of this Mac's own Ganymede in `directory`, the info files
    /// that verify. The app's own identity is looked at once for them all.
    func servers(in directory: URL = AppMCP.runtimeDirectory()) -> [ThisMacServer] {
        let team = probe.teamIdentifier
        let identifier = probe.helperIdentifier
        let version = probe.bundledVersion
        return probe.infoFiles(in: directory).compactMap { file in
            guard let info = Self.read(file),
                  verify(info, team: team, identifier: identifier, version: version)
            else { return nil }
            return info
        }
    }

    private func verify(
        _ info: ThisMacServer, team: String?, identifier: String?, version: String?
    ) -> Bool {
        // A loopback port is the only place a server it trusts may listen,
        // and the one the app sends its token to through the mount.
        guard let host = info.url.host, ThisMacServer.isLoopback(host),
              let port = info.port, (1...65535).contains(port)
        else { return false }
        // An unsigned or ad-hoc-signed app has no team and no identifier to
        // require, so it verifies nothing: a debug build counts its own
        // bundled server as a machine.
        guard let team, !team.isEmpty, let identifier, !identifier.isEmpty,
              probe.isRunning(info.pid),
              probe.hasSignature(pid: info.pid, team: team, identifier: identifier),
              probe.isListening(pid: info.pid, port: port),
              let version, version == info.version
        else { return false }
        return true
    }

    /// One info file's fields; nil when it isn't a server info file or
    /// lacks what the check reads. `ganymede serve` writes `pid`,
    /// `ganymede_version` and `root_dir` beside Jupyter's own keys.
    static func read(_ file: URL) -> ThisMacServer? {
        guard let data = try? Data(contentsOf: file),
              let fields = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let url = (fields["url"] as? String).flatMap(URL.init(string:)),
              let token = fields["token"] as? String, !token.isEmpty,
              let root = fields["root_dir"] as? String, !root.isEmpty,
              let pid = (fields["pid"] as? Int).flatMap({ Int32(exactly: $0) }),
              let version = fields["ganymede_version"] as? String, !version.isEmpty
        else { return nil }
        return ThisMacServer(
            pid: pid, url: url, token: token,
            root: URL(fileURLWithPath: root, isDirectory: true), version: version)
    }
}

/// The system's lookups (#883): the Security framework for signatures,
/// libproc for sockets, and the bundled tool for its version.
struct SystemThisMacProbe: ThisMacProbe {
    /// The app's `Contents/Helpers/ganymede`, which a server must be.
    var bundledTool: URL? = CommandLineTool.bundledTool()

    func infoFiles(in directory: URL) -> [URL] {
        let files =
            (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil))
            ?? []
        return files
            .filter { $0.lastPathComponent.hasPrefix("jpserver-") && $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    /// The running app's team, from its own signature. Absent on a build
    /// signed ad hoc, which is how a debug build is made.
    var teamIdentifier: String? {
        var code: SecCode?
        guard SecCodeCopySelf([], &code) == errSecSuccess, let code else { return nil }
        // A `SecCode` is a static code for the signature's sake: the same
        // object to the Security framework, which the SDK's Swift types
        // don't say.
        return signingInformation(unsafeBitCast(code, to: SecStaticCode.self))?[kSecCodeInfoTeamIdentifier as String]
            as? String
    }

    /// The identifier the bundled tool's signature carries. The release
    /// workflow signs `Contents/Helpers/ganymede` with no `--identifier`
    /// (`apple/scripts/release-app.sh`, and the post-build phase in
    /// `apple/project.yml`), so codesign makes one up from the tool's name
    /// and its Mach-O UUID, and it changes with each build: ask the
    /// signature instead of guessing it.
    var helperIdentifier: String? {
        guard let bundledTool else { return nil }
        var code: SecStaticCode?
        guard SecStaticCodeCreateWithPath(bundledTool as CFURL, [], &code) == errSecSuccess,
              let code
        else { return nil }
        return signingInformation(code)?[kSecCodeInfoIdentifier as String] as? String
    }

    /// `ganymede --version` says `ganymede 0.17.0`, and the info file's
    /// `ganymede_version` is the last word. Read once: the app's own tool
    /// doesn't change while it runs, and reading it runs it.
    var bundledVersion: String? { Self.version }

    private static let version: String? = {
        guard let tool = CommandLineTool.bundledTool(),
              let line = CommandLineTool.version(of: tool.path)
        else { return nil }
        return line.split(whereSeparator: \.isWhitespace).last.map(String.init)
    }()

    func isRunning(_ pid: Int32) -> Bool {
        // Signal 0 asks without sending one; a process of another user
        // answers EPERM, which is still running.
        kill(pid, 0) == 0 || errno == EPERM
    }

    /// Whether `pid`'s code meets a requirement naming Apple's anchor, this
    /// team's certificate and the bundled tool's identifier. A process of
    /// another user can't be asked (`SecCodeCopyGuestWithAttributes` needs
    /// the pid's owner), and doesn't verify.
    func hasSignature(pid: Int32, team: String, identifier: String) -> Bool {
        let text = "anchor apple generic and certificate leaf[subject.OU] = \"\(team)\""
            + " and identifier \"\(identifier)\""
        var requirement: SecRequirement?
        guard SecRequirementCreateWithString(text as CFString, [], &requirement) == errSecSuccess,
              let requirement
        else { return false }
        var code: SecCode?
        let attributes = [kSecGuestAttributePid: pid] as CFDictionary
        guard SecCodeCopyGuestWithAttributes(nil, attributes, [], &code) == errSecSuccess, let code
        else { return false }
        return SecCodeCheckValidity(code, [], requirement) == errSecSuccess
    }

    /// Whether `pid` holds a TCP socket listening on `port`: libproc's list
    /// of its file descriptors, then each socket's own information. A
    /// socket in `TSI_S_LISTEN` is a listener; a connected one to the same
    /// port isn't, whatever its peer.
    func isListening(pid: Int32, port: Int) -> Bool {
        let stride = Int32(MemoryLayout<proc_fdinfo>.stride)
        // The size the whole list needs: the kernel says so when the buffer
        // given is too small, which none is.
        let needed = proc_pidinfo(pid, PROC_PIDLISTFDS, 0, nil, 0)
        guard needed > 0 else { return false }
        // A few spare entries: the process may open one between the calls.
        var fds = [proc_fdinfo](repeating: proc_fdinfo(), count: Int(needed) / Int(stride) + 8)
        let size = proc_pidinfo(pid, PROC_PIDLISTFDS, 0, &fds, Int32(fds.count) * stride)
        guard size > 0 else { return false }
        for fd in fds.prefix(Int(size) / Int(stride)) where fd.proc_fdtype == PROX_FDTYPE_SOCKET {
            var info = socket_fdinfo()
            let got = proc_pidfdinfo(
                pid, fd.proc_fd, PROC_PIDFDSOCKETINFO, &info, Int32(MemoryLayout<socket_fdinfo>.size))
            guard got == Int32(MemoryLayout<socket_fdinfo>.size), info.psi.soi_kind == SOCKINFO_TCP else {
                continue
            }
            let tcp = info.psi.soi_proto.pri_tcp
            guard tcp.tcpsi_state == TSI_S_LISTEN else { continue }
            // The port is in network byte order.
            let local = Int(UInt16(bigEndian: UInt16(truncatingIfNeeded: tcp.tcpsi_ini.insi_lport)))
            if local == port { return true }
        }
        return false
    }

    private func signingInformation(_ code: SecStaticCode) -> [String: Any]? {
        var information: CFDictionary?
        guard SecCodeCopySigningInformation(
            code, SecCSFlags(rawValue: kSecCSSigningInformation), &information) == errSecSuccess
        else { return nil }
        return information as? [String: Any]
    }
}
#endif
