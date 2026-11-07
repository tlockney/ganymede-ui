import SwiftTerm
import SwiftUI
import WebKit

/// A terminal drawn by SwiftTerm, connected to `transport`: output is fed
/// to the screen, keystrokes and size changes go back. The transport is
/// started when the view appears and closed when it goes away.
struct TerminalSurface: View {
    let transport: TerminalTransport
    /// The title the program running in the terminal sets (OSC 0/2).
    var onTitle: ((String) -> Void)?
    /// The session ended from the other side, with the reason shown.
    var onEnd: ((String?) -> Void)?
    /// Whether the terminal has the keyboard: true takes it, false gives
    /// it up if it has it, nil leaves it to the user's clicks and taps.
    /// The bottom panels (#248, #251) set it so keys never go to a hidden
    /// shell.
    var focused: Bool?

    var body: some View {
        TerminalRepresentable(transport: transport, onTitle: onTitle, onEnd: onEnd, focused: focused)
    }
}

#if os(macOS)
private struct TerminalRepresentable: NSViewRepresentable {
    let transport: TerminalTransport
    var onTitle: ((String) -> Void)?
    var onEnd: ((String?) -> Void)?
    var focused: Bool?

    func makeCoordinator() -> TerminalCoordinator {
        TerminalCoordinator(transport: transport)
    }

    func makeNSView(context: Context) -> TerminalView {
        let view = TerminalView(frame: .zero)
        context.coordinator.onTitle = onTitle
        context.coordinator.onEnd = onEnd
        context.coordinator.attach(view)
        context.coordinator.focused = focused
        Self.applyFocus(focused, to: view)
        return view
    }

    func updateNSView(_ view: TerminalView, context: Context) {
        context.coordinator.onTitle = onTitle
        context.coordinator.onEnd = onEnd
        // Only on a change, so a click into the notebook isn't undone by
        // the next update.
        if focused != context.coordinator.focused {
            context.coordinator.focused = focused
            Self.applyFocus(focused, to: view)
        }
    }

    /// Takes or gives up the keyboard, on the next turn of the run loop:
    /// a new view is not in its window yet, and SwiftUI may be mid-update.
    private static func applyFocus(_ focused: Bool?, to view: TerminalView) {
        guard let focused else { return }
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            let has = window.firstResponder === view
            if focused, !has {
                window.makeFirstResponder(view)
            } else if !focused, has {
                returnKeyboardToPage(in: window)
            }
        }
    }

    static func dismantleNSView(_ view: TerminalView, coordinator: TerminalCoordinator) {
        coordinator.detach()
        TerminalCoordinator.closeWhenIdle(view)
    }
}

/// Gives the keyboard back to the notebook when a terminal gives it up,
/// or to the window when it shows no notebook.
@MainActor
func returnKeyboardToPage(in window: NSWindow) {
    window.makeFirstResponder(visibleWebView(in: window.contentView))
}

/// Whether a terminal has the keyboard in `window`: ⇧⌘↩ then fills the
/// window with the bottom panel rather than the notebook (#250).
@MainActor
func terminalHasKeyboard(in window: NSWindow) -> Bool {
    window.firstResponder is TerminalView
}

/// The first web view on show under `view`: the notebook page, not a
/// hidden kernel web view (a subview of it).
@MainActor
private func visibleWebView(in view: NSView?) -> WKWebView? {
    guard let view, !view.isHiddenOrHasHiddenAncestor else { return nil }
    if let web = view as? WKWebView, !web.frame.isEmpty { return web }
    for child in view.subviews {
        if let web = visibleWebView(in: child) { return web }
    }
    return nil
}
#else
private struct TerminalRepresentable: UIViewRepresentable {
    let transport: TerminalTransport
    var onTitle: ((String) -> Void)?
    var onEnd: ((String?) -> Void)?
    /// See `TerminalSurface.focused`: the iPad's bottom panel (#251).
    var focused: Bool?

    func makeCoordinator() -> TerminalCoordinator {
        TerminalCoordinator(transport: transport)
    }

    func makeUIView(context: Context) -> TerminalView {
        let view = TerminalView(frame: .zero)
        context.coordinator.onTitle = onTitle
        context.coordinator.onEnd = onEnd
        context.coordinator.attach(view)
        context.coordinator.focused = focused
        Self.applyFocus(focused, to: view)
        return view
    }

    func updateUIView(_ view: TerminalView, context: Context) {
        context.coordinator.onTitle = onTitle
        context.coordinator.onEnd = onEnd
        // Only on a change, so a tap into the notebook isn't undone by the
        // next update.
        if focused != context.coordinator.focused {
            context.coordinator.focused = focused
            Self.applyFocus(focused, to: view)
        }
    }

    /// Takes or gives up the keyboard, on the next turn of the run loop:
    /// a new view is not in its window yet, and SwiftUI may be mid-update.
    /// Giving it up hides the on-screen keyboard; the notebook gets it
    /// back on the next tap.
    private static func applyFocus(_ focused: Bool?, to view: TerminalView) {
        guard let focused else { return }
        DispatchQueue.main.async {
            guard view.window != nil else { return }
            if focused, !view.isFirstResponder {
                _ = view.becomeFirstResponder()
            } else if !focused, view.isFirstResponder {
                _ = view.resignFirstResponder()
            }
        }
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
    var onEnd: ((String?) -> Void)?
    /// The last `TerminalSurface.focused` applied.
    var focused: Bool?
    private weak var view: TerminalView?
    private var fontObserver: NSObjectProtocol?

    /// SwiftTerm keeps its own default until the setting names a face or size.
    private func applyFont(to view: TerminalView, initial: Bool) {
        let setting = CodeFont.setting
        if initial, setting == CodeFontSetting() { return }
        view.font = CodeFont.font(setting: setting)
    }

    init(transport: TerminalTransport) {
        self.transport = transport
    }

    func attach(_ view: TerminalView) {
        self.view = view
        view.terminalDelegate = self
        // The code font setting (#354), now and as it changes.
        applyFont(to: view, initial: true)
        fontObserver = observeCodeFont { [weak self] in
            guard let self, let view = self.view else { return }
            self.applyFont(to: view, initial: false)
        }
        transport.onOutput = { [weak view] bytes in
            view?.feed(byteArray: bytes)
        }
        transport.onClose = { [weak self, weak view] reason in
            view?.feed(text: "\r\n[\(reason ?? "Session ended")]\r\n")
            self?.onEnd?(reason)
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
