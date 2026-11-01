import CryptoKit
import XCTest

/// The app's SSH key (generate, import, public line) and trusting host keys
/// on first use.
final class SSHKeyTests: XCTestCase {
    private final class Secrets: SecretStore {
        var items: [String: String] = [:]
        func get(_ key: String) -> String? { items[key] }
        func set(_ key: String, _ value: String) throws { items[key] = value.isEmpty ? nil : value }
    }

    /// The ed25519 key whose seed is the bytes 0...31, as OpenSSH writes it.
    private let fixture = """
        -----BEGIN OPENSSH PRIVATE KEY-----
        b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
        c2gtZWQyNTUxOQAAACADoQe/884Qvh1w3RjnS8CZZ+TWMJulDV8d3IZkElUxuAAA
        AIiFFtCahRbQmgAAAAtzc2gtZWQyNTUxOQAAACADoQe/884Qvh1w3RjnS8CZZ+TW
        MJulDV8d3IZkElUxuAAAAEAAAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0e
        HwOhB7/zzhC+HXDdGOdLwJln5NYwm6UNXx3chmQSVTG4AAAAAAECAwQF
        -----END OPENSSH PRIVATE KEY-----
        """
    private let fixturePublic = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAOhB7/zzhC+HXDdGOdLwJln5NYwm6UNXx3chmQSVTG4"

    func testImportsAnOpenSSHKey() throws {
        let key = try SSHKeyStore.parseOpenSSH(fixture)
        XCTAssertEqual(key.rawRepresentation, Data(0..<32))
        XCTAssertEqual(SSHKeyStore.publicLine(key.publicKey, comment: ""), fixturePublic)
        XCTAssertEqual(SSHKeyStore.publicLine(key.publicKey, comment: "ganymede"), fixturePublic + " ganymede")
    }

    func testRefusesWhatItCannotUse() {
        XCTAssertThrowsError(try SSHKeyStore.parseOpenSSH("-----BEGIN RSA PRIVATE KEY-----")) {
            XCTAssertEqual($0 as? SSHKeyStore.Failure, .notOpenSSH)
        }
        let encrypted = armor(cipher: "aes256-ctr")
        XCTAssertThrowsError(try SSHKeyStore.parseOpenSSH(encrypted)) {
            XCTAssertEqual($0 as? SSHKeyStore.Failure, .encrypted)
        }
        let truncated = fixture.replacingOccurrences(of: "HwOhB7/zzhC+HXDdGOdLwJln5NYwm6UNXx3chmQSVTG4AAAAAAECAwQF", with: "")
        XCTAssertThrowsError(try SSHKeyStore.parseOpenSSH(truncated))
    }

    func testGenerateStoreAndRemove() throws {
        let secrets = Secrets()
        let store = SSHKeyStore(secrets: secrets)
        XCTAssertNil(store.load())
        let key = try store.generate()
        XCTAssertEqual(store.load()?.rawRepresentation, key.rawRepresentation)
        try store.importOpenSSH(fixture)
        XCTAssertEqual(store.load()?.rawRepresentation, Data(0..<32))
        try store.remove()
        XCTAssertNil(store.load())
    }

    func testHostKeysAreTrustedOnFirstUse() {
        let suite = "SSHKeyTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let hosts = HostKeyStore(defaults: defaults)
        let remote = UUID()
        XCTAssertEqual(hosts.check(fixturePublic, for: remote), .new)
        XCTAssertEqual(hosts.check(fixturePublic, for: remote), .known)
        let other = SSHKeyStore.publicLine(Curve25519.Signing.PrivateKey().publicKey, comment: "")
        XCTAssertEqual(hosts.check(other, for: remote), .changed(stored: fixturePublic))
        hosts.forget(remote)
        XCTAssertEqual(hosts.check(other, for: remote), .new)
    }

    func testFingerprintMatchesSSHKeygen() {
        XCTAssertEqual(
            HostKeyStore.fingerprint(fixturePublic),
            "SHA256:lbmsoA0yIEcEiVDRnMWuzm+nV+3ZEEpVIURqFoeSspg"
        )
    }

    /// A key file with `cipher`, enough to reach the cipher check.
    private func armor(cipher: String) -> String {
        var data = Data("openssh-key-v1\0".utf8)
        for field in [cipher, "bcrypt", ""] {
            let bytes = Data(field.utf8)
            data.append(contentsOf: withUnsafeBytes(of: UInt32(bytes.count).bigEndian, Array.init))
            data.append(bytes)
        }
        return "-----BEGIN OPENSSH PRIVATE KEY-----\n" + data.base64EncodedString()
            + "\n-----END OPENSSH PRIVATE KEY-----"
    }
}
