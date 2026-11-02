import CryptoKit
import Foundation

/// The app's SSH key: one ed25519 key, kept in the keychain, used for SSH
/// remotes on iOS (the Mac uses the system's ssh and its keys). Generated
/// in the app, or imported from an unencrypted OpenSSH private key.
struct SSHKeyStore {
    let secrets: SecretStore

    enum Failure: LocalizedError, Equatable {
        case notOpenSSH
        case encrypted
        case notEd25519
        case malformed

        var errorDescription: String? {
            switch self {
            case .notOpenSSH: "This is not an OpenSSH private key (-----BEGIN OPENSSH PRIVATE KEY-----)."
            case .encrypted: "This key has a passphrase. Remove it with ssh-keygen -p, or generate a key here."
            case .notEd25519: "Only ed25519 keys are supported."
            case .malformed: "The key could not be read."
            }
        }
    }

    func load() -> Curve25519.Signing.PrivateKey? {
        guard let stored = secrets.get(Self.key), let raw = Data(base64Encoded: stored) else {
            return nil
        }
        return try? Curve25519.Signing.PrivateKey(rawRepresentation: raw)
    }

    @discardableResult
    func generate() throws -> Curve25519.Signing.PrivateKey {
        let key = Curve25519.Signing.PrivateKey()
        try save(key)
        return key
    }

    @discardableResult
    func importOpenSSH(_ text: String) throws -> Curve25519.Signing.PrivateKey {
        let key = try Self.parseOpenSSH(text)
        try save(key)
        return key
    }

    func remove() throws {
        try secrets.set(Self.key, "")
    }

    private func save(_ key: Curve25519.Signing.PrivateKey) throws {
        try secrets.set(Self.key, key.rawRepresentation.base64EncodedString())
    }

    /// Keychain items starting with "ssh." stay on this device (`Keychain.set`).
    private static let key = "ssh.ed25519"

    /// The public key as a line for `authorized_keys`.
    static func publicLine(_ key: Curve25519.Signing.PublicKey, comment: String) -> String {
        var blob = Data()
        blob.appendSSHString(Data("ssh-ed25519".utf8))
        blob.appendSSHString(key.rawRepresentation)
        let line = "ssh-ed25519 " + blob.base64EncodedString()
        return comment.isEmpty ? line : line + " " + comment
    }

    /// Reads an unencrypted ed25519 key in OpenSSH's format (PROTOCOL.key).
    static func parseOpenSSH(_ text: String) throws -> Curve25519.Signing.PrivateKey {
        let begin = "-----BEGIN OPENSSH PRIVATE KEY-----"
        let end = "-----END OPENSSH PRIVATE KEY-----"
        guard let start = text.range(of: begin), let stop = text.range(of: end, range: start.upperBound..<text.endIndex) else {
            throw Failure.notOpenSSH
        }
        let body = text[start.upperBound..<stop.lowerBound].filter { !$0.isWhitespace }
        guard let data = Data(base64Encoded: String(body)) else { throw Failure.malformed }
        var reader = SSHReader(data)
        let magic = Data("openssh-key-v1\0".utf8)
        guard reader.take(magic.count) == magic else { throw Failure.notOpenSSH }
        let cipher = try reader.string()
        _ = try reader.string() // KDF name
        _ = try reader.string() // KDF options
        guard String(decoding: cipher, as: UTF8.self) == "none" else { throw Failure.encrypted }
        guard try reader.uint32() == 1 else { throw Failure.malformed }
        _ = try reader.string() // public key
        var section = SSHReader(try reader.string())
        guard try section.uint32() == section.uint32() else { throw Failure.malformed }
        guard String(decoding: try section.string(), as: UTF8.self) == "ssh-ed25519" else {
            throw Failure.notEd25519
        }
        let publicKey = try section.string()
        // The private part is the 32-byte seed followed by the public key.
        let secret = try section.string()
        guard publicKey.count == 32, secret.count == 64 else { throw Failure.malformed }
        let key = try Curve25519.Signing.PrivateKey(rawRepresentation: secret.prefix(32))
        guard key.publicKey.rawRepresentation == publicKey else { throw Failure.malformed }
        return key
    }
}

/// Host keys seen for each remote, trusted on first use. A key that
/// differs from the one stored is refused until the user forgets it.
struct HostKeyStore {
    let defaults: UserDefaults

    func key(for remote: UUID) -> String? {
        defaults.string(forKey: Self.key(remote))
    }

    func trust(_ key: String, for remote: UUID) {
        defaults.set(key, forKey: Self.key(remote))
    }

    func forget(_ remote: UUID) {
        defaults.removeObject(forKey: Self.key(remote))
    }

    enum Verdict: Equatable {
        case known
        case new
        case changed(stored: String)
    }

    /// Checks `key` against the stored one, storing it if there is none.
    func check(_ key: String, for remote: UUID) -> Verdict {
        guard let stored = self.key(for: remote) else {
            trust(key, for: remote)
            return .new
        }
        return stored == key ? .known : .changed(stored: stored)
    }

    /// SHA256 fingerprint as ssh-keygen -l shows it, of an
    /// `authorized_keys`-style line.
    static func fingerprint(_ line: String) -> String {
        let parts = line.split(separator: " ")
        guard parts.count >= 2, let blob = Data(base64Encoded: String(parts[1])) else { return line }
        let digest = Data(SHA256.hash(data: blob)).base64EncodedString()
        return "SHA256:" + digest.replacingOccurrences(of: "=", with: "")
    }

    private static func key(_ remote: UUID) -> String { "hostKey.\(remote.uuidString)" }
}

private struct SSHReader {
    private var data: Data

    init(_ data: Data) {
        self.data = Data(data)
    }

    mutating func take(_ count: Int) -> Data? {
        guard count >= 0, data.count >= count else { return nil }
        let result = data.prefix(count)
        data = data.dropFirst(count)
        return Data(result)
    }

    mutating func uint32() throws -> UInt32 {
        guard let bytes = take(4) else { throw SSHKeyStore.Failure.malformed }
        return bytes.reduce(0) { $0 << 8 | UInt32($1) }
    }

    mutating func string() throws -> Data {
        let length = try uint32()
        guard length <= 1 << 20, let bytes = take(Int(length)) else { throw SSHKeyStore.Failure.malformed }
        return bytes
    }
}

private extension Data {
    mutating func appendSSHString(_ bytes: Data) {
        let length = UInt32(bytes.count)
        append(contentsOf: [UInt8(length >> 24), UInt8(length >> 16 & 0xFF), UInt8(length >> 8 & 0xFF), UInt8(length & 0xFF)])
        append(bytes)
    }
}
