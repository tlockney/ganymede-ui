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
    /// The canonical path of the app's bundled `ganymede`
    /// (`Contents/Helpers/ganymede`); nil when the app bundles none (#912).
    var helperPath: String? { get }
    /// The version the bundled `ganymede` reports (`--version`); nil when it
    /// doesn't run.
    var bundledVersion: String? { get }
    /// Whether a process with this pid is running.
    func isRunning(_ pid: Int32) -> Bool
    /// The executable path of `pid`, or nil when it can't be read (#912).
    func executablePath(of pid: Int32) -> String?
    /// Whether this pid's code is signed for `team`'s team, with
    /// `identifier`: the app's own bundled helper and nobody else's code.
    func hasSignature(pid: Int32, team: String, identifier: String) -> Bool
    /// Whether this pid holds a TCP socket listening on `port` at `host`,
    /// the literal address the info file named (`127.0.0.1` or `::1`).
    func isListening(pid: Int32, port: Int, host: String) -> Bool
    /// Whether this pid holds a TCP socket listening on `port` at a wildcard
    /// address (`0.0.0.0` or `::`), answering on every interface (#887).
    func isListeningOnWildcard(pid: Int32, port: Int) -> Bool
}

/// Whether a `jpserver-<pid>.json` is this Mac's own Ganymede (#883).
///
/// The app can't trust a server for being on `localhost`: any process of
/// any user can listen on a loopback port, and the app sends that server
/// its token. So the check is who is listening: the info file this user's
/// Jupyter runtime directory holds (this user's own, which Jupyter creates
/// 0700, so only this user's processes write one) names `127.0.0.1` or `::1` as its literal — never
/// a name, and never a wildcard bind, which the socket lookup refuses — a
/// live pid that is the app's own bundled `ganymede` — at the bundled helper's
/// path and signed for the app's team, with the helper's identifier — that
/// holds the listening socket on that address, and the app's own version.
/// Anything else is an ordinary machine: a `cargo install` or Homebrew
/// `ganymede` stays one, and the bundled helper started from a terminal
/// qualifies.
struct ThisMacVerifier {
    let probe: any ThisMacProbe

    init(probe: any ThisMacProbe = SystemThisMacProbe()) {
        self.probe = probe
    }

    /// Whether `info`, one server info file's fields, is this Mac's own
    /// Ganymede. Every part must hold; a build that can't say who it is (a
    /// debug build, signed ad hoc) verifies nothing, which is intended.
    func verify(_ info: ThisMacServer) -> Bool {
        diagnose(info) == nil
    }

    /// Why `info` does not verify as this Mac's own Ganymede, or `nil` when
    /// every check passes (#887). `verify(_:)` is `diagnose(_:) == nil`.
    func diagnose(_ info: ThisMacServer, hostname: String? = nil) -> ThisMacTrustFailure? {
        if let appFailure = appIdentityFailure() { return appFailure }
        guard let team = probe.teamIdentifier,
              let identifier = probe.helperIdentifier,
              let helperPath = probe.helperPath
        else { return .unsignedApp }
        let candidate = Candidate(
            pid: info.pid, url: info.url, hostname: hostname, port: info.port,
            token: info.token, root: info.root, version: info.version)
        return evaluate(
            candidate, team: team, identifier: identifier, helperPath: helperPath
        ) { probe.bundledVersion }.entry.failure
    }

    /// The servers of this Mac's own Ganymede in `directory`, the info files
    /// that verify and match the bundled tool's version.
    func servers(in directory: URL = AppMCP.runtimeDirectory()) -> [ThisMacServer] {
        scan(in: directory).verified
    }

    /// Scans `directory` for servers of this Mac's own Ganymede (#883, #912,
    /// #887): `verified` holds servers matching the bundled tool's version,
    /// `mismatched` holds verified bundled helpers running another version
    /// (such as before launchd restarts the background server after an app
    /// update), and `entries` / `appFailure` record why any candidate failed
    /// so loopback machine windows can say why. The bundled tool's version is
    /// read only once an info file has passed the cheaper checks, since
    /// reading it runs the tool.
    func scan(in directory: URL = AppMCP.runtimeDirectory()) -> ThisMacScanResult {
        if let appFailure = appIdentityFailure() {
            return ThisMacScanResult(appFailure: appFailure, entries: [])
        }
        guard let team = probe.teamIdentifier,
              let identifier = probe.helperIdentifier,
              let helperPath = probe.helperPath
        else {
            return ThisMacScanResult(appFailure: .unsignedApp, entries: [])
        }
        var readVersion = false
        var version: String?
        /// `probe.bundledVersion`, read once for all the files.
        func bundledVersion() -> String? {
            if !readVersion {
                version = probe.bundledVersion
                readVersion = true
            }
            return version
        }
        var entries: [ThisMacScanEntry] = []
        var mismatched: [ThisMacServer] = []
        for file in probe.infoFiles(in: directory) {
            guard let candidate = Self.readCandidate(file) else { continue }
            let evaluated = evaluate(
                candidate, team: team, identifier: identifier, helperPath: helperPath,
                bundledVersion: bundledVersion)
            entries.append(evaluated.entry)
            if let server = evaluated.mismatched {
                mismatched.append(server)
            }
        }
        return ThisMacScanResult(mismatched: mismatched, appFailure: nil, entries: entries)
    }

    /// Why this app build itself cannot verify any server, or `nil` when it
    /// has a team ID, a signed bundled helper, and that helper's canonical
    /// path.
    private func appIdentityFailure() -> ThisMacTrustFailure? {
        guard let team = probe.teamIdentifier, !team.isEmpty else { return .unsignedApp }
        guard let identifier = probe.helperIdentifier, !identifier.isEmpty,
              let helperPath = probe.helperPath, !helperPath.isEmpty
        else { return .missingBundledHelper }
        return nil
    }

    /// One `jpserver-*.json` file's fields before verification: preserves
    /// `hostname` (where `ganymede serve --ip 0.0.0.0` writes `"0.0.0.0"`
    /// while its `url` says `localhost`) and allows missing `token`,
    /// `root_dir`, or `ganymede_version` so the failure reason can name them.
    private struct Candidate {
        var pid: Int32
        var url: URL
        var hostname: String?
        var port: Int?
        var token: String
        var root: URL?
        var version: String?
    }

    /// Evaluates one candidate info file, checking the cheaper conditions
    /// before calling `bundledVersion` so failing files never spawn the
    /// bundled helper (#883, #912, #887). `mismatched` is non-nil only when
    /// every identity and socket check passed and only the version differed.
    private func evaluate(
        _ candidate: Candidate, team: String, identifier: String, helperPath: String,
        bundledVersion: () -> String?
    ) -> (entry: ThisMacScanEntry, mismatched: ThisMacServer?) {
        let port = candidate.port ?? 0
        func fail(_ reason: ThisMacTrustFailure, running: Bool) -> (ThisMacScanEntry, ThisMacServer?) {
            let entry = ThisMacScanEntry(
                url: candidate.url, hostname: candidate.hostname, port: port,
                token: candidate.token, isRunning: running, failure: reason)
            return (entry, nil)
        }
        guard (1...65535).contains(port) else {
            return fail(.notListening, running: probe.isRunning(candidate.pid))
        }
        guard probe.isRunning(candidate.pid) else {
            return fail(.processNotRunning, running: false)
        }
        guard probe.executablePath(of: candidate.pid) == helperPath else {
            return fail(.wrongExecutablePath, running: true)
        }
        guard probe.hasSignature(pid: candidate.pid, team: team, identifier: identifier) else {
            return fail(.wrongSignature, running: true)
        }
        if candidate.hostname.map(ThisMacServer.isWildcardAddress) == true
            || candidate.url.host.map(ThisMacServer.isWildcardAddress) == true
        {
            return fail(.wildcardBind, running: true)
        }
        // A loopback address is the only place a server it trusts may
        // listen, and the one the app sends its token to through the mount.
        // The literal, not a name: what `localhost` resolves to is the
        // system's to say, and the socket the check looks at is at the
        // address written here.
        guard let host = candidate.url.host else {
            return fail(.nonLoopbackAddress, running: true)
        }
        if !ThisMacServer.isTrustedAddress(host) {
            if ThisMacServer.isLocalhostName(host) {
                if probe.isListeningOnWildcard(pid: candidate.pid, port: port) {
                    return fail(.wildcardBind, running: true)
                }
                return fail(.infoFileUsesLocalhost, running: true)
            }
            return fail(.nonLoopbackAddress, running: true)
        }
        if !probe.isListening(pid: candidate.pid, port: port, host: host) {
            if probe.isListeningOnWildcard(pid: candidate.pid, port: port) {
                return fail(.wildcardBind, running: true)
            }
            return fail(.notListening, running: true)
        }
        guard !candidate.token.isEmpty else {
            return fail(.missingToken, running: true)
        }
        guard let root = candidate.root, let version = candidate.version, !version.isEmpty else {
            return fail(.incompleteServerInfo, running: true)
        }
        guard let bundled = bundledVersion() else {
            return fail(.bundledVersionUnavailable, running: true)
        }
        let server = ThisMacServer(
            pid: candidate.pid, url: candidate.url, token: candidate.token,
            root: root, version: version)
        guard bundled == version else {
            let entry = ThisMacScanEntry(
                url: candidate.url, hostname: candidate.hostname, port: port,
                token: candidate.token, isRunning: true,
                failure: .versionMismatch(server: version, app: bundled))
            return (entry, server)
        }
        return (ThisMacScanEntry(verified: server, hostname: candidate.hostname), nil)
    }

    /// Reads one `jpserver-*.json` file as a candidate for `scan(in:)`; nil
    /// only when the file isn't JSON or has no `url`/`pid` at all.
    private static func readCandidate(_ file: URL) -> Candidate? {
        guard let data = try? Data(contentsOf: file),
              let fields = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let url = (fields["url"] as? String).flatMap(URL.init(string:)),
              let pid = (fields["pid"] as? Int).flatMap({ Int32(exactly: $0) })
        else { return nil }
        let hostname = fields["hostname"] as? String
        let port = url.port ?? (fields["port"] as? Int)
        let token = fields["token"] as? String ?? ""
        let root = (fields["root_dir"] as? String).flatMap {
            $0.isEmpty ? nil : URL(fileURLWithPath: $0, isDirectory: true)
        }
        let version = (fields["ganymede_version"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        return Candidate(
            pid: pid, url: url, hostname: hostname, port: port,
            token: token, root: root, version: version)
    }

    /// One info file's fields; nil when it isn't a server info file or
    /// lacks what the check reads. `ganymede serve` writes `pid`,
    /// `ganymede_version` and `root_dir` beside Jupyter's own keys.
    static func read(_ file: URL) -> ThisMacServer? {
        guard let candidate = readCandidate(file),
              !candidate.token.isEmpty,
              let root = candidate.root,
              let version = candidate.version
        else { return nil }
        return ThisMacServer(
            pid: candidate.pid, url: candidate.url, token: candidate.token,
            root: root, version: version)
    }
}

/// The system's lookups (#883): the Security framework for signatures,
/// libproc for sockets, and the bundled tool for its version.
struct SystemThisMacProbe: ThisMacProbe {
    /// The app's `Contents/Helpers/ganymede`, which a server must be.
    var bundledTool: URL? = CommandLineTool.bundledTool()

    func infoFiles(in directory: URL) -> [URL] { AppMCP.serverInfoFiles(in: directory) }

    /// The running app's team, from its own signature. Absent on a build
    /// signed ad hoc, which is how a debug build is made.
    var teamIdentifier: String? {
        var code: SecCode?
        guard SecCodeCopySelf([], &code) == errSecSuccess, let code else { return nil }
        // The signature's information is the static code's: the same
        // object to the Security framework, which the SDK's Swift types
        // don't say.
        var staticCode: SecStaticCode?
        guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode
        else { return nil }
        return signingInformation(staticCode)?[kSecCodeInfoTeamIdentifier as String] as? String
    }

    /// The identifier the bundled tool's signature carries. `project.yml`
    /// and `release-app.sh` sign `Contents/Helpers/ganymede` with
    /// `BackgroundServer.helperIdentifier` (#912) so the identifier stays
    /// stable across app updates; asking the signature still reads whatever
    /// identifier the bundled copy carries rather than assuming it.
    var helperIdentifier: String? {
        guard let bundledTool else { return nil }
        var code: SecStaticCode?
        guard SecStaticCodeCreateWithPath(bundledTool as CFURL, [], &code) == errSecSuccess,
              let code
        else { return nil }
        return signingInformation(code)?[kSecCodeInfoIdentifier as String] as? String
    }

    /// The canonical path of the app's bundled `ganymede` helper (#912).
    var helperPath: String? {
        bundledTool?.standardizedFileURL.resolvingSymlinksInPath().path
    }

    /// `ganymede --version` says `ganymede 0.17.0`, and the info file's
    /// `ganymede_version` is the last word. A success is kept — the app's
    /// own tool doesn't change while it runs — and a failed read is tried
    /// again next time, since reading it runs the tool and may fail once
    /// (#883).
    var bundledVersion: String? {
        Self.cache.version {
            guard let tool = CommandLineTool.bundledTool(),
                  let line = CommandLineTool.version(of: tool.path)
            else { return nil }
            return line.split(whereSeparator: \.isWhitespace).last.map(String.init)
        }
    }

    /// The bundled tool's version once it was read: the check runs off the
    /// main thread and windows read it too (`verifyThisMacNow`), so the
    /// read is behind a lock. Internal, not private, so the tests can hold
    /// one and see a kept success and a retried failure.
    final class VersionCache: @unchecked Sendable {
        private let lock = NSLock()
        private var version: String?

        /// The version `read` gives, once; a nil read isn't kept.
        func version(_ read: () -> String?) -> String? {
            lock.lock()
            defer { lock.unlock() }
            if let version { return version }
            version = read()
            return version
        }
    }

    private static let cache = VersionCache()

    func isRunning(_ pid: Int32) -> Bool {
        // Signal 0 asks without sending one; a process of another user
        // answers EPERM, which is still running.
        kill(pid, 0) == 0 || errno == EPERM
    }

    /// The canonical path of `pid`'s executable (#912): `proc_pidpath` gives
    /// the live vnode path, and if an app update moved the old bundle aside
    /// (for example to Trash) while the old helper still runs, `KERN_PROCARGS2`
    /// preserves the path the process was launched from.
    func executablePath(of pid: Int32) -> String? {
        let live = Self.pidPath(pid)
        if let live, live == helperPath { return live }
        if let helperPath, let launched = Self.launchedPath(pid), launched == helperPath {
            return launched
        }
        return live
    }

    /// The live executable path of `pid` via `proc_pidpath`, standardized and
    /// symlink-resolved to match `helperPath`.
    static func pidPath(_ pid: Int32) -> String? {
        var buffer = [CChar](repeating: 0, count: Int(MAXPATHLEN) * 4)
        let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
        guard length > 0 else { return nil }
        let path = String(cString: buffer)
        return URL(fileURLWithPath: path).standardizedFileURL.resolvingSymlinksInPath().path
    }

    /// The executable path recorded by the kernel at `execve` time via
    /// `KERN_PROCARGS2`, standardized and symlink-resolved.
    private static func launchedPath(_ pid: Int32) -> String? {
        var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, pid]
        var size = 0
        guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > MemoryLayout<Int32>.size else {
            return nil
        }
        var buffer = [UInt8](repeating: 0, count: size)
        guard sysctl(&mib, 3, &buffer, &size, nil, 0) == 0 else { return nil }
        let bytes = buffer.dropFirst(MemoryLayout<Int32>.size).prefix { $0 != 0 }
        guard !bytes.isEmpty, let path = String(bytes: bytes, encoding: .utf8) else { return nil }
        return URL(fileURLWithPath: path).standardizedFileURL.resolvingSymlinksInPath().path
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

    /// Whether `pid` holds a TCP socket listening on `port` at `host`, the
    /// literal loopback address the info file named: libproc's list of its
    /// file descriptors, then each socket's own information. A socket in
    /// `TSI_S_LISTEN` is a listener, and it must be at that address: one a
    /// wildcard bind made listens on every interface, and the app's token
    /// must not go there. A connected socket to the same port isn't a
    /// listener, whatever its peer.
    func isListening(pid: Int32, port: Int, host: String) -> Bool {
        hasListeningSocket(pid: pid, port: port) { Self.isAddress($0, host) }
    }

    /// Whether `pid` holds a TCP socket listening on `port` at a wildcard
    /// address (`0.0.0.0` or `::`), answering on every interface (#887).
    func isListeningOnWildcard(pid: Int32, port: Int) -> Bool {
        hasListeningSocket(pid: pid, port: port) { Self.isWildcard($0) }
    }

    private func hasListeningSocket(
        pid: Int32, port: Int, matching predicate: (in_sockinfo) -> Bool
    ) -> Bool {
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
            if local == port, predicate(tcp.tcpsi_ini) { return true }
        }
        return false
    }

    /// Whether `info`'s local address is a wildcard (`0.0.0.0` or `::`),
    /// answering on every interface (#887). Dual-stack IPv6 sockets may carry
    /// both `INI_IPV4` (0x1) and `INI_IPV6` (0x2).
    private static func isWildcard(_ info: in_sockinfo) -> Bool {
        if (info.insi_vflag & 0x2) != 0 {  // INI_IPV6 (including dual-stack)
            var address = info.insi_laddr.ina_6
            return withUnsafeBytes(of: &address) { bytes in
                bytes.count == 16 && bytes.allSatisfy { $0 == 0 }
            }
        }
        if info.insi_vflag == 0x1 {  // INI_IPV4
            return UInt32(bigEndian: info.insi_laddr.ina_46.i46a_addr4.s_addr) == 0
        }
        return false
    }

    /// Whether `info`'s local address is `host`, written as the literal it
    /// must be: the IPv4 loopback or the IPv6 one, by the socket's own IP
    /// version. A wildcard bind (`0.0.0.0`, `::`) is neither.
    private static func isAddress(_ info: in_sockinfo, _ host: String) -> Bool {
        switch (info.insi_vflag, ThisMacServer.normalize(host)) {
        case (0x1, "127.0.0.1"):  // INI_IPV4
            // `s_addr` is in network byte order.
            return UInt32(bigEndian: info.insi_laddr.ina_46.i46a_addr4.s_addr) == 0x7F00_0001
        case (0x2, "::1"):  // INI_IPV6
            var address = info.insi_laddr.ina_6
            return withUnsafeBytes(of: &address) { bytes in
                bytes.count == 16 && bytes.dropLast().allSatisfy { $0 == 0 } && bytes.last == 1
            }
        default:
            return false
        }
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
