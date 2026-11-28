#if os(macOS)
import Darwin
import Foundation
import Security

// MARK: - Code Requirement & Reservation Config (#941, ganymede#986)

/// Builds the `[kernel_providers]` config patch and macOS `csreq` code
/// requirement that reserves the in-app TypeScript kernel name
/// (`cdp-browser`) to this signed app (#941, tlockney/ganymede#986).
enum KernelProviderReservation {
    /// The running app's Developer ID identity: bundle identifier and Apple
    /// Developer team ID.
    struct AppIdentity: Equatable, Sendable {
        let bundleIdentifier: String
        let teamIdentifier: String
    }

    /// Reads the running app's signing identifier and team ID from
    /// `SecCodeCopySelf`. Returns `nil` on unsigned or ad-hoc-signed debug
    /// builds (which carry no team ID).
    static func currentIdentity() -> AppIdentity? {
        var code: SecCode?
        guard SecCodeCopySelf([], &code) == errSecSuccess, let code else { return nil }
        var staticCode: SecStaticCode?
        guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode else {
            return nil
        }
        var info: CFDictionary?
        guard SecCodeCopySigningInformation(
            staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let dict = info as? [String: Any],
              let team = dict[kSecCodeInfoTeamIdentifier as String] as? String, !team.isEmpty,
              let identifier = dict[kSecCodeInfoIdentifier as String] as? String, !identifier.isEmpty
        else { return nil }
        return AppIdentity(bundleIdentifier: identifier, teamIdentifier: team)
    }

    /// Formats a macOS `csreq` code requirement matching a Developer ID signed
    /// app with `bundleIdentifier` and `teamIdentifier`. Returns `nil` when
    /// either value is absent, empty, or contains characters that are not
    /// valid in an identifier or team ID (preventing requirement injection).
    static func codeRequirement(bundleIdentifier: String?, teamIdentifier: String?) -> String? {
        guard let bundleIdentifier, isValidIdentifier(bundleIdentifier),
              let teamIdentifier, isValidTeamIdentifier(teamIdentifier)
        else { return nil }
        return "identifier \"\(bundleIdentifier)\" and anchor apple generic"
            + " and certificate leaf[subject.OU] = \"\(teamIdentifier)\""
    }

    /// Builds a JSON-compatible `ganymede.toml` patch for `[kernel_providers]`.
    /// When `enabled` is true and `identity` is signed, reserves `kernelName`
    /// to that code requirement; on unsigned debug builds (`identity == nil`)
    /// omits `reserve` so the server does not refuse the unsigned app's own
    /// registration.
    static func configPatch(
        enabled: Bool,
        kernelName: String = AppKernels.inAppKernelName,
        identity: AppIdentity?
    ) -> [String: Any] {
        var table: [String: Any] = ["enabled": enabled]
        if enabled,
           let identity,
           let requirement = codeRequirement(
               bundleIdentifier: identity.bundleIdentifier,
               teamIdentifier: identity.teamIdentifier)
        {
            table["reserve"] = [kernelName: requirement]
        }
        return ["kernel_providers": table]
    }

    private static func isValidIdentifier(_ value: String) -> Bool {
        guard !value.isEmpty else { return false }
        return value.unicodeScalars.allSatisfy { scalar in
            (scalar >= "a" && scalar <= "z")
                || (scalar >= "A" && scalar <= "Z")
                || (scalar >= "0" && scalar <= "9")
                || scalar == "." || scalar == "-" || scalar == "_"
        }
    }

    private static func isValidTeamIdentifier(_ value: String) -> Bool {
        guard !value.isEmpty else { return false }
        return value.unicodeScalars.allSatisfy { scalar in
            (scalar >= "A" && scalar <= "Z")
                || (scalar >= "a" && scalar <= "z")
                || (scalar >= "0" && scalar <= "9")
        }
    }
}

// MARK: - Wire Framing (tlockney/ganymede docs/kernel-provider.md)

/// A frame sent by `ganymede serve` over the kernel provider Unix socket.
enum KernelProviderServerFrame: Equatable, Sendable {
    case welcome
    case welcomeError(String)
    case registered(name: String)
    case registerError(name: String, error: String)
    case start(kernelID: String, launchJSON: String)
    case send(kernelID: String, channel: String, messageJSON: String)
    case stop(kernelID: String)
}

/// Errors raised while framing or decoding kernel provider JSON lines.
enum KernelProviderFrameError: Error, Equatable, LocalizedError {
    case frameTooLarge(maxBytes: Int)
    case invalidUTF8
    case invalidJSON
    case missingField(String)
    case unknownOp(String)

    var errorDescription: String? {
        switch self {
        case .frameTooLarge(let maxBytes): "frame exceeds \(maxBytes) bytes"
        case .invalidUTF8: "frame is not valid UTF-8"
        case .invalidJSON: "frame is not a JSON object"
        case .missingField(let field): "frame is missing required field '\(field)'"
        case .unknownOp(let op): "unknown kernel provider op '\(op)'"
        }
    }
}

/// Pure JSON-lines framing codec for Ganymede's kernel provider socket
/// (`crates/ganymede-server/src/kernel_providers.rs`).
enum KernelProviderFraming {
    /// Matches `MAX_LINE` in `ganymede-server/src/kernel_providers.rs` (64 MiB).
    static let maxLineBytes = 64 * 1024 * 1024

    /// Keeps only the display fields a provider may send in `register` (`name`,
    /// `display_name`, `language`, `metadata`), dropping `argv`, `env`, and any
    /// other fields.
    static func displayOnlySpec(_ spec: [String: Any]) -> [String: Any] {
        var filtered: [String: Any] = [:]
        for key in ["name", "display_name", "language", "metadata"] {
            if let value = spec[key] {
                filtered[key] = value
            }
        }
        return filtered
    }

    static func encodeHello(token: String) -> Data {
        encodeLine(["op": "hello", "token": token])
    }

    static func encodeRegister(spec: [String: Any]) -> Data {
        encodeLine(["op": "register", "spec": displayOnlySpec(spec)])
    }

    static func encodeUnregister(name: String) -> Data {
        encodeLine(["op": "unregister", "name": name])
    }

    static func encodeStarted(kernelID: String, error: String? = nil) -> Data {
        var frame: [String: Any] = ["op": "started", "kernel_id": kernelID]
        if let error, !error.isEmpty {
            frame["error"] = error
        }
        return encodeLine(frame)
    }

    /// Encodes a `deliver` frame. `messageJSON` is the Jupyter wire message as
    /// a JSON string from `kernel.html`; it is parsed into a JSON object for
    /// the `"msg"` field. Returns `nil` if `messageJSON` is not a JSON object.
    static func encodeDeliver(kernelID: String, channel: String, messageJSON: String) -> Data? {
        guard let msgObj = try? JSONSerialization.jsonObject(with: Data(messageJSON.utf8)) as? [String: Any]
        else { return nil }
        return encodeLine([
            "op": "deliver",
            "kernel_id": kernelID,
            "channel": channel,
            "msg": msgObj,
        ])
    }

    /// Encodes an `ended` frame. The server accepts only `"exited"` or `"lost"`
    /// (any other string closes the connection), so any non-`"lost"` reason
    /// maps to `"exited"`.
    static func encodeEnded(kernelID: String, reason: String) -> Data {
        let normalized = reason == "lost" ? "lost" : "exited"
        return encodeLine([
            "op": "ended",
            "kernel_id": kernelID,
            "reason": normalized,
        ])
    }

    /// Decodes one newline-stripped JSON line from the server.
    static func decodeServerFrame(_ lineData: Data) throws -> KernelProviderServerFrame {
        guard String(data: lineData, encoding: .utf8) != nil else {
            throw KernelProviderFrameError.invalidUTF8
        }
        let raw: Any
        do {
            raw = try JSONSerialization.jsonObject(with: lineData)
        } catch {
            throw KernelProviderFrameError.invalidJSON
        }
        guard let obj = raw as? [String: Any] else {
            throw KernelProviderFrameError.invalidJSON
        }
        guard let op = obj["op"] as? String, !op.isEmpty else {
            throw KernelProviderFrameError.missingField("op")
        }
        switch op {
        case "welcome":
            if let error = obj["error"] as? String, !error.isEmpty {
                return .welcomeError(error)
            }
            return .welcome
        case "registered":
            guard let name = obj["name"] as? String, !name.isEmpty else {
                throw KernelProviderFrameError.missingField("name")
            }
            if let error = obj["error"] as? String, !error.isEmpty {
                return .registerError(name: name, error: error)
            }
            return .registered(name: name)
        case "start":
            guard let kernelID = obj["kernel_id"] as? String, !kernelID.isEmpty else {
                throw KernelProviderFrameError.missingField("kernel_id")
            }
            let launchJSON: String
            if let launch = obj["launch"] as? [String: Any],
               let data = try? JSONSerialization.data(withJSONObject: launch)
            {
                launchJSON = String(decoding: data, as: UTF8.self)
            } else {
                launchJSON = "{}"
            }
            return .start(kernelID: kernelID, launchJSON: launchJSON)
        case "send":
            guard let kernelID = obj["kernel_id"] as? String, !kernelID.isEmpty else {
                throw KernelProviderFrameError.missingField("kernel_id")
            }
            guard let channel = obj["channel"] as? String, !channel.isEmpty else {
                throw KernelProviderFrameError.missingField("channel")
            }
            guard let msg = obj["msg"] as? [String: Any],
                  let data = try? JSONSerialization.data(withJSONObject: msg)
            else {
                throw KernelProviderFrameError.missingField("msg")
            }
            return .send(
                kernelID: kernelID,
                channel: channel,
                messageJSON: String(decoding: data, as: UTF8.self))
        case "stop":
            guard let kernelID = obj["kernel_id"] as? String, !kernelID.isEmpty else {
                throw KernelProviderFrameError.missingField("kernel_id")
            }
            return .stop(kernelID: kernelID)
        default:
            throw KernelProviderFrameError.unknownOp(op)
        }
    }

    private static func encodeLine(_ object: [String: Any]) -> Data {
        var data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
        data.append(0x0A)
        return data
    }
}

/// Accumulates stream chunks into `\n`-delimited lines, rejecting any frame
/// that exceeds `maxLineBytes` even before its newline arrives.
struct KernelProviderLineBuffer {
    let maxLineBytes: Int
    private var buffer = Data()

    init(maxLineBytes: Int = KernelProviderFraming.maxLineBytes) {
        self.maxLineBytes = maxLineBytes
    }

    mutating func append(_ chunk: Data) throws -> [Data] {
        buffer.append(chunk)
        var lines: [Data] = []
        while let newline = buffer.firstIndex(of: 0x0A) {
            let length = buffer.distance(from: buffer.startIndex, to: newline)
            if length > maxLineBytes {
                buffer.removeAll(keepingCapacity: false)
                throw KernelProviderFrameError.frameTooLarge(maxBytes: maxLineBytes)
            }
            let line = Data(buffer[buffer.startIndex..<newline])
            buffer.removeSubrange(buffer.startIndex...newline)
            if !line.isEmpty {
                lines.append(line)
            }
        }
        if buffer.count > maxLineBytes {
            buffer.removeAll(keepingCapacity: false)
            throw KernelProviderFrameError.frameTooLarge(maxBytes: maxLineBytes)
        }
        return lines
    }
}

// MARK: - POSIX Unix Socket Helper

enum KernelProviderSocketError: Error, LocalizedError, Equatable {
    case pathTooLong(Int, max: Int)
    case syscallFailed(String, errno: Int32)

    var errorDescription: String? {
        switch self {
        case .pathTooLong(let count, let max):
            "Unix socket path is \(count) bytes, over macOS's \(max)-byte limit"
        case .syscallFailed(let call, let code):
            "\(call) failed: \(String(cString: strerror(code))) (errno \(code))"
        }
    }
}

enum KernelProviderSocket {
    /// `sockaddr_un.sun_path` is 104 bytes on macOS, less the terminating NUL.
    static let maxSocketPathBytes = 103

    /// Connects a blocking Unix stream socket to `path` with `SO_NOSIGPIPE`
    /// enabled so a closed server returns `EPIPE` rather than raising `SIGPIPE`.
    static func connect(path: String) throws -> Int32 {
        let utf8 = Array(path.utf8)
        guard !utf8.isEmpty, utf8.count <= maxSocketPathBytes else {
            throw KernelProviderSocketError.pathTooLong(utf8.count, max: maxSocketPathBytes)
        }
        let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else {
            throw KernelProviderSocketError.syscallFailed("socket", errno: errno)
        }
        var one: Int32 = 1
        _ = setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_un()
        addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        addr.sun_family = sa_family_t(AF_UNIX)
        withUnsafeMutableBytes(of: &addr.sun_path) { raw in
            for (index, byte) in utf8.enumerated() {
                raw[index] = byte
            }
            raw[utf8.count] = 0
        }
        let result = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                Darwin.connect(fd, sockPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard result == 0 else {
            let code = errno
            Darwin.close(fd)
            throw KernelProviderSocketError.syscallFailed("connect", errno: code)
        }
        return fd
    }
}

// MARK: - Kernel Provider Socket Client

/// One connection to a background `ganymede serve`'s kernel provider Unix
/// socket (`ganymede-kernels-<pid>.sock`), implementing `KernelSink` so
/// `AppKernels` can drive it with the exact same `handle` / `deliver` / `ended`
/// flow as the embedded server's `RegisteredKernels`.
final class KernelProviderClient: KernelSink, @unchecked Sendable {
    enum State: Equatable, Sendable {
        case connecting
        case awaitingWelcome
        case awaitingRegistration(name: String)
        case registered(name: String)
        case failed(String)
        case disconnected
    }

    typealias EventHandler = @Sendable (KernelEvent, KernelProviderClient) -> Void
    typealias StateHandler = @Sendable (State) -> Void

    private let ioQueue: DispatchQueue
    private let token: String
    private let spec: [String: Any]
    private let kernelName: String
    private let handshakeTimeout: Duration
    private let onEvent: EventHandler
    private let onStateChange: StateHandler?
    private let writeTimeoutMs: Int32

    private let stateLock = NSLock()
    private var _state: State = .connecting
    private var live: [String: Int] = [:]
    private var lastRun = 0
    private var closed = false

    // Owned exclusively by `ioQueue`.
    private var fd: Int32
    private var readSource: DispatchSourceRead?
    private var handshakeTimer: DispatchSourceTimer?
    private var lineBuffer: KernelProviderLineBuffer

    /// Connects to the Unix domain socket at `socketPath`.
    convenience init(
        socketPath: String,
        token: String,
        spec: [String: Any] = AppKernels.providerSpec,
        maxLineBytes: Int = KernelProviderFraming.maxLineBytes,
        handshakeTimeout: Duration = .seconds(10),
        writeTimeoutMs: Int32 = 5_000,
        onEvent: @escaping EventHandler,
        onStateChange: StateHandler? = nil
    ) throws {
        let fd = try KernelProviderSocket.connect(path: socketPath)
        self.init(
            fileDescriptor: fd,
            token: token,
            spec: spec,
            maxLineBytes: maxLineBytes,
            handshakeTimeout: handshakeTimeout,
            writeTimeoutMs: writeTimeoutMs,
            onEvent: onEvent,
            onStateChange: onStateChange)
    }

    /// Wraps an already-connected Unix stream file descriptor (such as one end
    /// of `socketpair(AF_UNIX, SOCK_STREAM, ...)` in unit tests). Takes
    /// ownership of `fileDescriptor` and closes it on disconnect or deinit.
    init(
        fileDescriptor: Int32,
        token: String,
        spec: [String: Any] = AppKernels.providerSpec,
        maxLineBytes: Int = KernelProviderFraming.maxLineBytes,
        handshakeTimeout: Duration = .seconds(10),
        writeTimeoutMs: Int32 = 5_000,
        onEvent: @escaping EventHandler,
        onStateChange: StateHandler? = nil
    ) {
        self.fd = fileDescriptor
        self.token = token
        let sanitized = KernelProviderFraming.displayOnlySpec(spec)
        self.spec = sanitized
        self.kernelName = (sanitized["name"] as? String ?? AppKernels.inAppKernelName).lowercased()
        self.handshakeTimeout = handshakeTimeout
        self.writeTimeoutMs = writeTimeoutMs
        self.onEvent = onEvent
        self.onStateChange = onStateChange
        self.lineBuffer = KernelProviderLineBuffer(maxLineBytes: maxLineBytes)
        self.ioQueue = DispatchQueue(label: "ganymede.kernel-provider.\(fileDescriptor)")

        var one: Int32 = 1
        _ = setsockopt(fileDescriptor, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
        let flags = fcntl(fileDescriptor, F_GETFL, 0)
        if flags >= 0 {
            _ = fcntl(fileDescriptor, F_SETFL, flags | O_NONBLOCK)
        }
    }

    deinit {
        handshakeTimer?.cancel()
        if let source = readSource {
            source.cancel()
        } else if fd >= 0 {
            Darwin.close(fd)
            fd = -1
        }
    }

    var state: State {
        stateLock.withLock { _state }
    }

    func isLive(_ id: String) -> Bool {
        stateLock.withLock { live[id] != nil }
    }

    /// Starts reading from the socket and sends the initial `hello` frame.
    func start() {
        ioQueue.async { [weak self] in
            self?.beginOnIOQueue()
        }
    }

    /// Cleanly disconnects from the server, optionally sending `unregister`
    /// first while still registered. Idempotent. Captures `self` strongly so
    /// fire-and-forget teardown (`connections.removeValue` + `disconnect()`)
    /// always finishes writing `unregister` and cancelling `readSource`.
    func disconnect(sendUnregister: Bool = true) {
        ioQueue.async {
            self.closeOnIOQueue(reason: nil, sendUnregister: sendUnregister)
        }
    }

    /// Synchronous teardown for app termination (`stopForQuit`).
    func disconnectSync(sendUnregister: Bool = true) {
        ioQueue.sync {
            closeOnIOQueue(reason: nil, sendUnregister: sendUnregister)
        }
    }

    // MARK: KernelSink

    @discardableResult
    func deliver(_ id: String, run: Int, channel: String, message: String) -> Bool {
        let shouldSend = stateLock.withLock { !closed && live[id] == run }
        guard shouldSend,
              let frame = KernelProviderFraming.encodeDeliver(
                  kernelID: id, channel: channel, messageJSON: message)
        else { return false }
        ioQueue.async { [weak self] in
            guard let self else { return }
            let stillLive = self.stateLock.withLock { !self.closed && self.live[id] == run }
            guard stillLive else { return }
            self.writeFrameOnIOQueue(frame)
        }
        return true
    }

    func ended(_ id: String, run: Int, reason: String) {
        let shouldSend = stateLock.withLock { () -> Bool in
            guard !closed, live[id] == run else { return false }
            live[id] = nil
            return true
        }
        guard shouldSend else { return }
        let frame = KernelProviderFraming.encodeEnded(kernelID: id, reason: reason)
        ioQueue.async { [weak self] in
            self?.writeFrameOnIOQueue(frame)
        }
    }

    // MARK: I/O Queue Internals

    private func beginOnIOQueue() {
        guard !isClosed(), fd >= 0, readSource == nil else { return }
        let descriptor = fd
        let source = DispatchSource.makeReadSource(fileDescriptor: descriptor, queue: ioQueue)
        source.setEventHandler { [weak self] in
            self?.readAvailableOnIOQueue()
        }
        source.setCancelHandler {
            Darwin.close(descriptor)
        }
        readSource = source
        source.resume()

        transition(to: .awaitingWelcome)
        armHandshakeTimerOnIOQueue()
        writeFrameOnIOQueue(KernelProviderFraming.encodeHello(token: token))
    }

    private func armHandshakeTimerOnIOQueue() {
        handshakeTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: ioQueue)
        let nanos = Int64(handshakeTimeout.components.seconds) * 1_000_000_000
            + Int64(handshakeTimeout.components.attoseconds / 1_000_000_000)
        let clamped = max(1_000_000, nanos)
        timer.schedule(deadline: .now() + .nanoseconds(Int(clamped)))
        timer.setEventHandler { [weak self] in
            self?.closeOnIOQueue(reason: "handshake timed out", sendUnregister: false)
        }
        handshakeTimer = timer
        timer.resume()
    }

    private func cancelHandshakeTimerOnIOQueue() {
        handshakeTimer?.cancel()
        handshakeTimer = nil
    }

    private func readAvailableOnIOQueue() {
        guard !isClosed(), fd >= 0 else { return }
        var chunk = [UInt8](repeating: 0, count: 16 * 1024)
        while true {
            let count = Darwin.read(fd, &chunk, chunk.count)
            if count > 0 {
                do {
                    let lines = try lineBuffer.append(Data(chunk[0..<count]))
                    for line in lines {
                        handleLineOnIOQueue(line)
                        if isClosed() { return }
                    }
                } catch {
                    closeOnIOQueue(reason: error.localizedDescription, sendUnregister: false)
                    return
                }
            } else if count == 0 {
                closeOnIOQueue(reason: nil, sendUnregister: false)
                return
            } else {
                let code = errno
                if code == EINTR { continue }
                if code == EAGAIN || code == EWOULDBLOCK { return }
                closeOnIOQueue(
                    reason: "read failed: \(String(cString: strerror(code)))",
                    sendUnregister: false)
                return
            }
        }
    }

    private func handleLineOnIOQueue(_ line: Data) {
        let frame: KernelProviderServerFrame
        do {
            frame = try KernelProviderFraming.decodeServerFrame(line)
        } catch {
            closeOnIOQueue(reason: error.localizedDescription, sendUnregister: false)
            return
        }

        let current = state
        switch (current, frame) {
        case (.awaitingWelcome, .welcome):
            transition(to: .awaitingRegistration(name: kernelName))
            writeFrameOnIOQueue(KernelProviderFraming.encodeRegister(spec: spec))

        case (.awaitingWelcome, .welcomeError(let message)):
            closeOnIOQueue(reason: "server refused hello: \(message)", sendUnregister: false)

        case (.awaitingRegistration, .registered(let name)):
            cancelHandshakeTimerOnIOQueue()
            transition(to: .registered(name: name))

        case (.awaitingRegistration, .registerError(_, let message)):
            closeOnIOQueue(reason: "server refused register: \(message)", sendUnregister: false)

        case (.registered, .start(let kernelID, let launchJSON)):
            let run = stateLock.withLock { () -> Int in
                lastRun += 1
                live[kernelID] = lastRun
                return lastRun
            }
            onEvent(.start(kernel: kernelID, run: run, launch: launchJSON), self)
            writeFrameOnIOQueue(KernelProviderFraming.encodeStarted(kernelID: kernelID))

        case (.registered, .send(let kernelID, let channel, let messageJSON)):
            guard isLive(kernelID) else { return }
            onEvent(.send(kernel: kernelID, channel: channel, message: messageJSON), self)

        case (.registered, .stop(let kernelID)):
            let wasLive = stateLock.withLock { live.removeValue(forKey: kernelID) != nil }
            guard wasLive else { return }
            onEvent(.stop(kernel: kernelID), self)

        default:
            closeOnIOQueue(
                reason: "unexpected frame \(frame) in state \(current)",
                sendUnregister: false)
        }
    }

    private func writeFrameOnIOQueue(_ data: Data) {
        guard !isClosed(), fd >= 0 else { return }
        let ok = writeAll(data, to: fd)
        if !ok {
            closeOnIOQueue(reason: "write failed", sendUnregister: false)
        }
    }

    /// Writes every byte of `data` to non-blocking `descriptor`, waiting up to
    /// `writeTimeoutMs` per `EAGAIN` via `poll(POLLOUT)`.
    private func writeAll(_ data: Data, to descriptor: Int32) -> Bool {
        data.withUnsafeBytes { rawBuffer in
            guard let base = rawBuffer.baseAddress else { return true }
            var offset = 0
            let total = rawBuffer.count
            while offset < total {
                let written = Darwin.write(descriptor, base.advanced(by: offset), total - offset)
                if written > 0 {
                    offset += written
                } else if written < 0 {
                    let code = errno
                    if code == EINTR { continue }
                    if code == EAGAIN || code == EWOULDBLOCK {
                        var pfd = pollfd(fd: descriptor, events: Int16(POLLOUT), revents: 0)
                        let ready = Darwin.poll(&pfd, 1, writeTimeoutMs)
                        if ready > 0 && (pfd.revents & Int16(POLLOUT)) != 0 {
                            continue
                        }
                        return false
                    }
                    return false
                } else {
                    return false
                }
            }
            return true
        }
    }

    private func closeOnIOQueue(reason: String?, sendUnregister: Bool) {
        let alreadyClosed = stateLock.withLock { () -> Bool in
            if closed { return true }
            closed = true
            return false
        }
        guard !alreadyClosed else { return }
        cancelHandshakeTimerOnIOQueue()

        let wasRegistered = stateLock.withLock { () -> Bool in
            if case .registered = _state { return true }
            return false
        }
        if sendUnregister && wasRegistered && fd >= 0 {
            _ = writeAll(KernelProviderFraming.encodeUnregister(name: kernelName), to: fd)
        }

        stateLock.withLock {
            live.removeAll()
        }

        if let source = readSource {
            readSource = nil
            fd = -1
            source.cancel()
        } else if fd >= 0 {
            Darwin.close(fd)
            fd = -1
        }

        let finalState: State = reason.map(State.failed) ?? .disconnected
        transition(to: finalState)
    }

    private func isClosed() -> Bool {
        stateLock.withLock { closed }
    }

    private func transition(to newState: State) {
        let changed = stateLock.withLock { () -> Bool in
            guard _state != newState else { return false }
            _state = newState
            return true
        }
        if changed {
            onStateChange?(newState)
        }
    }
}

// MARK: - Connection Manager (Auto-Connect, Teardown, Reconnect)

/// Manages `KernelProviderClient` connections to verified This Mac background
/// servers that advertise `kernel_providers_socket` (#941).
@MainActor
final class KernelProviderManager {
    struct ConnectionKey: Hashable, Sendable {
        let pid: Int32
        let socketPath: String
    }

    typealias ClientFactory = (
        _ server: ThisMacServer,
        _ socketPath: String,
        _ onEvent: @escaping KernelProviderClient.EventHandler,
        _ onStateChange: @escaping KernelProviderClient.StateHandler
    ) throws -> KernelProviderClient

    private struct Connection {
        let id: UUID
        let token: String
        let root: URL
        let client: KernelProviderClient
    }

    private let makeClient: ClientFactory
    private let onKernelEvent: @MainActor (KernelEvent, any KernelSink, URL?) -> Void
    private let onDetach: @MainActor (any KernelSink) -> Void
    private let retryDelays: [Duration]

    private var desired: [ConnectionKey: ThisMacServer] = [:]
    private var connections: [ConnectionKey: Connection] = [:]
    private var retries: [ConnectionKey: Task<Void, Never>] = [:]
    private var retryAttempts: [ConnectionKey: Int] = [:]

    /// Default initializer wired to `AppKernels.shared` over real Unix sockets.
    /// `AppKernels.shared` is looked up lazily so `AppModel.init()` does not
    /// eagerly create the WebView pool when no background server is present.
    init(
        kernels: AppKernels? = nil,
        retryDelays: [Duration] = [.seconds(1), .seconds(2), .seconds(4), .seconds(8)],
        makeClient: ClientFactory? = nil
    ) {
        self.retryDelays = retryDelays
        self.onKernelEvent = { event, sink, root in
            (kernels ?? AppKernels.shared).handle(event, from: sink, notebookRoot: root)
        }
        self.onDetach = { sink in
            (kernels ?? AppKernels.shared).detach(sink)
        }
        self.makeClient = makeClient ?? { server, socketPath, onEvent, onStateChange in
            try KernelProviderClient(
                socketPath: socketPath,
                token: server.token,
                spec: AppKernels.providerSpec,
                onEvent: onEvent,
                onStateChange: onStateChange)
        }
    }

    /// Test initializer with custom event/detach hooks and client factory.
    init(
        retryDelays: [Duration] = [.milliseconds(50), .milliseconds(100)],
        onKernelEvent: @escaping @MainActor (KernelEvent, any KernelSink, URL?) -> Void,
        onDetach: @escaping @MainActor (any KernelSink) -> Void,
        makeClient: @escaping ClientFactory
    ) {
        self.retryDelays = retryDelays
        self.onKernelEvent = onKernelEvent
        self.onDetach = onDetach
        self.makeClient = makeClient
    }

    /// Active connection keys, for tests and diagnostics.
    var activeKeys: Set<ConnectionKey> { Set(connections.keys) }

    /// Current state of the client for `key`, if connected.
    func state(for key: ConnectionKey) -> KernelProviderClient.State? {
        connections[key]?.client.state
    }

    /// Reconciles active provider connections against the latest list of
    /// verified This Mac servers: disconnects removed or changed servers, and
    /// connects any newly discovered server advertising `kernel_providers_socket`.
    func sync(servers: [ThisMacServer]) {
        var nextDesired: [ConnectionKey: ThisMacServer] = [:]
        for server in servers {
            guard let socket = server.kernelProvidersSocket, !socket.isEmpty, !server.token.isEmpty else {
                continue
            }
            nextDesired[ConnectionKey(pid: server.pid, socketPath: socket)] = server
        }
        desired = nextDesired

        // Tear down connections whose server disappeared or changed token.
        for (key, conn) in connections {
            if let server = desired[key], server.token == conn.token { continue }
            teardown(key: key, sendUnregister: true)
        }
        for key in Array(retries.keys) where desired[key] == nil {
            retries.removeValue(forKey: key)?.cancel()
            retryAttempts[key] = nil
        }

        // Connect any verified server not yet active or scheduled to retry.
        for (key, server) in desired {
            guard connections[key] == nil, retries[key] == nil else { continue }
            connect(key: key, server: server)
        }
    }

    /// Cleanly disconnects every active provider socket and cancels retries.
    func disconnectAll(synchronous: Bool = false) {
        desired.removeAll()
        for task in retries.values { task.cancel() }
        retries.removeAll()
        retryAttempts.removeAll()
        let active = connections
        connections.removeAll()
        for (_, conn) in active {
            onDetach(conn.client)
            if synchronous {
                conn.client.disconnectSync(sendUnregister: true)
            } else {
                conn.client.disconnect(sendUnregister: true)
            }
        }
    }

    private func connect(key: ConnectionKey, server: ThisMacServer) {
        let root = server.root
        let connectionID = UUID()
        let eventHandler: KernelProviderClient.EventHandler = { [weak self] event, client in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self, self.connections[key]?.id == connectionID else { return }
                    self.onKernelEvent(event, client, root)
                }
            }
        }
        let stateHandler: KernelProviderClient.StateHandler = { [weak self] newState in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    self?.handleStateChange(newState, for: key, connectionID: connectionID)
                }
            }
        }
        do {
            let client = try makeClient(server, key.socketPath, eventHandler, stateHandler)
            connections[key] = Connection(id: connectionID, token: server.token, root: root, client: client)
            client.start()
        } catch {
            NSLog("Ganymede: could not connect kernel provider socket %@: %@", key.socketPath, error.localizedDescription)
            scheduleRetry(for: key)
        }
    }

    private func handleStateChange(
        _ state: KernelProviderClient.State, for key: ConnectionKey, connectionID: UUID
    ) {
        guard let conn = connections[key], conn.id == connectionID else { return }
        switch state {
        case .registered:
            retryAttempts[key] = 0
        case .failed(let message):
            NSLog("Ganymede: kernel provider socket %@ closed: %@", key.socketPath, message)
            connections.removeValue(forKey: key)
            onDetach(conn.client)
            if desired[key] != nil {
                scheduleRetry(for: key)
            }
        case .disconnected:
            connections.removeValue(forKey: key)
            onDetach(conn.client)
            if desired[key] != nil {
                scheduleRetry(for: key)
            }
        case .connecting, .awaitingWelcome, .awaitingRegistration:
            break
        }
    }

    private func teardown(key: ConnectionKey, sendUnregister: Bool) {
        retries.removeValue(forKey: key)?.cancel()
        retryAttempts[key] = nil
        if let conn = connections.removeValue(forKey: key) {
            onDetach(conn.client)
            conn.client.disconnect(sendUnregister: sendUnregister)
        }
    }

    private func scheduleRetry(for key: ConnectionKey) {
        guard desired[key] != nil, retries[key] == nil, !retryDelays.isEmpty else { return }
        let attempt = retryAttempts[key] ?? 0
        let delay = retryDelays[min(attempt, retryDelays.count - 1)]
        retryAttempts[key] = attempt + 1
        retries[key] = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let self else { return }
            self.retries.removeValue(forKey: key)
            guard self.connections[key] == nil, let server = self.desired[key] else { return }
            self.connect(key: key, server: server)
        }
    }
}
#endif
