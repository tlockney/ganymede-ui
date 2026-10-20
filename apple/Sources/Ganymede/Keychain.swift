import Foundation
import os
import Security

/// One generic-password item per key in the app's keychain: where the
/// kernel server's token is kept, rather than in UserDefaults.
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
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status != errSecSuccess && status != errSecItemNotFound {
            log.error("Reading \(key, privacy: .public) failed: \(Failure(status: status).localizedDescription, privacy: .public)")
        }
        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }
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
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
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
