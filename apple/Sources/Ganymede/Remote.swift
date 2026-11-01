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

    struct SSH: Codable, Hashable {
        /// A host name, or an alias from ~/.ssh/config on the Mac.
        var host: String
        /// Empty for the default (ssh-config, or the local user name).
        var user = ""
        /// Nil for the default (ssh-config, or 22).
        var port: Int?
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
