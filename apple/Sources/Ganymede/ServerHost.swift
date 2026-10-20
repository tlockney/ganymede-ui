import Foundation
import GanymedeFFI

/// The Ganymede server, running in this process through ganymede-ffi
/// (crates/ganymede-ffi in tlockney/ganymede). It listens on 127.0.0.1
/// with a token; `url` carries the token, which the server turns into a
/// login cookie on the first load.
///
/// `@unchecked Sendable`: it is made on one thread and stopped on another,
/// but `AppModel` hands it from one to the next and never uses it from
/// two at once.
final class ServerHost: @unchecked Sendable {
    struct StartError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    let url: URL
    private var handle: OpaquePointer?

    /// Starts a server and returns once it listens. `config` has
    /// `ganymede.toml`'s keys (`root_dir`, `static_dir`, `port`, ...).
    init(config: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: config)
        let json = String(decoding: data, as: UTF8.self)
        var error: UnsafeMutablePointer<CChar>?
        guard let handle = ganymede_server_start(json, &error) else {
            let message = error.map { String(cString: $0) } ?? "the server did not start"
            ganymede_string_free(error)
            throw StartError(message: message)
        }
        self.handle = handle
        guard let url = URL(string: String(cString: ganymede_server_url(handle))) else {
            ganymede_server_stop(handle)
            self.handle = nil
            throw StartError(message: "the server returned an invalid URL")
        }
        self.url = url
    }

    /// Shuts down every kernel and stops the server. Blocks until done.
    func stop() {
        if let handle {
            ganymede_server_stop(handle)
            self.handle = nil
        }
    }

    deinit {
        stop()
    }
}
