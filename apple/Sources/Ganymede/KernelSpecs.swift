import Foundation

/// The kernels a server offers, from its `/api/kernelspecs`, for the Mac's
/// Settings › Kernels (#206).
struct KernelSpecs: Equatable {
    struct Spec: Equatable, Identifiable {
        var name: String
        var displayName: String
        var language: String?
        var id: String { name }
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
                language: spec?["language"] as? String
            )
        }
        .sorted { ($0.displayName.lowercased(), $0.name) < ($1.displayName.lowercased(), $1.name) }
        defaultName = object["default"] as? String
    }

    /// Asks `server` for its kernels.
    static func load(from server: ServerEndpoint) async throws -> KernelSpecs {
        var request = URLRequest(url: server.base.appendingPathComponent("api/kernelspecs"))
        request.setValue("token \(server.token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        guard let specs = KernelSpecs(json: data) else { throw URLError(.cannotParseResponse) }
        return specs
    }
}
