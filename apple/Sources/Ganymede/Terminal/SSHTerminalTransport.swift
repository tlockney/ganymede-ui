#if os(iOS)
import CryptoKit
import Foundation
import NIOCore
import NIOPosix
import NIOSSH

/// A shell on a remote over SSH, in the app's process (swift-nio-ssh):
/// what iOS uses, since it can't run /usr/bin/ssh. Signs in with the
/// app's ed25519 key and trusts the host key on first use.
@MainActor
final class SSHTerminalTransport: TerminalTransport {
    var onOutput: ((ArraySlice<UInt8>) -> Void)?
    var onClose: ((String?) -> Void)?

    struct Target {
        var remote: UUID
        var host: String
        var port: Int
        var user: String
    }

    let target: Target
    private let key: Curve25519.Signing.PrivateKey
    private let hostKeys: HostKeyStore
    private var channel: Channel?
    private var session: Channel?
    private var size = (cols: 80, rows: 24)
    private var started = false
    private var ended = false
    /// Why the connection was refused, set from the event loop, so the
    /// close can say more than the channel error does.
    private let problem = Problem()

    init(target: Target, key: Curve25519.Signing.PrivateKey, hostKeys: HostKeyStore) {
        self.target = target
        self.key = key
        self.hostKeys = hostKeys
    }

    func start() {
        guard !started, !ended else { return }
        started = true
        let relay = SessionRelay(owner: self)
        let problem = self.problem
        let sshKey = NIOSSHPrivateKey(ed25519Key: key)
        let user = target.user
        let remote = target.remote
        let hostKeys = self.hostKeys
        let size = self.size
        let bootstrap = ClientBootstrap(group: MultiThreadedEventLoopGroup.singleton)
            .connectTimeout(.seconds(15))
            .channelOption(ChannelOptions.socket(SocketOptionLevel(IPPROTO_TCP), TCP_NODELAY), value: 1)
            .channelInitializer { channel in
                channel.eventLoop.makeCompletedFuture {
                    // swift-nio-ssh doesn't close the connection when the
                    // sign-in or host key is refused, so these do.
                    let refuse = { channel.close(promise: nil) }
                    let auth = KeyAuthentication(user: user, key: sshKey, problem: problem, refuse: refuse)
                    let hosts = HostKeyCheck(remote: remote, store: hostKeys, problem: problem, refuse: refuse)
                    let ssh = NIOSSHHandler(
                        role: .client(.init(userAuthDelegate: auth, serverAuthDelegate: hosts)),
                        allocator: channel.allocator,
                        inboundChildChannelInitializer: nil
                    )
                    try channel.pipeline.syncOperations.addHandler(ssh)
                    try channel.pipeline.syncOperations.addHandler(CloseOnError(problem: problem))
                }
            }
        let host = target.host
        let port = target.port
        Task {
            var connection: Channel?
            do {
                let channel = try await bootstrap.connect(host: host, port: port).get()
                connection = channel
                // Kept now, so close() during the handshake ends it.
                self.channel = channel
                guard !self.ended else {
                    channel.close(promise: nil)
                    return
                }
                let session = try await Self.openSession(on: channel, size: size, relay: relay, problem: problem)
                self.connected(channel: channel, session: session)
            } catch {
                connection?.close(promise: nil)
                self.finish(problem.value ?? Self.describe(error))
            }
        }
    }

    /// Opens the shell channel once the connection is up. Fails if the
    /// connection closes first (a refused host key or sign-in), or if the
    /// server doesn't get that far in time.
    private nonisolated static func openSession(
        on channel: Channel, size: (cols: Int, rows: Int), relay: SessionRelay, problem: Problem
    ) async throws -> Channel {
        try await channel.eventLoop.flatSubmit {
            let result = channel.eventLoop.makePromise(of: Channel.self)
            var done = false
            func complete(_ outcome: Result<Channel, Error>) {
                guard !done else { return }
                done = true
                result.completeWith(outcome)
            }
            channel.closeFuture.whenComplete { _ in
                complete(.failure(SSHFailure("Disconnected.")))
            }
            let timeout = channel.eventLoop.scheduleTask(in: .seconds(30)) {
                problem.set("The server did not finish signing in within 30 seconds.")
                channel.close(promise: nil)
            }
            result.futureResult.whenComplete { _ in timeout.cancel() }
            do {
                let ssh = try channel.pipeline.syncOperations.handler(type: NIOSSHHandler.self)
                let promise = channel.eventLoop.makePromise(of: Channel.self)
                promise.futureResult.whenComplete { complete($0) }
                ssh.createChannel(promise, channelType: .session) { child, type in
                    guard case .session = type else {
                        return child.eventLoop.makeFailedFuture(SSHFailure("Unexpected channel type."))
                    }
                    return child.eventLoop.makeCompletedFuture {
                        try child.pipeline.syncOperations.addHandler(
                            ShellHandler(size: size, relay: relay, problem: problem)
                        )
                    }
                }
            } catch {
                complete(.failure(error))
            }
            return result.futureResult
        }.get()
    }

    private func connected(channel: Channel, session: Channel) {
        guard !ended else {
            channel.close(promise: nil)
            return
        }
        self.session = session
        session.closeFuture.whenComplete { [weak self] _ in
            // After the output and exit status queued before it.
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self?.sessionClosed() }
            }
        }
        resize(cols: size.cols, rows: size.rows)
    }

    func send(_ data: ArraySlice<UInt8>) {
        guard let session, !ended else { return }
        var buffer = session.allocator.buffer(capacity: data.count)
        buffer.writeBytes(data)
        session.writeAndFlush(SSHChannelData(type: .channel, data: .byteBuffer(buffer)), promise: nil)
    }

    func resize(cols: Int, rows: Int) {
        guard cols > 0, rows > 0 else { return }
        size = (cols, rows)
        let change = SSHChannelRequestEvent.WindowChangeRequest(
            terminalCharacterWidth: cols, terminalRowHeight: rows, terminalPixelWidth: 0, terminalPixelHeight: 0
        )
        session?.triggerUserOutboundEvent(change, promise: nil)
    }

    func close() {
        guard !ended else { return }
        ended = true
        channel?.close(promise: nil)
    }

    fileprivate func received(_ bytes: [UInt8]) {
        guard !ended else { return }
        onOutput?(bytes[...])
    }

    fileprivate var exitStatus: Int?

    private func sessionClosed() {
        channel?.close(promise: nil)
        switch exitStatus {
        case 0?: finish(nil)
        case let code?: finish("The shell ended with status \(code).")
        case nil: finish(problem.value ?? "Disconnected.")
        }
    }

    private func finish(_ reason: String?) {
        guard !ended else { return }
        ended = true
        channel?.close(promise: nil)
        onClose?(reason)
    }

    private nonisolated static func describe(_ error: Error) -> String {
        if let failure = error as? SSHFailure { return failure.message }
        return "Could not connect: \(error)"
    }
}

struct SSHFailure: Error {
    let message: String
    init(_ message: String) { self.message = message }
}

/// The first reason given for refusing the connection.
private final class Problem: @unchecked Sendable {
    private let lock = NSLock()
    private var reason: String?

    var value: String? {
        lock.lock()
        defer { lock.unlock() }
        return reason
    }

    func set(_ reason: String) {
        lock.lock()
        defer { lock.unlock() }
        if self.reason == nil { self.reason = reason }
    }
}

/// Passes what the shell channel sees back to the transport.
private final class SessionRelay: @unchecked Sendable {
    weak var owner: SSHTerminalTransport?

    @MainActor init(owner: SSHTerminalTransport) {
        self.owner = owner
    }

    func output(_ bytes: [UInt8]) {
        // The main queue keeps the chunks in order.
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated { self?.owner?.received(bytes) }
        }
    }

    func exited(_ status: Int) {
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated { self?.owner?.exitStatus = status }
        }
    }
}

/// Offers the app's key once; the server may refuse it.
private final class KeyAuthentication: NIOSSHClientUserAuthenticationDelegate, @unchecked Sendable {
    private let user: String
    private let key: NIOSSHPrivateKey
    private let problem: Problem
    private let refuse: () -> Void
    private var offered = false

    init(user: String, key: NIOSSHPrivateKey, problem: Problem, refuse: @escaping () -> Void) {
        self.user = user
        self.key = key
        self.problem = problem
        self.refuse = refuse
    }

    func nextAuthenticationType(
        availableMethods: NIOSSHAvailableUserAuthenticationMethods,
        nextChallengePromise: EventLoopPromise<NIOSSHUserAuthenticationOffer?>
    ) {
        guard !offered, availableMethods.contains(.publicKey) else {
            problem.set(
                "The server did not accept the app's key for \(user). Add the public key from the "
                    + "remote's settings to ~/.ssh/authorized_keys there."
            )
            nextChallengePromise.succeed(nil)
            // Giving up sends nothing, so the server would wait out its
            // LoginGraceTime.
            refuse()
            return
        }
        offered = true
        nextChallengePromise.succeed(
            NIOSSHUserAuthenticationOffer(username: user, serviceName: "", offer: .privateKey(.init(privateKey: key)))
        )
    }
}

/// Trust on first use, against the keys stored per remote.
private final class HostKeyCheck: NIOSSHClientServerAuthenticationDelegate, @unchecked Sendable {
    private let remote: UUID
    private let store: HostKeyStore
    private let problem: Problem
    private let refuse: () -> Void

    init(remote: UUID, store: HostKeyStore, problem: Problem, refuse: @escaping () -> Void) {
        self.remote = remote
        self.store = store
        self.problem = problem
        self.refuse = refuse
    }

    func validateHostKey(hostKey: NIOSSHPublicKey, validationCompletePromise: EventLoopPromise<Void>) {
        let line = String(openSSHPublicKey: hostKey)
        switch store.check(line, for: remote) {
        case .known, .new:
            validationCompletePromise.succeed(())
        case .changed(let stored):
            let message = "The host key changed. It was \(HostKeyStore.fingerprint(stored)) and is now "
                + "\(HostKeyStore.fingerprint(line)). If you expected this, forget the old key in "
                + "the remote's settings."
            problem.set(message)
            validationCompletePromise.fail(SSHFailure(message))
            refuse()
        }
    }
}

/// Closes the connection on an error, which NIOSSHHandler only passes on.
private final class CloseOnError: ChannelInboundHandler {
    typealias InboundIn = Any

    private let problem: Problem

    init(problem: Problem) {
        self.problem = problem
    }

    func errorCaught(context: ChannelHandlerContext, error: Error) {
        problem.set("The connection failed: \(error)")
        context.close(promise: nil)
    }
}

/// The session channel: asks for a pseudo-terminal and a shell, then
/// passes data both ways.
private final class ShellHandler: ChannelDuplexHandler {
    typealias InboundIn = SSHChannelData
    typealias OutboundIn = SSHChannelData
    typealias OutboundOut = SSHChannelData

    private let size: (cols: Int, rows: Int)
    private let relay: SessionRelay
    private let problem: Problem
    /// Replies still due, in the order the requests were sent.
    private var pending = ["The server refused a terminal (pty) for this session.", "The server refused to start a shell."]

    init(size: (cols: Int, rows: Int), relay: SessionRelay, problem: Problem) {
        self.size = size
        self.relay = relay
        self.problem = problem
    }

    func handlerAdded(context: ChannelHandlerContext) {
        context.channel.setOption(ChannelOptions.allowRemoteHalfClosure, value: true).whenFailure { _ in }
    }

    func channelActive(context: ChannelHandlerContext) {
        let pty = SSHChannelRequestEvent.PseudoTerminalRequest(
            wantReply: true,
            term: "xterm-256color",
            terminalCharacterWidth: size.cols,
            terminalRowHeight: size.rows,
            terminalPixelWidth: 0,
            terminalPixelHeight: 0,
            terminalModes: SSHTerminalModes([:])
        )
        context.triggerUserOutboundEvent(pty, promise: nil)
        context.triggerUserOutboundEvent(SSHChannelRequestEvent.ShellRequest(wantReply: true), promise: nil)
        context.fireChannelActive()
    }

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        let message = unwrapInboundIn(data)
        guard case .byteBuffer(let buffer) = message.data else { return }
        // stdout and stderr both go to the screen, as in a terminal.
        relay.output(Array(buffer.readableBytesView))
    }

    func userInboundEventTriggered(context: ChannelHandlerContext, event: Any) {
        switch event {
        case let status as SSHChannelRequestEvent.ExitStatus:
            relay.exited(status.exitStatus)
        case is ChannelSuccessEvent:
            if !pending.isEmpty { pending.removeFirst() }
        case is ChannelFailureEvent:
            if !pending.isEmpty { problem.set(pending.removeFirst()) }
            context.close(promise: nil)
        case let event as ChannelEvent where event == .inputClosed:
            // The server's EOF can come before the exit status; its close
            // follows, and ends the session.
            break
        default:
            context.fireUserInboundEventTriggered(event)
        }
    }

    func errorCaught(context: ChannelHandlerContext, error: Error) {
        context.close(promise: nil)
    }
}
#endif
