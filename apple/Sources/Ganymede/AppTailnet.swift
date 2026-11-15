#if os(macOS)
import Foundation

/// Sharing the app's server on the tailnet (ganymede#816, step 4): the
/// app puts `tailscale serve` in front of its loopback server, so other
/// devices on the tailnet open `https://<this Mac>.<tailnet>.ts.net/`, and
/// the logins listed in Settings get in without the token. Off by
/// default.
///
/// The server trusts the login `tailscale serve` sends only from loopback,
/// only from its own pages, and only for listed logins (Ganymede's
/// `[tailscale] allow`, docs/security.md "Tailnet identity"). Any other
/// process on this Mac can also connect to loopback and send that header,
/// which is why it is meant for a Mac only one person uses.
enum AppTailnet {
    static let shareKey = "tailnetShare"
    static let allowKey = "tailnetAllow"
    /// The port the app last pointed `tailscale serve` at, so it removes
    /// only its own handler.
    static let servedPortKey = "tailnetServedPort"

    /// The HTTPS port `tailscale serve` listens on.
    static let httpsPort = 443

    /// Where the `tailscale` command is: the Tailscale app's own (App
    /// Store or standalone), else Homebrew's or the open-source build's.
    static func command(
        isExecutable: (String) -> Bool = FileManager.default.isExecutableFile(atPath:)
    ) -> String? {
        [
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
            "/opt/homebrew/bin/tailscale",
            "/usr/local/bin/tailscale",
        ].first(where: isExecutable)
    }

    /// The logins (and tags) typed in Settings: separated by commas, spaces
    /// or new lines, each once, in order.
    static func allowList(_ text: String) -> [String] {
        var seen = Set<String>()
        return text
            .split(whereSeparator: { $0 == "," || $0.isWhitespace })
            .map(String.init)
            .filter { seen.insert($0).inserted }
    }

    /// This Mac's MagicDNS name (`box.tailnet.ts.net`) from
    /// `tailscale status --json`, without the trailing dot; nil when
    /// Tailscale isn't running or has no name for it.
    static func dnsName(status: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: status) as? [String: Any],
              let me = json["Self"] as? [String: Any],
              let name = me["DNSName"] as? String
        else { return nil }
        let trimmed = name.hasSuffix(".") ? String(name.dropLast()) : name
        return trimmed.isEmpty ? nil : trimmed
    }

    /// The Tailscale login this Mac is signed in as (`you@example.com`),
    /// from `tailscale status --json`: `Self.UserID` names an entry of the
    /// top-level `User` map, whose `LoginName` is the login. nil when
    /// Tailscale isn't running or any of those is missing or empty, and on
    /// a tagged Mac, whose user is Tailscale's `tagged-devices`, no person.
    static func ownLogin(status: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: status) as? [String: Any],
              let me = json["Self"] as? [String: Any],
              (me["Tags"] as? [Any] ?? []).isEmpty,
              // A JSON number: an NSNumber here.
              let id = (me["UserID"] as? NSNumber).map({ String($0.int64Value) }),
              let users = json["User"] as? [String: Any],
              let user = users[id] as? [String: Any],
              let login = user["LoginName"] as? String,
              !login.isEmpty, login != "tagged-devices"
        else { return nil }
        return login
    }

    /// Another device on the tailnet, for the remote editor's picker.
    struct Peer: Equatable, Identifiable, Sendable {
        /// The first label of its MagicDNS name: its machine name, as the
        /// URL and Tailscale's own apps show it.
        let name: String
        /// Its MagicDNS name, without the trailing dot.
        let dnsName: String
        let online: Bool
        var id: String { dnsName }

        /// Where a Ganymede server shared with `tailscale serve` answers.
        var serverURL: String { "https://\(dnsName)/" }
    }

    /// The other devices in `tailscale status --json`, online ones first,
    /// then by name. Mullvad exit nodes, which can number hundreds and
    /// run no Ganymede, are left out.
    static func peers(status: Data) -> [Peer] {
        guard let json = try? JSONSerialization.jsonObject(with: status) as? [String: Any],
              let peers = json["Peer"] as? [String: Any]
        else { return [] }
        return peers.values
            .compactMap { value -> Peer? in
                guard let peer = value as? [String: Any],
                      let dns = (peer["DNSName"] as? String).map({ $0.hasSuffix(".") ? String($0.dropLast()) : $0 }),
                      !dns.isEmpty, !dns.hasSuffix(".mullvad.ts.net")
                else { return nil }
                // Not `HostName`: the OS's name, `localhost` on iPhones and
                // iPads, and unchanged by a rename in the admin console.
                return Peer(
                    name: String(dns.prefix(while: { $0 != "." })),
                    dnsName: dns,
                    online: peer["Online"] as? Bool ?? false
                )
            }
            .sorted { ($0.online ? 0 : 1, $0.name.lowercased(), $0.dnsName) < ($1.online ? 0 : 1, $1.name.lowercased(), $1.dnsName) }
    }

    /// The other devices on the tailnet; none when Tailscale isn't
    /// installed or connected. On a dispatch queue, since `run` blocks.
    static func loadPeers() async -> [Peer] {
        await loadStatus().map(peers(status:)) ?? []
    }

    /// `tailscale status --json`; nil when Tailscale isn't installed or
    /// the command fails. On a dispatch queue, since `run` blocks.
    private static func loadStatus() async -> Data? {
        await withCheckedContinuation { done in
            DispatchQueue.global(qos: .userInitiated).async {
                guard let cli = command() else { return done.resume(returning: nil) }
                let status = run(cli, ["status", "--json"])
                done.resume(returning: status.code == 0 ? status.output : nil)
            }
        }
    }

    /// This Mac's Tailscale login; nil when Tailscale isn't installed or
    /// connected.
    static func loadOwnLogin() async -> String? {
        await loadStatus().flatMap(ownLogin(status:))
    }

    /// The `ganymede.toml` keys over the app's own server config: the
    /// tailnet name passes the Host check, and `allow` lets those logins
    /// in without the token. `trust_xheaders` makes the login cookie
    /// `Secure` behind serve's HTTPS.
    static func serverConfig(dnsName: String, allow: [String]) -> [String: any Sendable] {
        [
            "local_hostnames": ["localhost", dnsName],
            "trust_xheaders": true,
            "tailscale": ["allow": allow],
        ]
    }

    /// What `tailscale serve` proxies `https://name/` to now, from
    /// `tailscale serve status --json`; nil when nothing.
    static func servedTarget(status: Data, dnsName: String) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: status) as? [String: Any],
              let web = json["Web"] as? [String: Any],
              let site = web["\(dnsName):\(httpsPort)"] as? [String: Any],
              let handlers = site["Handlers"] as? [String: Any],
              let root = handlers["/"] as? [String: Any]
        else { return nil }
        return root["Proxy"] as? String
    }

    /// The address `tailscale serve` proxies to for the server on `port`.
    static func target(port: Int) -> String {
        "http://127.0.0.1:\(port)"
    }

    /// The URL other devices open.
    static func url(dnsName: String) -> URL? {
        URL(string: "https://\(dnsName)/")
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// The config for a server shared on the tailnet: asks Tailscale for
    /// this Mac's name. Off the main thread.
    static func prepare(allow: [String]) -> Result<(name: String, config: [String: any Sendable]), Failure> {
        dispatchPrecondition(condition: .notOnQueue(.main))
        guard let cli = command() else {
            return .failure(Failure(message: "Ganymede can’t find Tailscale. Install the Tailscale app, then turn this on again."))
        }
        let status = run(cli, ["status", "--json"])
        guard status.code == 0, let name = dnsName(status: status.output) else {
            return .failure(Failure(message: "Tailscale isn’t connected, or has no name for this Mac. Connect it, then turn this on again."))
        }
        return .success((name, serverConfig(dnsName: name, allow: allow)))
    }

    /// Points `tailscale serve` at the server on `port`, unless it already
    /// serves something else there that the app didn't set. `ours` is the
    /// port the app pointed it at before, if any. Off the main thread.
    static func serve(name: String, port: Int, ours: Int?) -> Result<URL, Failure> {
        dispatchPrecondition(condition: .notOnQueue(.main))
        guard let cli = command(), let url = url(dnsName: name) else {
            return .failure(Failure(message: "Ganymede can’t find Tailscale."))
        }
        let status = run(cli, ["serve", "status", "--json"])
        if let current = servedTarget(status: status.output, dnsName: name),
           current != target(port: port),
           ours.map({ current != target(port: $0) }) ?? true {
            return .failure(Failure(message: "Tailscale already serves \(current) at \(url.absoluteString). Remove that with `tailscale serve --https=\(httpsPort) off`, then turn this on again."))
        }
        let result = run(cli, ["serve", "--bg", "--https=\(httpsPort)", target(port: port)])
        guard result.code == 0 else {
            let message = String(decoding: result.output + result.error, as: UTF8.self)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return .failure(Failure(message: "tailscale serve failed: \(message.isEmpty ? "exit \(result.code)" : message)"))
        }
        return .success(url)
    }

    /// Removes the app's `tailscale serve` handler, when it still points at
    /// `port`. Off the main thread.
    static func unserve(port: Int) {
        dispatchPrecondition(condition: .notOnQueue(.main))
        guard let cli = command() else { return }
        let status = run(cli, ["status", "--json"])
        guard let name = dnsName(status: status.output) else { return }
        let served = run(cli, ["serve", "status", "--json"])
        guard servedTarget(status: served.output, dnsName: name) == target(port: port) else { return }
        _ = run(cli, ["serve", "--https=\(httpsPort)", "off"])
    }

    /// Runs `cli` with `arguments`, for at most ten seconds.
    private static func run(_ cli: String, _ arguments: [String]) -> (code: Int32, output: Data, error: Data) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: cli)
        process.arguments = arguments
        let outPipe = Pipe(), errPipe = Pipe()
        process.standardOutput = outPipe
        process.standardError = errPipe
        process.standardInput = FileHandle.nullDevice
        let exited = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in exited.signal() }
        do {
            try process.run()
        } catch {
            return (-1, Data(), Data())
        }
        // Read while it runs, so a full pipe can't stall it.
        let out = Collected(), err = Collected()
        let reading = DispatchGroup()
        DispatchQueue.global().async(group: reading) { out.set(outPipe.fileHandleForReading.readDataToEndOfFile()) }
        DispatchQueue.global().async(group: reading) { err.set(errPipe.fileHandleForReading.readDataToEndOfFile()) }
        if exited.wait(timeout: .now() + 10) == .timedOut {
            process.terminate()
            _ = reading.wait(timeout: .now() + 1)
            return (-1, Data(), Data("timed out".utf8))
        }
        reading.wait()
        return (process.terminationStatus, out.get(), err.get())
    }

    /// Bytes read on another thread.
    private final class Collected: @unchecked Sendable {
        private let lock = NSLock()
        private var data = Data()
        func set(_ value: Data) { lock.withLock { data = value } }
        func get() -> Data { lock.withLock { data } }
    }
}
#endif
