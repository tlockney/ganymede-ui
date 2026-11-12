import Foundation
import os
import Security

/// One generic-password item per key in the app's keychain: where remote
/// servers' tokens are kept, rather than in UserDefaults.
enum Keychain {
    private static let service = "com.ganymede-server.Ganymede"
    private static let log = Logger(subsystem: service, category: "keychain")

    struct Failure: LocalizedError {
        let status: OSStatus
        var errorDescription: String? {
            let message = SecCopyErrorMessageString(status, nil) as String? ?? "unknown error"
            return "\(message) (\(status))"
        }
    }

    static func get(_ key: String) -> String? {
        (try? read(key)) ?? nil
    }

    /// The item for `key`: nil when there is none, and a throw when the
    /// keychain can't be read (locked, access denied), so a caller can
    /// tell a missing item from one it couldn't see.
    static func read(_ key: String) throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw failed("Reading", key, status) }
        guard let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Stores `value`, or deletes the item when it is empty. Throws when
    /// the keychain refuses, e.g. locked on iOS before the first unlock.
    static func set(_ key: String, _ value: String) throws {
        let match: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        let deleted = SecItemDelete(match as CFDictionary)
        guard deleted == errSecSuccess || deleted == errSecItemNotFound else {
            throw failed("Deleting", key, deleted)
        }
        guard !value.isEmpty else { return }
        var item = match
        item[kSecValueData as String] = Data(value.utf8)
        // SSH keys stay on this device, out of backups and device moves, so
        // each device has its own key to revoke in authorized_keys.
        item[kSecAttrAccessible as String] = key.hasPrefix("ssh.")
            ? kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            : kSecAttrAccessibleAfterFirstUnlock
        let added = SecItemAdd(item as CFDictionary, nil)
        guard added == errSecSuccess else {
            throw failed("Saving", key, added)
        }
    }

    private static func failed(_ action: String, _ key: String, _ status: OSStatus) -> Failure {
        let failure = Failure(status: status)
        log.error("\(action, privacy: .public) \(key, privacy: .public) failed: \(failure.localizedDescription, privacy: .public)")
        return failure
    }
}

/// The app's secret store.
struct KeychainStore: SecretStore {
    func get(_ key: String) -> String? { Keychain.get(key) }
    func set(_ key: String, _ value: String) throws { try Keychain.set(key, value) }
}
