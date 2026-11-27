import Foundation

/// Another machine the app can use: a Jupyter or Ganymede server for
/// kernels and terminals, SSH for shells, or both.
struct Remote: Codable, Identifiable, Hashable {
    var id = UUID()
    var name = ""
    /// The server's base URL; empty when the remote has no server. Its
    /// token is kept in the keychain (`RemoteStore.token(for:)`).
    var serverURL = ""
    var ssh: SSH?
    /// Whether a machine's windows get the person's name for their
    /// notebook rooms (#842). Nil means on: a remote saved by an older
    /// build has no key, so synthesized Codable decodes it as on.
    var sharesName: Bool?
    /// Whether a machine's notebooks may use this device's `device` API
    /// (#877). Nil means off: a remote saved by an older build has no key,
    /// and a machine's notebook can be written by other people and agents
    /// there, so its calls leave this device only when the person said so.
    var usesDevice: Bool?

    /// Whether the name goes to this machine's rooms: on unless the
    /// setting says off.
    var shares: Bool { sharesName ?? true }

    /// Whether a machine's notebooks get this device (#877): on only when
    /// the setting says so.
    var letsNotebooksUseDevice: Bool { usesDevice ?? false }

    /// The saved form of the editor's toggle: on stays nil, as a remote
    /// saved by an older build is; off is `false` (#842).
    static func sharesNameSetting(_ on: Bool) -> Bool? { on ? nil : false }

    /// The saved form of the device toggle (#877): on is `true`, since a
    /// remote saved by an older build has no key and means off; off stays
    /// nil.
    static func usesDeviceSetting(_ on: Bool) -> Bool? { on ? true : nil }

    /// Whether a window of `place` gets the person's name (#842): this
    /// device always; a machine when the remote with its id and a server
    /// says so; an unknown or removed machine never.
    static func sharesName(for place: Place, in remotes: [Remote]) -> Bool {
        guard let id = place.machineID else { return true }
        return remotes.first { $0.id.uuidString == id && $0.hasServer }?.shares ?? false
    }

    /// Whether a notebook of `place` may use this device's `device` API
    /// (#877): a machine when the remote with its id and a server says so,
    /// and never one that is gone. This device's own notebooks always may,
    /// which its place decides; `true` here says the same.
    static func usesDevice(for place: Place, in remotes: [Remote]) -> Bool {
        guard let id = place.machineID else { return true }
        return remotes.first { $0.id.uuidString == id && $0.hasServer }?.letsNotebooksUseDevice ?? false
    }

    struct SSH: Codable, Hashable {
        /// A host name, or an alias from ~/.ssh/config on the Mac.
        var host: String
        /// Empty for the default (ssh-config, or the local user name).
        var user = ""
        /// Nil for the default (ssh-config, or 22).
        var port: Int?

        /// Arguments for OpenSSH's `ssh`, which reads the rest from
        /// ~/.ssh/config. `--` keeps a host from being read as an option.
        var arguments: [String] {
            var result: [String] = []
            if let port { result += ["-p", String(port)] }
            if !user.isEmpty { result += ["-l", user] }
            return result + ["--", host]
        }
    }

    /// The name, or else the server's or SSH host.
    var title: String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { return trimmed }
        if let host = URL(string: serverURL)?.host { return host }
        if let host = ssh?.host, !host.isEmpty { return host }
        return "Remote"
    }

    var hasServer: Bool { !serverURL.isEmpty }

    /// The line Settings shows while the remote kernels run on isn't
    /// answering (#832), named as the app names it; nil while the running
    /// server isn't the chosen remote's (#854), and whenever
    /// `specs.notAnswering` is.
    static func notAnswering(in specs: KernelSpecs, chosen: Remote?, served: ServedKernels) -> String? {
        guard let remote = served.describing(chosen) else { return nil }
        return specs.notAnswering(name: remote.title)
    }

    /// The name Settings › Installed gives the remote a server's kernels
    /// run on (#832): the app's title when the running server is the
    /// chosen remote's, else the server's own name for it (#854); nil when
    /// the answer names no remote.
    static func kernelsLabel(in specs: KernelSpecs, chosen: Remote?, served: ServedKernels) -> String? {
        specs.remote.map { served.describing(chosen)?.title ?? $0.name }
    }

    /// Whether the remote can be saved: a valid http(s) server URL, SSH
    /// with a host, or both.
    var isValid: Bool {
        if let ssh {
            if ssh.host.trimmingCharacters(in: .whitespaces).isEmpty { return false }
            if let port = ssh.port, !(1...65535).contains(port) { return false }
        }
        if serverURL.trimmingCharacters(in: .whitespaces).isEmpty { return ssh != nil }
        return ServerEndpoint(string: serverURL, token: "") != nil
    }
}

/// Where kernels can run, for the controls that switch it (#473): this
/// device, then each remote with a server.
struct KernelLocations: Equatable {
    struct Choice: Identifiable, Equatable {
        /// The remote's id; nil for this device.
        var id: UUID?
        var title: String
    }

    #if os(macOS)
    static let thisDevice = "This Mac"
    #else
    static let thisDevice = "This Device"
    #endif

    var choices: [Choice]
    /// The chosen remote; nil for this device, also when the chosen id
    /// isn't a remote with a server.
    var selected: UUID?

    init(remotes: [Remote], selected: UUID?) {
        choices = [Choice(id: nil, title: Self.thisDevice)]
            + remotes.filter(\.hasServer).map { Choice(id: $0.id, title: $0.title) }
        self.selected = choices.contains { $0.id == selected } ? selected : nil
    }

    /// The chosen location's name.
    var title: String {
        choices.first { $0.id == selected }?.title ?? Self.thisDevice
    }

    /// Whether there is anywhere but this device to choose.
    var hasRemotes: Bool { choices.count > 1 }
}

/// Where tokens are kept: the keychain in the app, memory in tests.
protocol SecretStore {
    func get(_ key: String) -> String?
    /// Stores `value`, or deletes it when empty.
    func set(_ key: String, _ value: String) throws
}

/// The list of remotes and which one runs kernels, kept in UserDefaults;
/// tokens go to the secret store, one item per remote.
struct RemoteStore {
    let defaults: UserDefaults
    let secrets: SecretStore

    func token(for id: UUID) -> String {
        if id == legacyRemote {
            return secrets.get(Keys.legacyServer) ?? ""
        }
        return secrets.get(Keys.token(id)) ?? ""
    }

    /// Stores the token of a remote. For the remote moved from the old
    /// kernel server, this replaces the old token, which is then removed.
    func setToken(_ token: String, for id: UUID) throws {
        try secrets.set(Keys.token(id), token)
        if id == legacyRemote {
            dropLegacy()
        }
    }

    /// The saved remotes and the id of the one kernels run on (nil for
    /// this device). `problem` says why saved remotes could not be read.
    struct Loaded {
        var remotes: [Remote] = []
        var kernels: UUID?
        var problem: String?
    }

    /// Reads the remotes. The single kernel server of earlier versions
    /// becomes the first remote, chosen for kernels; its token moves to
    /// the remote's keychain item now or, if the keychain refuses, on a
    /// later launch, and is read from the old item until then.
    func load() -> Loaded {
        var loaded = Loaded()
        if let data = defaults.data(forKey: Keys.remotes) {
            do {
                loaded.remotes = try JSONDecoder().decode([Remote].self, from: data)
            } catch {
                // Kept aside, so saving the list again doesn't lose it.
                defaults.set(data, forKey: Keys.unreadable)
                loaded.problem = "The saved remotes could not be read (\(error.localizedDescription)). "
                    + "They are kept under \"\(Keys.unreadable)\" in the app's defaults."
            }
            let kernels = defaults.string(forKey: Keys.kernels).flatMap(UUID.init(uuidString:))
            loaded.kernels = loaded.remotes.contains { $0.id == kernels && $0.hasServer } ? kernels : nil
            moveLegacyToken()
            return loaded
        }
        let old = defaults.string(forKey: Keys.legacyServer)?.trimmingCharacters(in: .whitespaces) ?? ""
        guard !old.isEmpty else { return loaded }
        let remote = Remote(serverURL: old)
        defaults.set(remote.id.uuidString, forKey: Keys.legacyRemote)
        try? save([remote], kernels: remote.id)
        moveLegacyToken()
        return Loaded(remotes: [remote], kernels: remote.id)
    }

    func save(_ remotes: [Remote], kernels: UUID?) throws {
        defaults.set(try JSONEncoder().encode(remotes), forKey: Keys.remotes)
        if let kernels {
            defaults.set(kernels.uuidString, forKey: Keys.kernels)
        } else {
            defaults.removeObject(forKey: Keys.kernels)
        }
    }

    /// The remote whose token is still in the old kernel server's item.
    private var legacyRemote: UUID? {
        defaults.string(forKey: Keys.legacyRemote).flatMap(UUID.init(uuidString:))
    }

    private func moveLegacyToken() {
        guard let id = legacyRemote else { return }
        let token = secrets.get(Keys.legacyServer) ?? ""
        guard (try? secrets.set(Keys.token(id), token)) != nil else { return }
        dropLegacy()
    }

    /// Ends the move: the remote's own item holds its token now. The old
    /// item is deleted if the keychain lets it be.
    private func dropLegacy() {
        defaults.removeObject(forKey: Keys.legacyServer)
        defaults.removeObject(forKey: Keys.legacyRemote)
        try? secrets.set(Keys.legacyServer, "")
    }

    enum Keys {
        static let remotes = "remotes"
        static let unreadable = "remotes.unreadable"
        static let kernels = "kernelRemote"
        /// The kernel server URL (UserDefaults) and token (keychain) before
        /// remotes.
        static let legacyServer = "kernelServer"
        /// The remote the kernel server became, until its token has moved.
        static let legacyRemote = "kernelServerRemote"
        static func token(_ id: UUID) -> String { "remote.\(id.uuidString)" }
    }
}

/// The remote the running server runs kernels on, as its start asked for
/// it (#854): `AppModel.servedKernels`. A start takes a ticket when it is
/// asked for and commits it once its server listens, so a start queued
/// behind a switch, from A to B, serves A and says so, even though B is
/// chosen by then.
struct ServedKernels: Equatable {
    /// What a start runs kernels on: the remote's id, its server URL then,
    /// and `edits` then, since editing the remote's URL or token restarts
    /// the server too.
    struct Ticket: Equatable {
        var id: UUID
        var serverURL: String
        var edits: Int
    }

    /// The running server's, or nil while none is up or kernels run on
    /// this device.
    private(set) var current: Ticket?
    /// Counts edits to the chosen remote that restart the server (its URL
    /// or token): a ticket taken before one is the old server's.
    private(set) var edits = 0

    /// The ticket a start takes when it is asked for.
    func ticket(for remote: Remote?) -> Ticket? {
        remote.map { Ticket(id: $0.id, serverURL: $0.serverURL, edits: edits) }
    }

    /// The chosen remote's URL or token was edited, and a restart asked for.
    mutating func edited() { edits += 1 }

    /// The start that took `ticket` has its server listening.
    mutating func listening(_ ticket: Ticket?) { current = ticket }

    /// No server is up, or a new start has begun.
    mutating func clear() { current = nil }

    /// `chosen` when the running server was started for it as it is now
    /// (same id, URL and edits), else nil: an answer from that server is
    /// about `chosen`.
    func describing(_ chosen: Remote?) -> Remote? {
        guard let chosen, current == ticket(for: chosen) else { return nil }
        return chosen
    }
}
