import Foundation
import SwiftUI
#if os(macOS)
import AppKit
#endif

/// How ⌘⇧F waits for and confirms keyboard ownership on the Find field
/// (#881, #890): asks every `interval`, confirms across a second tick so
/// launch/web-view focus transitions cannot reclaim the keyboard behind our
/// back, and stops once `window.firstResponder` is the field's own editor.
enum FindFocus {
    static let interval: Duration = .milliseconds(50)
    static let attempts = 16
}

/// One ⌘⇧F focus request (#890): `sequence` distinguishes repeated presses
/// when Find is already open, while `pending` keeps tab switches via ⌘2 / ⌘4
/// from focusing the field when no ⌘⇧F is active.
struct FindFocusRequest: Equatable {
    var pending = false
    var sequence = 0

    mutating func trigger() {
        pending = true
        sequence &+= 1
    }

    mutating func clear() {
        pending = false
    }
}

/// Pure focus-claim state machine for `FindField` (#890), tested without a
/// window in both macOS and iOS test targets.
struct FindFocusTracker: Equatable {
    enum Step: Equatable {
        /// The field is not yet attached to a visible view hierarchy.
        case wait
        /// Make the field the window's first responder.
        case claim
        /// The field currently owns its editor; verify it holds on the next tick.
        case confirm
        /// Editor ownership held across confirmation; stop retrying.
        case done
    }

    private(set) var lastTriggeredSequence = 0
    private(set) var confirmedHold = false

    /// Begins tracking `request` when a new `⌘⇧F` sequence is pending.
    mutating func beginIfNeeded(_ request: FindFocusRequest) -> Bool {
        guard request.pending, request.sequence != lastTriggeredSequence else {
            return false
        }
        lastTriggeredSequence = request.sequence
        confirmedHold = false
        return true
    }

    mutating func resetConfirmation() {
        confirmedHold = false
    }

    mutating func nextStep(
        hasWindow: Bool,
        isHidden: Bool,
        hasEditorFocus: Bool
    ) -> Step {
        guard hasWindow, !isHidden else {
            confirmedHold = false
            return .wait
        }
        guard hasEditorFocus else {
            confirmedHold = false
            return .claim
        }
        if !confirmedHold {
            confirmedHold = true
            return .confirm
        }
        return .done
    }
}

#if os(macOS)
/// Verifies that `textField` actually owns keyboard input in its window (#890)
/// rather than trusting `firstResponder is NSText` (which matches any active
/// field editor) or SwiftUI `@FocusState`.
enum FindFocusOwnership {
    @MainActor
    static func ownsEditor(_ textField: NSTextField) -> Bool {
        guard let window = textField.window,
              !textField.isHiddenOrHasHiddenAncestor,
              let editor = textField.currentEditor()
        else { return false }
        return window.firstResponder === editor
    }
}

/// AppKit `NSTextField` backing the Mac sidebar's Find input (#890) so ⌘⇧F can
/// call `NSWindow.makeFirstResponder(_:)` directly and confirm `currentEditor()`
/// ownership on fresh launch when Find is the restored tab.
struct FindField: NSViewRepresentable {
    let prompt: String
    @Binding var text: String
    @Binding var focusRequest: FindFocusRequest
    var onEscape: () -> Void = {}

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text, focusRequest: $focusRequest, onEscape: onEscape)
    }

    func makeNSView(context: Context) -> FindNSTextField {
        let field = FindNSTextField()
        field.placeholderString = prompt
        field.stringValue = text
        field.bezelStyle = .roundedBezel
        field.isBezeled = true
        field.isBordered = true
        field.isEditable = true
        field.isSelectable = true
        field.usesSingleLineMode = true
        field.allowsEditingTextAttributes = false
        field.lineBreakMode = .byTruncatingTail
        field.font = .systemFont(ofSize: NSFont.systemFontSize)
        field.focusRingType = .default
        field.cell?.sendsActionOnEndEditing = false
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.setContentHuggingPriority(.defaultHigh, for: .vertical)
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        field.setAccessibilityLabel(prompt)
        field.setAccessibilityIdentifier("navigator.find.field")
        field.delegate = context.coordinator
        field.onEscape = { [weak coordinator = context.coordinator, weak field] in
            guard let field else { return }
            coordinator?.clearField(field)
        }
        context.coordinator.field = field
        if context.coordinator.tracker.beginIfNeeded(focusRequest) {
            context.coordinator.startFocusClaim()
        }
        return field
    }

    func updateNSView(_ field: FindNSTextField, context: Context) {
        context.coordinator.text = $text
        context.coordinator.focusRequest = $focusRequest
        context.coordinator.onEscape = onEscape
        let hasMarkedText = (field.currentEditor() as? NSTextView)?.hasMarkedText() ?? false
        if !hasMarkedText && field.stringValue != text {
            field.stringValue = text
        }
        if context.coordinator.tracker.beginIfNeeded(focusRequest) {
            context.coordinator.startFocusClaim()
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: FindNSTextField, context: Context) -> CGSize? {
        let height = nsView.intrinsicContentSize.height
        let width = proposal.width ?? nsView.intrinsicContentSize.width
        return CGSize(width: width, height: height)
    }

    static func dismantleNSView(_ field: FindNSTextField, coordinator: Coordinator) {
        coordinator.cancelFocusClaim()
    }

    @MainActor
    final class Coordinator: NSObject, NSTextFieldDelegate {
        var text: Binding<String>
        var focusRequest: Binding<FindFocusRequest>
        var onEscape: () -> Void
        var tracker = FindFocusTracker()
        weak var field: FindNSTextField?
        private var focusTask: Task<Void, Never>?

        init(text: Binding<String>, focusRequest: Binding<FindFocusRequest>, onEscape: @escaping () -> Void) {
            self.text = text
            self.focusRequest = focusRequest
            self.onEscape = onEscape
        }

        func controlTextDidChange(_ notification: Notification) {
            guard let field = notification.object as? NSTextField else { return }
            if text.wrappedValue != field.stringValue {
                text.wrappedValue = field.stringValue
            }
        }

        func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
                if let field = control as? NSTextField {
                    clearField(field)
                } else {
                    onEscape()
                }
                return true
            }
            return false
        }

        func clearField(_ field: NSTextField) {
            if !field.stringValue.isEmpty {
                field.stringValue = ""
            }
            text.wrappedValue = ""
            onEscape()
        }

        func startFocusClaim() {
            focusTask?.cancel()
            let targetSequence = focusRequest.wrappedValue.sequence
            // Claim immediately if the view is already mounted, then verify
            // across `FindFocus.attempts` so delayed sidebar expansion or a
            // loading web view cannot steal focus before the user types.
            _ = stepFocus(sequence: targetSequence)
            focusTask = Task { @MainActor [weak self] in
                for _ in 0..<FindFocus.attempts {
                    try? await Task.sleep(for: FindFocus.interval)
                    guard !Task.isCancelled, let self else { return }
                    if self.stepFocus(sequence: targetSequence) {
                        return
                    }
                }
            }
        }

        func cancelFocusClaim() {
            focusTask?.cancel()
            focusTask = nil
        }

        /// Executes one focus-state step. Returns `true` when done.
        @discardableResult
        func stepFocus(sequence: Int) -> Bool {
            guard let field else { return true }
            let step = tracker.nextStep(
                hasWindow: field.window != nil,
                isHidden: field.isHiddenOrHasHiddenAncestor,
                hasEditorFocus: FindFocusOwnership.ownsEditor(field)
            )
            switch step {
            case .wait:
                return false
            case .claim:
                _ = field.window?.makeFirstResponder(field)
                return false
            case .confirm:
                return false
            case .done:
                if focusRequest.wrappedValue.sequence == sequence, focusRequest.wrappedValue.pending {
                    DispatchQueue.main.async { [weak self] in
                        guard let self else { return }
                        if self.focusRequest.wrappedValue.sequence == sequence {
                            self.focusRequest.wrappedValue.clear()
                        }
                    }
                }
                return true
            }
        }
    }
}

final class FindNSTextField: NSTextField {
    var onEscape: (() -> Void)?

    override func cancelOperation(_ sender: Any?) {
        onEscape?()
    }
}
#endif
