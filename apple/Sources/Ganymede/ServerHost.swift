import Foundation
import GanymedeFFI

/// The Ganymede server, running in this process through ganymede-ffi
/// (crates/ganymede-ffi in tlockney/ganymede). It listens on 127.0.0.1
/// with a token; `url` carries the token, which the server turns into a
/// login cookie on the first load.
///
/// `@unchecked Sendable`: it is made on one thread and stopped on another,
/// but `AppModel` hands it from one to the next and never uses it from
/// two at once. What other threads call (`deliver`, `ended`) goes through
/// `kernels`, which has its own lock.
final class ServerHost: @unchecked Sendable {
    struct StartError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    let url: URL
    private var handle: OpaquePointer?
    /// Kernels the app runs and registered here (ganymede#266).
    let kernels = RegisteredKernels()

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
        kernels.open(handle)
    }

    /// Lists `spec` (`kernel.json`'s keys plus `name`) as a kernelspec whose
    /// kernels the app runs: the server calls `events` on its own threads
    /// to start, message and stop them, and the app answers through
    /// `kernels.deliver` and `kernels.ended`. Register before the page
    /// loads, so its first kernel list has it.
    func register(spec: [String: Any], events: @escaping RegisteredKernels.Events) throws {
        guard let handle else { throw StartError(message: "the server has stopped") }
        try kernels.register(spec: spec, on: handle, events: events)
    }

    /// Shuts down every kernel and stops the server. Blocks until done.
    /// Registered kernels answer the shutdown through the main thread, so
    /// off the main thread a stop is quick; on it, each waits out the
    /// server's shutdown grace.
    func stop() {
        if let handle {
            ganymede_server_stop(handle)
            self.handle = nil
            kernels.close()
        }
    }

    deinit {
        stop()
    }
}

/// What a registered kernel is asked to do, on one of the server's threads.
enum KernelEvent: Sendable {
    /// Start kernel `kernel`; `launch` is `{"kernelspec", "cwd", "env"}`,
    /// with the notebook's path in `env.JPY_SESSION_NAME`.
    case start(kernel: String, launch: String)
    /// A Jupyter message (JSON, buffers as base64) on `channel`.
    case send(kernel: String, channel: String, message: String)
    /// End the kernel now: nothing more may be delivered from this run.
    case stop(kernel: String)
}

/// The kernels the app registered with one server, and the way back to it.
///
/// The server's handle is freed at the end of `ganymede_server_stop`, while
/// the main thread may still be delivering a late message. So every call
/// into the server takes `lock`, and goes through only for a kernel the
/// server started and hasn't stopped: the server stops each one before it
/// frees itself, and the stop takes the lock, so no call is under way then.
final class RegisteredKernels: @unchecked Sendable {
    typealias Events = @Sendable (KernelEvent, RegisteredKernels) -> Void

    private let lock = NSLock()
    private var handle: OpaquePointer?
    /// Started and not stopped or ended, by kernel id.
    private var live: Set<String> = []

    fileprivate func open(_ handle: OpaquePointer) {
        lock.withLock { self.handle = handle }
    }

    fileprivate func close() {
        lock.withLock {
            handle = nil
            live = []
        }
    }

    /// Whether kernel `id` is running, as far as the server knows.
    func isLive(_ id: String) -> Bool {
        lock.withLock { live.contains(id) }
    }

    /// A message from kernel `id`. False when it isn't running (it was
    /// stopped, or the server is gone) or the server couldn't read it.
    @discardableResult
    func deliver(_ id: String, channel: String, message: String) -> Bool {
        lock.withLock {
            guard let handle, live.contains(id) else { return false }
            return ganymede_kernel_deliver(handle, id, channel, message) == 0
        }
    }

    /// Kernel `id` ended without being asked to: `lost` when the system
    /// ended it (the server restarts it without counting a crash), anything
    /// else a crash. Once per run.
    func ended(_ id: String, reason: String) {
        lock.withLock {
            guard let handle, live.remove(id) != nil else { return }
            ganymede_kernel_ended(handle, id, reason)
        }
    }

    fileprivate func started(_ id: String) {
        lock.withLock { _ = live.insert(id) }
    }

    fileprivate func stopped(_ id: String) {
        lock.withLock { _ = live.remove(id) }
    }

    fileprivate func register(spec: [String: Any], on handle: OpaquePointer, events: @escaping Events) throws {
        let data = try JSONSerialization.data(withJSONObject: spec)
        let json = String(decoding: data, as: UTF8.self)
        let context = Unmanaged.passRetained(Callbacks(kernels: self, events: events))
        var callbacks = GanymedeKernelCallbacks(
            ctx: context.toOpaque(),
            start: { ctx, id, launch in
                guard let ctx, let id, let launch else { return 1 }
                let callbacks = Unmanaged<Callbacks>.fromOpaque(ctx).takeUnretainedValue()
                let kernel = String(cString: id)
                callbacks.kernels.started(kernel)
                callbacks.events(.start(kernel: kernel, launch: String(cString: launch)), callbacks.kernels)
                return 0
            },
            send: { ctx, id, channel, message in
                guard let ctx, let id, let channel, let message else { return }
                let callbacks = Unmanaged<Callbacks>.fromOpaque(ctx).takeUnretainedValue()
                callbacks.events(
                    .send(kernel: String(cString: id), channel: String(cString: channel),
                          message: String(cString: message)),
                    callbacks.kernels)
            },
            stop: { ctx, id in
                guard let ctx, let id else { return }
                let callbacks = Unmanaged<Callbacks>.fromOpaque(ctx).takeUnretainedValue()
                let kernel = String(cString: id)
                // Before it returns: the server frees itself only after
                // every stop, so nothing reaches it for this kernel after.
                callbacks.kernels.stopped(kernel)
                callbacks.events(.stop(kernel: kernel), callbacks.kernels)
            },
            release: { ctx in
                guard let ctx else { return }
                Unmanaged<Callbacks>.fromOpaque(ctx).release()
            })
        var error: UnsafeMutablePointer<CChar>?
        let failed = lock.withLock { ganymede_kernel_register(handle, json, &callbacks, &error) != 0 }
        if failed {
            // The server keeps nothing and never calls `release`.
            context.release()
            let message = error.map { String(cString: $0) } ?? "the server refused the kernel"
            ganymede_string_free(error)
            throw ServerHost.StartError(message: message)
        }
    }

    /// What the C callbacks reach through `ctx`, retained until `release`.
    private final class Callbacks: @unchecked Sendable {
        let kernels: RegisteredKernels
        let events: Events
        init(kernels: RegisteredKernels, events: @escaping Events) {
            self.kernels = kernels
            self.events = events
        }
    }
}
