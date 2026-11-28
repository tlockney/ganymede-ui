#if os(macOS)
import Darwin
import Foundation
import Security
import XCTest

/// Unit and socket tests for Ganymede's macOS kernel provider client (#941):
/// framing, state machine, socketpair round-trips, real Unix socket connect &
/// reconnect, `ThisMacVerifier` / `ThisMacChecks` discovery, and macOS code
/// requirement reservation.
final class KernelProviderClientTests: XCTestCase {
    // MARK: - Helpers

    private func makeSocketPair() throws -> (client: Int32, server: Int32) {
        var fds: [Int32] = [-1, -1]
        guard Darwin.socketpair(AF_UNIX, SOCK_STREAM, 0, &fds) == 0 else {
            throw KernelProviderSocketError.syscallFailed("socketpair", errno: errno)
        }
        var one: Int32 = 1
        _ = setsockopt(fds[0], SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
        _ = setsockopt(fds[1], SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
        return (fds[0], fds[1])
    }

    /// Reads one `\n`-terminated JSON object from `fd` with a poll timeout.
    private func readJSONLine(from fd: Int32, timeoutMs: Int32 = 3_000) throws -> [String: Any] {
        var data = Data()
        var byte: UInt8 = 0
        let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000.0)
        while true {
            let remainingMs = max(1, Int32(deadline.timeIntervalSinceNow * 1000))
            var pfd = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
            let ready = Darwin.poll(&pfd, 1, remainingMs)
            guard ready > 0 else {
                XCTFail("timed out reading JSON line from socket")
                return [:]
            }
            let n = Darwin.read(fd, &byte, 1)
            if n == 1 {
                if byte == 0x0A { break }
                data.append(byte)
            } else if n == 0 {
                XCTFail("unexpected EOF reading JSON line (partial: \(String(decoding: data, as: UTF8.self)))")
                return [:]
            } else if errno == EINTR {
                continue
            } else {
                throw KernelProviderSocketError.syscallFailed("read", errno: errno)
            }
        }
        let obj = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(obj as? [String: Any])
    }

    private func writeJSONLine(_ object: [String: Any], to fd: Int32) throws {
        var data = try JSONSerialization.data(withJSONObject: object)
        data.append(0x0A)
        try writeRaw(data, to: fd)
    }

    private func writeRaw(_ data: Data, to fd: Int32) throws {
        try data.withUnsafeBytes { raw in
            guard let base = raw.baseAddress else { return }
            var offset = 0
            while offset < raw.count {
                let n = Darwin.write(fd, base.advanced(by: offset), raw.count - offset)
                if n > 0 {
                    offset += n
                } else if n < 0 && errno == EINTR {
                    continue
                } else {
                    throw KernelProviderSocketError.syscallFailed("write", errno: errno)
                }
            }
        }
    }

    /// A tiny in-process Unix domain socket listener for testing real path
    /// connects, disconnects, and restarts without needing a signed binary.
    private final class TempUnixListener: @unchecked Sendable {
        let path: String
        let fd: Int32

        init() throws {
            let tmpPath = "/tmp/ganymede-kp-\(UUID().uuidString.prefix(8)).sock"
            let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
            guard fd >= 0 else {
                throw KernelProviderSocketError.syscallFailed("socket", errno: errno)
            }
            var addr = sockaddr_un()
            addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
            addr.sun_family = sa_family_t(AF_UNIX)
            let utf8 = Array(tmpPath.utf8)
            withUnsafeMutableBytes(of: &addr.sun_path) { raw in
                for (i, b) in utf8.enumerated() { raw[i] = b }
                raw[utf8.count] = 0
            }
            unlink(tmpPath)
            let bound = withUnsafePointer(to: &addr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                    Darwin.bind(fd, sockPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
                }
            }
            guard bound == 0 else {
                let code = errno
                Darwin.close(fd)
                throw KernelProviderSocketError.syscallFailed("bind", errno: code)
            }
            guard Darwin.listen(fd, 8) == 0 else {
                let code = errno
                Darwin.close(fd)
                unlink(tmpPath)
                throw KernelProviderSocketError.syscallFailed("listen", errno: code)
            }
            self.path = tmpPath
            self.fd = fd
        }

        func accept(timeoutMs: Int32 = 3_000) -> Int32? {
            var pfd = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
            guard Darwin.poll(&pfd, 1, timeoutMs) > 0 else { return nil }
            let peer = Darwin.accept(fd, nil, nil)
            guard peer >= 0 else { return nil }
            var one: Int32 = 1
            _ = setsockopt(peer, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
            return peer
        }

        /// Accepts off the calling actor so `@MainActor` reconnect tasks can run.
        func acceptAsync(timeoutMs: Int32 = 3_000) async -> Int32? {
            await Task.detached { [self] in self.accept(timeoutMs: timeoutMs) }.value
        }

        func close() {
            Darwin.close(fd)
            unlink(path)
        }
    }

    @MainActor
    private func eventually(_ what: String, timeout: TimeInterval = 3.0, _ check: () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if check() { return }
            try? await Task.sleep(for: .milliseconds(15))
        }
        XCTFail("timed out waiting for \(what)")
    }

    // MARK: - Framing & Codec Tests

    func testDisplayOnlySpecDropsArgvAndEnv() throws {
        let raw: [String: Any] = [
            "name": "cdp-browser",
            "display_name": "TypeScript (cdp-kernel, in app)",
            "language": "typescript",
            "argv": ["/usr/bin/env", "node"],
            "env": ["SECRET": "nope"],
            "metadata": ["capabilities": ["device": true]],
            "extra": "ignored",
        ]
        let filtered = KernelProviderFraming.displayOnlySpec(raw)
        XCTAssertEqual(filtered["name"] as? String, "cdp-browser")
        XCTAssertEqual(filtered["display_name"] as? String, "TypeScript (cdp-kernel, in app)")
        XCTAssertEqual(filtered["language"] as? String, "typescript")
        XCTAssertNotNil(filtered["metadata"] as? [String: Any])
        XCTAssertNil(filtered["argv"])
        XCTAssertNil(filtered["env"])
        XCTAssertNil(filtered["extra"])

        let encoded = KernelProviderFraming.encodeRegister(spec: raw)
        XCTAssertEqual(encoded.last, 0x0A)
        let decoded = try XCTUnwrap(
            JSONSerialization.jsonObject(with: encoded.dropLast()) as? [String: Any])
        XCTAssertEqual(decoded["op"] as? String, "register")
        let spec = try XCTUnwrap(decoded["spec"] as? [String: Any])
        XCTAssertNil(spec["argv"])
        XCTAssertNil(spec["env"])
    }

    func testEncodeAndDecodeAllFrames() throws {
        // Welcome & error
        XCTAssertEqual(
            try KernelProviderFraming.decodeServerFrame(Data(#"{"op":"welcome"}"#.utf8)),
            .welcome)
        XCTAssertEqual(
            try KernelProviderFraming.decodeServerFrame(
                Data(#"{"op":"welcome","error":"bad token"}"#.utf8)),
            .welcomeError("bad token"))

        // Registered & error
        XCTAssertEqual(
            try KernelProviderFraming.decodeServerFrame(
                Data(#"{"op":"registered","name":"cdp-browser"}"#.utf8)),
            .registered(name: "cdp-browser"))
        XCTAssertEqual(
            try KernelProviderFraming.decodeServerFrame(
                Data(#"{"op":"registered","name":"cdp-browser","error":"reserved"}"#.utf8)),
            .registerError(name: "cdp-browser", error: "reserved"))

        // Start, send, stop
        let startFrame = try KernelProviderFraming.decodeServerFrame(
            Data(#"{"op":"start","kernel_id":"k1","launch":{"env":{"JPY_SESSION_NAME":"a.ipynb"}}}"#.utf8))
        guard case .start(let startID, let launchJSON) = startFrame else {
            return XCTFail("expected start")
        }
        XCTAssertEqual(startID, "k1")
        XCTAssertEqual(AppKernels.notebook(in: launchJSON), "a.ipynb")

        let sendFrame = try KernelProviderFraming.decodeServerFrame(
            Data(#"{"op":"send","kernel_id":"k1","channel":"shell","msg":{"header":{"msg_type":"kernel_info_request"}}}"#.utf8))
        guard case .send(let sendID, let channel, let msgJSON) = sendFrame else {
            return XCTFail("expected send")
        }
        XCTAssertEqual(sendID, "k1")
        XCTAssertEqual(channel, "shell")
        XCTAssertTrue(msgJSON.contains("kernel_info_request"))

        XCTAssertEqual(
            try KernelProviderFraming.decodeServerFrame(Data(#"{"op":"stop","kernel_id":"k1"}"#.utf8)),
            .stop(kernelID: "k1"))

        // Ended normalizes unknown reasons (like "failed") to "exited" while keeping "lost".
        for (input, expected) in [("lost", "lost"), ("exited", "exited"), ("failed", "exited")] {
            let line = KernelProviderFraming.encodeEnded(kernelID: "k1", reason: input)
            let obj = try XCTUnwrap(
                JSONSerialization.jsonObject(with: line.dropLast()) as? [String: Any])
            XCTAssertEqual(obj["op"] as? String, "ended")
            XCTAssertEqual(obj["kernel_id"] as? String, "k1")
            XCTAssertEqual(obj["reason"] as? String, expected)
        }

        // Deliver embeds msg as a JSON object, and rejects non-object JSON.
        let deliverLine = try XCTUnwrap(
            KernelProviderFraming.encodeDeliver(
                kernelID: "k1", channel: "iopub", messageJSON: #"{"header":{"msg_type":"status"}}"#))
        let deliverObj = try XCTUnwrap(
            JSONSerialization.jsonObject(with: deliverLine.dropLast()) as? [String: Any])
        XCTAssertEqual(deliverObj["op"] as? String, "deliver")
        XCTAssertEqual(deliverObj["channel"] as? String, "iopub")
        XCTAssertNotNil(deliverObj["msg"] as? [String: Any])
        XCTAssertNil(
            KernelProviderFraming.encodeDeliver(
                kernelID: "k1", channel: "iopub", messageJSON: "not-json"))
    }

    func testMalformedAndOversizedFramesAreRejected() {
        XCTAssertThrowsError(try KernelProviderFraming.decodeServerFrame(Data("not json".utf8))) {
            XCTAssertEqual($0 as? KernelProviderFrameError, .invalidJSON)
        }
        XCTAssertThrowsError(try KernelProviderFraming.decodeServerFrame(Data("[1,2,3]".utf8))) {
            XCTAssertEqual($0 as? KernelProviderFrameError, .invalidJSON)
        }
        XCTAssertThrowsError(try KernelProviderFraming.decodeServerFrame(Data("{}".utf8))) {
            XCTAssertEqual($0 as? KernelProviderFrameError, .missingField("op"))
        }
        XCTAssertThrowsError(
            try KernelProviderFraming.decodeServerFrame(Data(#"{"op":"bogus"}"#.utf8))
        ) {
            XCTAssertEqual($0 as? KernelProviderFrameError, .unknownOp("bogus"))
        }
        XCTAssertThrowsError(
            try KernelProviderFraming.decodeServerFrame(Data(#"{"op":"send","kernel_id":"k1"}"#.utf8))
        ) {
            XCTAssertEqual($0 as? KernelProviderFrameError, .missingField("channel"))
        }
        XCTAssertThrowsError(
            try KernelProviderFraming.decodeServerFrame(Data([0xFF, 0xFE]))
        ) {
            XCTAssertEqual($0 as? KernelProviderFrameError, .invalidUTF8)
        }

        // Line buffer rejects lines over maxLineBytes both with and without '\n'.
        var buf = KernelProviderLineBuffer(maxLineBytes: 8)
        XCTAssertEqual(try? buf.append(Data("12345678\n".utf8)), [Data("12345678".utf8)])
        XCTAssertThrowsError(try buf.append(Data("123456789\n".utf8))) {
            XCTAssertEqual($0 as? KernelProviderFrameError, .frameTooLarge(maxBytes: 8))
        }
        var bufNoNewline = KernelProviderLineBuffer(maxLineBytes: 8)
        XCTAssertThrowsError(try bufNoNewline.append(Data("123456789abc".utf8))) {
            XCTAssertEqual($0 as? KernelProviderFrameError, .frameTooLarge(maxBytes: 8))
        }
    }

    // MARK: - Socketpair Protocol Round-Trip Tests

    func testFullLifecycleHelloRegisterStartSendDeliverStopEnded() async throws {
        let (clientFD, serverFD) = try makeSocketPair()
        defer { Darwin.close(serverFD) }

        let lock = NSLock()
        var events: [KernelEvent] = []
        var states: [KernelProviderClient.State] = []

        let client = KernelProviderClient(
            fileDescriptor: clientFD,
            token: "secret-token",
            spec: AppKernels.spec, // includes argv; client must strip it
            onEvent: { event, _ in
                lock.withLock { events.append(event) }
            },
            onStateChange: { state in
                lock.withLock { states.append(state) }
            })
        client.start()

        // 1. Handshake: hello -> welcome
        let hello = try readJSONLine(from: serverFD)
        XCTAssertEqual(hello["op"] as? String, "hello")
        XCTAssertEqual(hello["token"] as? String, "secret-token")
        try writeJSONLine(["op": "welcome"], to: serverFD)

        // 2. Register: display-only spec (no argv) -> registered
        let reg = try readJSONLine(from: serverFD)
        XCTAssertEqual(reg["op"] as? String, "register")
        let spec = try XCTUnwrap(reg["spec"] as? [String: Any])
        XCTAssertEqual(spec["name"] as? String, AppKernels.inAppKernelName)
        XCTAssertNil(spec["argv"])
        try writeJSONLine(["op": "registered", "name": AppKernels.inAppKernelName], to: serverFD)

        await eventually("registered state") {
            client.state == .registered(name: AppKernels.inAppKernelName)
        }

        // 3. Server sends start -> client replies started and emits .start
        try writeJSONLine([
            "op": "start",
            "kernel_id": "kern-1",
            "launch": ["env": ["JPY_SESSION_NAME": "notes/demo.ipynb"]],
        ], to: serverFD)
        let started = try readJSONLine(from: serverFD)
        XCTAssertEqual(started["op"] as? String, "started")
        XCTAssertEqual(started["kernel_id"] as? String, "kern-1")
        XCTAssertNil(started["error"])

        await eventually("start event") {
            lock.withLock { events.count == 1 }
        }
        guard case .start(let kernel, let run, let launch) = lock.withLock({ events[0] }) else {
            return XCTFail("expected .start event")
        }
        XCTAssertEqual(kernel, "kern-1")
        XCTAssertEqual(AppKernels.notebook(in: launch), "notes/demo.ipynb")
        XCTAssertTrue(client.isLive("kern-1"))

        // 4. Server sends send -> client emits .send; client delivers reply -> server reads deliver
        try writeJSONLine([
            "op": "send",
            "kernel_id": "kern-1",
            "channel": "shell",
            "msg": ["header": ["msg_type": "kernel_info_request"]],
        ], to: serverFD)
        await eventually("send event") {
            lock.withLock { events.count == 2 }
        }
        guard case .send(let sendKernel, let channel, let msgJSON) = lock.withLock({ events[1] }) else {
            return XCTFail("expected .send event")
        }
        XCTAssertEqual(sendKernel, "kern-1")
        XCTAssertEqual(channel, "shell")
        XCTAssertTrue(msgJSON.contains("kernel_info_request"))

        XCTAssertTrue(
            client.deliver(
                "kern-1", run: run, channel: "shell",
                message: #"{"header":{"msg_type":"kernel_info_reply"},"content":{"status":"ok"}}"#))
        // Stale run must be rejected.
        XCTAssertFalse(
            client.deliver("kern-1", run: run + 99, channel: "shell", message: #"{"header":{}}"#))

        let delivered = try readJSONLine(from: serverFD)
        XCTAssertEqual(delivered["op"] as? String, "deliver")
        XCTAssertEqual(delivered["kernel_id"] as? String, "kern-1")
        XCTAssertEqual(delivered["channel"] as? String, "shell")
        let deliveredMsg = try XCTUnwrap(delivered["msg"] as? [String: Any])
        XCTAssertEqual((deliveredMsg["header"] as? [String: Any])?["msg_type"] as? String, "kernel_info_reply")

        // 5. Server sends stop -> client emits .stop and clears live run
        try writeJSONLine(["op": "stop", "kernel_id": "kern-1"], to: serverFD)
        await eventually("stop event") {
            lock.withLock { events.count == 3 }
        }
        guard case .stop(let stoppedKernel) = lock.withLock({ events[2] }) else {
            return XCTFail("expected .stop event")
        }
        XCTAssertEqual(stoppedKernel, "kern-1")
        XCTAssertFalse(client.isLive("kern-1"))

        // 6. Start a second kernel and report ended("lost")
        try writeJSONLine(["op": "start", "kernel_id": "kern-2", "launch": ["env": [:]]], to: serverFD)
        _ = try readJSONLine(from: serverFD) // started
        await eventually("second start") {
            lock.withLock { events.count == 4 }
        }
        guard case .start(_, let run2, _) = lock.withLock({ events[3] }) else {
            return XCTFail("expected second .start")
        }
        client.ended("kern-2", run: run2, reason: "lost")
        let ended = try readJSONLine(from: serverFD)
        XCTAssertEqual(ended["op"] as? String, "ended")
        XCTAssertEqual(ended["kernel_id"] as? String, "kern-2")
        XCTAssertEqual(ended["reason"] as? String, "lost")
        XCTAssertFalse(client.isLive("kern-2"))

        // 7. Clean disconnect sends unregister and reaches .disconnected
        client.disconnect(sendUnregister: true)
        let unreg = try readJSONLine(from: serverFD)
        XCTAssertEqual(unreg["op"] as? String, "unregister")
        XCTAssertEqual(unreg["name"] as? String, AppKernels.inAppKernelName)
        await eventually("disconnected state") {
            client.state == .disconnected
        }
    }

    func testWelcomeErrorAndRegisterErrorCloseConnection() async throws {
        // Welcome error
        let (c1, s1) = try makeSocketPair()
        defer { Darwin.close(s1) }
        let client1 = KernelProviderClient(fileDescriptor: c1, token: "wrong", onEvent: { _, _ in })
        client1.start()
        _ = try readJSONLine(from: s1) // hello
        try writeJSONLine(["op": "welcome", "error": "the token is not this server's"], to: s1)
        await eventually("welcome failure") {
            if case .failed(let msg) = client1.state { return msg.contains("token") }
            return false
        }

        // Register error (e.g. reserved name)
        let (c2, s2) = try makeSocketPair()
        defer { Darwin.close(s2) }
        let client2 = KernelProviderClient(fileDescriptor: c2, token: "ok", onEvent: { _, _ in })
        client2.start()
        _ = try readJSONLine(from: s2) // hello
        try writeJSONLine(["op": "welcome"], to: s2)
        _ = try readJSONLine(from: s2) // register
        try writeJSONLine(
            ["op": "registered", "name": "cdp-browser", "error": "reserved for another program"],
            to: s2)
        await eventually("register failure") {
            if case .failed(let msg) = client2.state { return msg.contains("reserved") }
            return false
        }
    }

    func testOversizedAndMalformedServerFramesCloseConnection() async throws {
        // Oversized frame
        let (c1, s1) = try makeSocketPair()
        defer { Darwin.close(s1) }
        let client1 = KernelProviderClient(
            fileDescriptor: c1, token: "ok", maxLineBytes: 64, onEvent: { _, _ in })
        client1.start()
        _ = try readJSONLine(from: s1) // hello
        try writeRaw(Data(repeating: UInt8(ascii: "x"), count: 128), to: s1)
        await eventually("oversized failure") {
            if case .failed(let msg) = client1.state { return msg.contains("64") }
            return false
        }

        // Malformed JSON frame
        let (c2, s2) = try makeSocketPair()
        defer { Darwin.close(s2) }
        let client2 = KernelProviderClient(fileDescriptor: c2, token: "ok", onEvent: { _, _ in })
        client2.start()
        _ = try readJSONLine(from: s2) // hello
        try writeRaw(Data("{not-json\n".utf8), to: s2)
        await eventually("malformed failure") {
            if case .failed = client2.state { return true }
            return false
        }
    }

    func testHandshakeTimeoutClosesConnection() async throws {
        let (c, s) = try makeSocketPair()
        defer { Darwin.close(s) }
        let client = KernelProviderClient(
            fileDescriptor: c, token: "ok", handshakeTimeout: .milliseconds(100),
            onEvent: { _, _ in })
        client.start()
        _ = try readJSONLine(from: s) // hello, then server stays silent
        await eventually("handshake timeout") {
            if case .failed(let msg) = client.state { return msg.contains("timed out") }
            return false
        }
    }

    // MARK: - Real Unix Socket + Manager Lifecycle Tests

    @MainActor
    func testManagerConnectsOverTempUnixSocketReconnectsOnRestartAndDrop() async throws {
        let listener1 = try TempUnixListener()
        defer { listener1.close() }
        let listener2 = try TempUnixListener()
        defer { listener2.close() }

        var detachedCount = 0
        let manager = KernelProviderManager(
            retryDelays: [.milliseconds(40), .milliseconds(80)],
            onKernelEvent: { _, _, _ in },
            onDetach: { _ in detachedCount += 1 },
            makeClient: { server, socketPath, onEvent, onStateChange in
                try KernelProviderClient(
                    socketPath: socketPath, token: server.token,
                    spec: AppKernels.providerSpec, onEvent: onEvent, onStateChange: onStateChange)
            })

        let server1 = ThisMacServer(
            pid: 1001, url: URL(string: "http://127.0.0.1:8888/")!, token: "tok-1",
            root: URL(fileURLWithPath: "/Users/me", isDirectory: true), version: "0.18.0",
            kernelProvidersSocket: listener1.path)
        let key1 = KernelProviderManager.ConnectionKey(pid: 1001, socketPath: listener1.path)

        manager.sync(servers: [server1])
        let accepted1 = await listener1.acceptAsync()
        let peer1 = try XCTUnwrap(accepted1)
        let hello1 = try readJSONLine(from: peer1)
        XCTAssertEqual(hello1["token"] as? String, "tok-1")
        try writeJSONLine(["op": "welcome"], to: peer1)
        _ = try readJSONLine(from: peer1) // register
        try writeJSONLine(["op": "registered", "name": "cdp-browser"], to: peer1)

        await eventually("manager registered on server1") {
            manager.state(for: key1) == .registered(name: "cdp-browser")
        }

        // Unexpected server drop -> manager detaches and reconnects on the same socket.
        Darwin.close(peer1)
        await eventually("detach after drop") { detachedCount == 1 }
        let acceptedRetry = await listener1.acceptAsync()
        let peer1Retry = try XCTUnwrap(acceptedRetry)
        defer { Darwin.close(peer1Retry) }
        _ = try readJSONLine(from: peer1Retry) // hello
        try writeJSONLine(["op": "welcome"], to: peer1Retry)
        _ = try readJSONLine(from: peer1Retry) // register
        try writeJSONLine(["op": "registered", "name": "cdp-browser"], to: peer1Retry)
        await eventually("reconnected on server1") {
            manager.state(for: key1) == .registered(name: "cdp-browser")
        }

        // Background server restarts with a new PID and socket path.
        let server2 = ThisMacServer(
            pid: 2002, url: URL(string: "http://127.0.0.1:8889/")!, token: "tok-2",
            root: URL(fileURLWithPath: "/Users/me", isDirectory: true), version: "0.18.0",
            kernelProvidersSocket: listener2.path)
        let key2 = KernelProviderManager.ConnectionKey(pid: 2002, socketPath: listener2.path)

        manager.sync(servers: [server2])
        let accepted2 = await listener2.acceptAsync()
        let peer2 = try XCTUnwrap(accepted2)
        defer { Darwin.close(peer2) }
        let hello2 = try readJSONLine(from: peer2)
        XCTAssertEqual(hello2["token"] as? String, "tok-2")
        try writeJSONLine(["op": "welcome"], to: peer2)
        _ = try readJSONLine(from: peer2) // register
        try writeJSONLine(["op": "registered", "name": "cdp-browser"], to: peer2)

        await eventually("registered on server2") {
            manager.activeKeys == [key2] && manager.state(for: key2) == .registered(name: "cdp-browser")
        }
        XCTAssertGreaterThanOrEqual(detachedCount, 2)

        // Clean teardown on quit.
        manager.disconnectAll(synchronous: true)
        XCTAssertTrue(manager.activeKeys.isEmpty)
    }

    // MARK: - ThisMacVerifier & ThisMacChecks Discovery Tests

    func testVerifierReadsKernelProvidersSocketFromServerInfo() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("kp-verifier-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        let file = dir.appendingPathComponent("jpserver-4242.json")
        let payload: [String: Any] = [
            "pid": 4242,
            "url": "http://127.0.0.1:8888/",
            "port": 8888,
            "token": "abc",
            "root_dir": "/Users/me",
            "ganymede_version": "0.18.0",
            "kernel_providers_socket": "/Users/me/Library/Jupyter/runtime/ganymede-kernels-4242.sock",
        ]
        try JSONSerialization.data(withJSONObject: payload).write(to: file)

        let info = try XCTUnwrap(ThisMacVerifier.read(file))
        XCTAssertEqual(
            info.kernelProvidersSocket,
            "/Users/me/Library/Jupyter/runtime/ganymede-kernels-4242.sock")

        // Empty string reads as nil.
        var withoutSocket = payload
        withoutSocket["kernel_providers_socket"] = ""
        try JSONSerialization.data(withJSONObject: withoutSocket).write(to: file)
        XCTAssertNil(ThisMacVerifier.read(file)?.kernelProvidersSocket)
    }

    @MainActor
    func testThisMacChecksNotifiesVerifiedServersAndWatchesProviderPidWithoutRemotes() async {
        @MainActor
        final class FakeWorld: ThisMacCheckWorld {
            var now: [ThisMacServer] = []
            var exits: [(pid: Int32, exit: @MainActor () -> Void)] = []
            var asked = 0
            var isBackgroundServerEnabled = false
            var debounce: Duration = .zero

            func scan() async -> ThisMacScanResult {
                asked += 1
                return ThisMacScanResult(verified: now)
            }
            func scanNow() -> ThisMacScanResult { ThisMacScanResult(verified: now) }
            func watch(pid: Int32, exit: @escaping @MainActor @Sendable () -> Void) -> any ThisMacWatch {
                exits.append((pid, { exit() }))
                return DummyWatch()
            }
            func watchRuntimeDirectory(_ change: @escaping @MainActor @Sendable () -> Void) -> (any ThisMacWatch)? {
                DummyWatch()
            }
            func infoFileDates() -> [String: Date] { [:] }
            func terminate(pid: Int32) {}
        }
        @MainActor final class DummyWatch: ThisMacWatch { func cancel() {} }

        let world = FakeWorld()
        let bgServer = ThisMacServer(
            pid: 7777, url: URL(string: "http://127.0.0.1:8888/")!, token: "bg-token",
            root: URL(fileURLWithPath: "/Users/me", isDirectory: true), version: "0.18.0",
            kernelProvidersSocket: "/tmp/ganymede-kernels-7777.sock")
        world.now = [bgServer]

        let checks = ThisMacChecks(world: world)
        // Deliberately no saved remotes!
        checks.remotes = { [] }
        var updates: [[ThisMacServer]] = []
        checks.onVerifiedServersChanged = { updates.append($0) }

        checks.refresh()
        await checks.waitForChecks()

        XCTAssertEqual(updates, [[bgServer]])
        XCTAssertEqual(world.exits.map(\.pid), [7777])

        // Process exit clears verifiedServers, notifies provider manager, and re-scans.
        world.now = []
        let askedBeforeExit = world.asked
        world.exits.first?.exit()
        await eventually("rescan after background server exit") { world.asked > askedBeforeExit }
        await checks.waitForChecks()
        XCTAssertEqual(updates.last, [])
    }

    // MARK: - Name Reservation Helper Tests (#941, ganymede#986)

    func testReservationBuildsValidCodeRequirementForSignedIdentity() throws {
        let req = try XCTUnwrap(
            KernelProviderReservation.codeRequirement(
                bundleIdentifier: "com.ganymede-server.Ganymede",
                teamIdentifier: "ABCDE12345"))
        XCTAssertEqual(
            req,
            "identifier \"com.ganymede-server.Ganymede\" and anchor apple generic"
                + " and certificate leaf[subject.OU] = \"ABCDE12345\"")

        // macOS Security framework itself must accept the generated csreq string.
        var secReq: SecRequirement?
        let status = SecRequirementCreateWithString(req as CFString, [], &secReq)
        XCTAssertEqual(status, errSecSuccess, "SecRequirementCreateWithString rejected: \(req)")
        XCTAssertNotNil(secReq)

        let patch = KernelProviderReservation.configPatch(
            enabled: true,
            identity: .init(bundleIdentifier: "com.ganymede-server.Ganymede", teamIdentifier: "ABCDE12345"))
        let kp = try XCTUnwrap(patch["kernel_providers"] as? [String: Any])
        XCTAssertEqual(kp["enabled"] as? Bool, true)
        let reserve = try XCTUnwrap(kp["reserve"] as? [String: String])
        XCTAssertEqual(reserve[AppKernels.inAppKernelName], req)
    }

    func testReservationRejectsMissingOrUnsafeIdentifiersAndOmitsReserveWhenUnsigned() throws {
        XCTAssertNil(KernelProviderReservation.codeRequirement(bundleIdentifier: nil, teamIdentifier: "ABCDE12345"))
        XCTAssertNil(KernelProviderReservation.codeRequirement(bundleIdentifier: "com.example.App", teamIdentifier: nil))
        XCTAssertNil(KernelProviderReservation.codeRequirement(bundleIdentifier: "", teamIdentifier: "ABCDE12345"))
        XCTAssertNil(KernelProviderReservation.codeRequirement(bundleIdentifier: "bad\"quote", teamIdentifier: "ABCDE12345"))
        XCTAssertNil(KernelProviderReservation.codeRequirement(bundleIdentifier: "com.example.App", teamIdentifier: "BAD TEAM"))
        XCTAssertNil(KernelProviderReservation.codeRequirement(bundleIdentifier: "com.example.App", teamIdentifier: "A\" or always"))

        // Unsigned debug build (`identity == nil`) enables providers without `reserve`.
        let unsignedPatch = KernelProviderReservation.configPatch(enabled: true, identity: nil)
        let kp = try XCTUnwrap(unsignedPatch["kernel_providers"] as? [String: Any])
        XCTAssertEqual(kp["enabled"] as? Bool, true)
        XCTAssertNil(kp["reserve"])

        // Disabled leaves `reserve` out even when signed.
        let disabledPatch = KernelProviderReservation.configPatch(
            enabled: false,
            identity: .init(bundleIdentifier: "com.ganymede-server.Ganymede", teamIdentifier: "ABCDE12345"))
        let kpOff = try XCTUnwrap(disabledPatch["kernel_providers"] as? [String: Any])
        XCTAssertEqual(kpOff["enabled"] as? Bool, false)
        XCTAssertNil(kpOff["reserve"])
    }
}
#endif
