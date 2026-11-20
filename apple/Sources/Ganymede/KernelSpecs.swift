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
           let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            return text
        }
        return String(describing: value)
    }

    private static func fields(_ value: Any?) -> [Field] {
        guard let object = value as? [String: Any] else { return [] }
        return object.map { Field(key: $0.key, value: text(of: $0.value)) }.sorted { $0.key < $1.key }
    }

    /// Sorted by display name.
    var specs: [Spec]
    /// The kernel a new notebook starts, by name.
    var defaultName: String?

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
                language: spec?["language"] as? String,
                interruptMode: spec?["interrupt_mode"] as? String,
                protocolVersion: spec?["kernel_protocol_version"] as? String,
                resourceDir: entry["resource_dir"] as? String,
                argv: (spec?["argv"] as? [Any])?.compactMap { $0 as? String } ?? [],
                env: Self.fields(spec?["env"]),
                metadata: Self.fields(spec?["metadata"])
            )
        }
        .sorted { ($0.displayName.lowercased(), $0.name) < ($1.displayName.lowercased(), $1.name) }
        defaultName = object["default"] as? String
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
