import Foundation

/// The kernels a server offers, from its `/api/kernelspecs`, for the Mac's
/// Settings › Kernels (#206), with each kernel's details (#694).
struct KernelSpecs: Equatable {
    struct Spec: Equatable, Identifiable {
        var name: String
        var displayName: String
        var language: String?
        /// `spec.interrupt_mode`, e.g. "signal" or "message".
        var interruptMode: String?
        /// `spec.kernel_protocol_version`.
        var protocolVersion: String?
        /// The kernelspec folder: the entry's top-level `resource_dir`,
        /// absent when the server doesn't know it (or is older).
        var resourceDir: String?
        /// `spec.argv`: the command that starts the kernel.
        var argv: [String] = []
        /// `spec.env`, sorted by key; values shown as text.
        var env: [Field] = []
        /// `spec.metadata`, sorted by key.
        var metadata: [Field] = []
        /// Whether this kernel runs on the server's remote (#832), as its
        /// `"gateway": true` says; absent from a server older than that.
        var gateway = false
        var id: String { name }

        /// Whether there is anything to show beyond the name, language
        /// and display name the row already has.
        var hasDetails: Bool {
            interruptMode != nil || protocolVersion != nil || resourceDir != nil
                || !argv.isEmpty || !env.isEmpty || !metadata.isEmpty
        }
    }

    /// A key and its value as text.
    struct Field: Equatable, Identifiable {
        var key: String
        var value: String
        var id: String { key }
    }

    /// The remote the server runs kernels on, from the answer's top-level
    /// `gateway` (ganymede#969, #832): its name, whether it answers, and why
    /// it doesn't. Absent from a server older than that, and one whose
    /// kernels run here.
    struct Remote: Equatable {
        var name: String
        var reachable: Bool
        /// An empty error is no more than a missing one.
        var error: String?
    }

    /// A JSON value as text: strings, numbers and booleans plainly, null as
    /// "null", arrays and objects as compact JSON with sorted keys.
    static func text(of value: Any) -> String {
        if let string = value as? String { return string }
        if value is NSNull { return "null" }
        if let number = value as? NSNumber {
            // JSONSerialization makes booleans NSNumber too.
            if CFGetTypeID(number) == CFBooleanGetTypeID() { return number.boolValue ? "true" : "false" }
            return number.stringValue
        }
        if JSONSerialization.isValidJSONObject(value),
           let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes]),
           let text = String(data: data, encoding: .utf8) {
            return text
        }
        return String(describing: value)
    }

    /// A string field, nil when absent or "": the server always sends
    /// `kernel_protocol_version` (empty when kernel.json lacks it).
    static func string(_ value: Any?) -> String? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return string
    }

    /// `argv` as one shell command line: an element with a space or other
    /// shell metacharacter is single-quoted, with `'` written `'\''`.
    static func shellCommand(_ argv: [String]) -> String {
        argv.map { arg in
            let safe = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@%+=:,./-_{}")
            if !arg.isEmpty, arg.unicodeScalars.allSatisfy({ safe.contains($0) }) { return arg }
            return "'" + arg.replacingOccurrences(of: "'", with: "'\\''") + "'"
        }
        .joined(separator: " ")
    }

    private static func fields(_ value: Any?) -> [Field] {
        guard let object = value as? [String: Any] else { return [] }
        return object.map { Field(key: $0.key, value: text(of: $0.value)) }.sorted { $0.key < $1.key }
    }

    /// Sorted by display name.
    var specs: [Spec]
    /// The kernel a new notebook starts, by name.
    var defaultName: String?
    /// The remote kernels run on (#832), or nil when they run here or the
    /// server predates ganymede#969.
    var remote: Remote?

    /// From the body of `GET /api/kernelspecs`; nil when it isn't one.
    init?(json data: Data) {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let all = object["kernelspecs"] as? [String: Any]
        else { return nil }
        specs = all.compactMap { key, value in
            guard let entry = value as? [String: Any] else { return nil }
            let spec = entry["spec"] as? [String: Any]
            let name = entry["name"] as? String ?? key
            return Spec(
                name: name,
                displayName: spec?["display_name"] as? String ?? name,
                language: Self.string(spec?["language"]),
                interruptMode: Self.string(spec?["interrupt_mode"]),
                protocolVersion: Self.string(spec?["kernel_protocol_version"]),
                resourceDir: Self.string(entry["resource_dir"]),
                argv: (spec?["argv"] as? [Any])?.compactMap { $0 as? String } ?? [],
                env: Self.fields(spec?["env"]),
                metadata: Self.fields(spec?["metadata"]),
                gateway: entry["gateway"] as? Bool == true
            )
        }
        .sorted { ($0.displayName.lowercased(), $0.name) < ($1.displayName.lowercased(), $1.name) }
        defaultName = object["default"] as? String
        remote = Self.parseRemote(object["gateway"])
    }

    /// The top-level `gateway` of an answer, or nil when it has none or it
    /// isn't one.
    private static func parseRemote(_ value: Any?) -> Remote? {
        guard let object = value as? [String: Any],
              let name = string(object["name"]),
              let reachable = object["reachable"] as? Bool
        else { return nil }
        return Remote(name: name, reachable: reachable, error: string(object["error"]))
    }

    /// The line that says the remote kernels run on isn't answering (#832),
    /// naming it by `name` when the app has its own for it; nil while it
    /// answers, before the server's first check, or without a remote.
    func notAnswering(name: String? = nil) -> String? {
        guard let remote, !remote.reachable, let error = remote.error, !error.isEmpty
        else { return nil }
        return "\(name ?? remote.name) isn’t answering: \(error)"
    }

    /// Asks `server` for its kernels.
    static func load(from server: ServerEndpoint) async throws -> KernelSpecs {
        let request = server.request("api/kernelspecs")
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        guard let specs = KernelSpecs(json: data) else { throw URLError(.cannotParseResponse) }
        return specs
    }
}
