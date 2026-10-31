import Foundation

/// Where a terminal's bytes come from and go to: a Jupyter terminal over
/// a websocket, an SSH channel, or a local process. `TerminalSurface`
/// draws whatever arrives through `onOutput` and sends keystrokes back.
@MainActor
protocol TerminalTransport: AnyObject {
    /// Output from the other side, in the order it arrived.
    var onOutput: ((ArraySlice<UInt8>) -> Void)? { get set }
    /// Called once when the other side ends, with a reason to show, or
    /// nil when it ended normally.
    var onClose: ((String?) -> Void)? { get set }
    /// Connects. Output may start before this returns.
    func start()
    /// Keystrokes and pasted text, as the terminal encoded them.
    func send(_ data: ArraySlice<UInt8>)
    /// The visible size changed.
    func resize(cols: Int, rows: Int)
    /// Disconnects. `onClose` is not called for a close asked for here.
    func close()
}

/// Sends back what it is given, turning a carriage return into CR LF as a
/// terminal echoing a line would. For tests and previews.
@MainActor
final class EchoTransport: TerminalTransport {
    var onOutput: ((ArraySlice<UInt8>) -> Void)?
    var onClose: ((String?) -> Void)?
    private(set) var size: (cols: Int, rows: Int)?
    private(set) var started = false
    private(set) var closed = false

    func start() {
        started = true
    }

    func send(_ data: ArraySlice<UInt8>) {
        guard started, !closed else { return }
        var out: [UInt8] = []
        out.reserveCapacity(data.count)
        for byte in data {
            out.append(byte)
            if byte == 13 { out.append(10) }
        }
        onOutput?(out[...])
    }

    func resize(cols: Int, rows: Int) {
        size = (cols, rows)
    }

    func close() {
        closed = true
    }

    /// Ends the session from the other side, as a shell exiting would.
    func hangUp(reason: String? = nil) {
        guard !closed else { return }
        closed = true
        onClose?(reason)
    }
}
