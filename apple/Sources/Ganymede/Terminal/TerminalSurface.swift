import SwiftTerm
import SwiftUI

/// A terminal drawn by SwiftTerm, connected to `transport`: output is fed
/// to the screen, keystrokes and size changes go back. The transport is
/// started when the view appears and closed when it goes away.
struct TerminalSurface: View {
    let transport: TerminalTransport
    /// The title the program running in the terminal sets (OSC 0/2).
    var onTitle: ((String) -> Void)?

    var body: some View {
        TerminalRepresentable(transport: transport, onTitle: onTitle)
    }
}

#if os(macOS)
private struct TerminalRepresentable: NSViewRepresentable {
    let transport: TerminalTransport
    var onTitle: ((String) -> Void)?

    func makeCoordinator() -> TerminalCoordinator {
        TerminalCoordinator(transport: transport)
    }

    func makeNSView(context: Context) -> TerminalView {
        let view = TerminalView(frame: .zero)
        context.coordinator.onTitle = onTitle
        context.coordinator.attach(view)
        return view
    }

    func updateNSView(_ view: TerminalView, context: Context) {
        context.coordinator.onTitle = onTitle
    }

    static func dismantleNSView(_ view: TerminalView, coordinator: TerminalCoordinator) {
        coordinator.detach()
        TerminalCoordinator.closeWhenIdle(view)
    }
}
#else
private struct TerminalRepresentable: UIViewRepresentable {
    let transport: TerminalTransport
    var onTitle: ((String) -> Void)?

    func makeCoordinator() -> TerminalCoordinator {
        TerminalCoordinator(transport: transport)
    }

    func makeUIView(context: Context) -> TerminalView {
        let view = TerminalView(frame: .zero)
        context.coordinator.onTitle = onTitle
        context.coordinator.attach(view)
        return view
    }

    func updateUIView(_ view: TerminalView, context: Context) {
        context.coordinator.onTitle = onTitle
    }

    static func dismantleUIView(_ view: TerminalView, coordinator: TerminalCoordinator) {
        coordinator.detach()
        TerminalCoordinator.closeWhenIdle(view)
    }
}
#endif

/// Joins one `TerminalView` to one transport.
@MainActor
final class TerminalCoordinator: NSObject, TerminalViewDelegate {
    let transport: TerminalTransport
    var onTitle: ((String) -> Void)?
    private weak var view: TerminalView?

    init(transport: TerminalTransport) {
        self.transport = transport
    }

    func attach(_ view: TerminalView) {
        self.view = view
        view.terminalDelegate = self
        transport.onOutput = { [weak view] bytes in
            view?.feed(byteArray: bytes)
        }
        transport.onClose = { [weak view] reason in
            view?.feed(text: "\r\n[\(reason ?? "Session ended")]\r\n")
        }
        // SwiftTerm reports the size through `sizeChanged` once the view
        // is laid out.
        transport.start()
    }

    func detach() {
        transport.onOutput = nil
        transport.onClose = nil
        transport.close()
        view?.terminalDelegate = nil
    }

    /// SwiftTerm's renderer may still be drawing; it says when it can be
    /// released, so try again shortly until it does.
    static func closeWhenIdle(_ view: TerminalView) {
        guard !view.updateUiClosed() else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { @MainActor in
            closeWhenIdle(view)
        }
    }

    // MARK: TerminalViewDelegate

    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        transport.resize(cols: newCols, rows: newRows)
    }

    func setTerminalTitle(source: TerminalView, title: String) {
        onTitle?(title)
    }

    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}

    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        transport.send(data)
    }

    func scrolled(source: TerminalView, position: Double) {}

    func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
        guard let url = URL(string: link), ["http", "https"].contains(url.scheme?.lowercased()) else {
            return
        }
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }

    func bell(source: TerminalView) {}

    func clipboardCopy(source: TerminalView, content: Data) {
        guard let text = String(data: content, encoding: .utf8) else { return }
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #else
        UIPasteboard.general.string = text
        #endif
    }

    /// Programs in the terminal can't read the clipboard (OSC 52 read):
    /// a remote host would get whatever was copied last.
    func clipboardRead(source: TerminalView) -> Data? {
        nil
    }

    func iTermContent(source: TerminalView, content: ArraySlice<UInt8>) {}

    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
}
