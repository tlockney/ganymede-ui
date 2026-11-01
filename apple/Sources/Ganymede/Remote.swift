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
        let url = serverURL.trimmingCharacters(in: .whitespaces)
        if let ssh {
            if ssh.host.trimmingCharacters(in: .whitespaces).isEmpty { return false }
            if let port = ssh.port, !(1...65535).contains(port) { return false }
        }
        if url.isEmpty { return ssh != nil }
        guard let parsed = URL(string: url), let scheme = parsed.scheme?.lowercased() else {
            return false
        }
        return (scheme == "http" || scheme == "https") && parsed.host != nil
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
        secrets.get(Keys.token(id)) ?? ""
    }

    func setToken(_ token: String, for id: UUID) throws {
        try secrets.set(Keys.token(id), token)
    }

    /// The saved remotes, and the id of the one kernels run on (nil for
    /// this device). The single kernel server of earlier versions becomes
    /// the first remote, chosen for kernels.
    func load() -> (remotes: [Remote], kernels: UUID?) {
        if let data = defaults.data(forKey: Keys.remotes),
           let remotes = try? JSONDecoder().decode([Remote].self, from: data) {
            let kernels = defaults.string(forKey: Keys.kernels).flatMap(UUID.init(uuidString:))
            return (remotes, remotes.contains { $0.id == kernels && $0.hasServer } ? kernels : nil)
        }
        let old = defaults.string(forKey: Keys.legacyServer)?.trimmingCharacters(in: .whitespaces) ?? ""
        guard !old.isEmpty else { return ([], nil) }
        let remote = Remote(serverURL: old)
        let token = secrets.get(Keys.legacyServer) ?? ""
        // Keep the old items if the new ones can't be written, so the
        // next launch tries again.
        do {
            try setToken(token, for: remote.id)
            try save([remote], kernels: remote.id)
        } catch {
            return ([remote], remote.id)
        }
        defaults.removeObject(forKey: Keys.legacyServer)
        try? secrets.set(Keys.legacyServer, "")
        return ([remote], remote.id)
    }

    func save(_ remotes: [Remote], kernels: UUID?) throws {
        defaults.set(try JSONEncoder().encode(remotes), forKey: Keys.remotes)
        if let kernels {
            defaults.set(kernels.uuidString, forKey: Keys.kernels)
        } else {
            defaults.removeObject(forKey: Keys.kernels)
        }
    }

    enum Keys {
        static let remotes = "remotes"
        static let kernels = "kernelRemote"
        /// The kernel server URL (UserDefaults) and token (keychain) before
        /// remotes.
        static let legacyServer = "kernelServer"
        static func token(_ id: UUID) -> String { "remote.\(id.uuidString)" }
    }
}
