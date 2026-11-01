#if os(macOS)
import Foundation
import SwiftTerm

/// A program on this Mac in a pseudo-terminal the app spawns, such as
/// `/usr/bin/ssh`: it sees a real terminal, so ssh-config, the SSH agent,
/// ProxyJump and known_hosts prompts all work as in Terminal.app.
@MainActor
final class ProcessTerminalTransport: TerminalTransport {
    var onOutput: ((ArraySlice<UInt8>) -> Void)?
    var onClose: ((String?) -> Void)?
    let executable: String
    let arguments: [String]
    let directory: String?
    private var process: LocalProcess?
    private var relay: Relay?
    fileprivate var size = winsize(ws_row: 24, ws_col: 80, ws_xpixel: 0, ws_ypixel: 0)
    private var ended = false

    init(executable: String, arguments: [String] = [], directory: String? = nil) {
        self.executable = executable
        self.arguments = arguments
        self.directory = directory
    }

    func start() {
        guard process == nil, !ended else { return }
        let relay = Relay(owner: self)
        let process = LocalProcess(delegate: relay, dispatchQueue: .main)
        self.relay = relay
        self.process = process
        var environment = ProcessInfo.processInfo.environment
        environment["TERM"] = "xterm-256color"
        environment["COLORTERM"] = "truecolor"
        let result = process.startProcessChecked(
            executable: executable,
            args: arguments,
            environment: environment.map { "\($0.key)=\($0.value)" },
            currentDirectory: directory
        )
        if case .failure(let error) = result {
            finish("\(name) could not start: \(error)")
        }
    }

    func send(_ data: ArraySlice<UInt8>) {
        guard !ended else { return }
        process?.send(data: data)
    }

    func resize(cols: Int, rows: Int) {
        guard cols > 0, rows > 0 else { return }
        size = winsize(ws_row: UInt16(clamping: rows), ws_col: UInt16(clamping: cols), ws_xpixel: 0, ws_ypixel: 0)
        _ = process?.updateWindowSize(&size)
    }

    func close() {
        guard !ended else { return }
        ended = true
        process?.terminate()
    }

    private var name: String {
        (executable as NSString).lastPathComponent
    }

    fileprivate func received(_ data: ArraySlice<UInt8>) {
        guard !ended else { return }
        onOutput?(data)
    }

    fileprivate func exited(_ code: Int32?) {
        switch code {
        case 0: finish(nil)
        case 127: finish("\(name) could not be run.")
        case let code?: finish("\(name) exited with status \(code).")
        case nil: finish("\(name) was stopped by a signal.")
        }
    }

    private func finish(_ reason: String?) {
        guard !ended else { return }
        ended = true
        onClose?(reason)
    }
}

/// LocalProcess's delegate, which it holds weakly. Data arrives on the
/// main queue (the queue passed to LocalProcess); the exit may not.
private final class Relay: LocalProcessDelegate {
    weak var owner: ProcessTerminalTransport?

    init(owner: ProcessTerminalTransport) {
        self.owner = owner
    }

    func dataReceived(slice: ArraySlice<UInt8>) {
        MainActor.assumeIsolated { owner?.received(slice) }
    }

    func processTerminated(_ source: LocalProcess, exitCode: Int32?) {
        DispatchQueue.main.async { [weak owner] in
            MainActor.assumeIsolated { owner?.exited(exitCode) }
        }
    }

    func processFailedToStart(_ source: LocalProcess, error: LocalProcessError) {
        DispatchQueue.main.async { [weak owner] in
            MainActor.assumeIsolated { owner?.exited(127) }
        }
    }

    func getWindowSize() -> winsize {
        if Thread.isMainThread {
            return MainActor.assumeIsolated { owner?.size } ?? winsize(ws_row: 24, ws_col: 80, ws_xpixel: 0, ws_ypixel: 0)
        }
        return winsize(ws_row: 24, ws_col: 80, ws_xpixel: 0, ws_ypixel: 0)
    }
}
#endif
