import XCTest
#if os(macOS)
import AppKit
import SwiftUI
#endif

/// Focus request, state machine, and AppKit editor-ownership tests for ⌘⇧F
/// (`FindFocus`, `FindField`, #890).
final class FindFocusTests: XCTestCase {
    func testRequestTriggerIncrementsSequenceAndClearLeavesSequenceIntact() {
        var request = FindFocusRequest()
        XCTAssertFalse(request.pending)
        XCTAssertEqual(request.sequence, 0)

        request.trigger()
        XCTAssertTrue(request.pending)
        XCTAssertEqual(request.sequence, 1)

        request.clear()
        XCTAssertFalse(request.pending)
        XCTAssertEqual(request.sequence, 1)

        request.trigger()
        XCTAssertTrue(request.pending)
        XCTAssertEqual(request.sequence, 2)
    }

    func testTrackerClaimsWaitsAndConfirmsAcrossRestoredAndCollapsedLaunches() {
        var tracker = FindFocusTracker()
        var request = FindFocusRequest()
        XCTAssertFalse(tracker.beginIfNeeded(request))

        // ⌘⇧F pressed while sidebar column is still hidden / unmounted.
        request.trigger()
        XCTAssertTrue(tracker.beginIfNeeded(request))
        // Repeated SwiftUI updates for the same sequence do not restart.
        XCTAssertFalse(tracker.beginIfNeeded(request))

        XCTAssertEqual(tracker.nextStep(hasWindow: false, isHidden: false, hasEditorFocus: false), .wait)
        XCTAssertEqual(tracker.nextStep(hasWindow: true, isHidden: true, hasEditorFocus: false), .wait)

        // Column is visible, notebook currently holds focus -> claim, then confirm.
        XCTAssertEqual(tracker.nextStep(hasWindow: true, isHidden: false, hasEditorFocus: false), .claim)
        XCTAssertEqual(tracker.nextStep(hasWindow: true, isHidden: false, hasEditorFocus: true), .confirm)
        XCTAssertEqual(tracker.nextStep(hasWindow: true, isHidden: false, hasEditorFocus: true), .done)
    }

    func testTrackerReclaimsIfWebViewStealsFocusDuringConfirmationTick() {
        var tracker = FindFocusTracker()
        var request = FindFocusRequest()
        request.trigger()
        XCTAssertTrue(tracker.beginIfNeeded(request))

        XCTAssertEqual(tracker.nextStep(hasWindow: true, isHidden: false, hasEditorFocus: false), .claim)
        XCTAssertEqual(tracker.nextStep(hasWindow: true, isHidden: false, hasEditorFocus: true), .confirm)
        // Focus was reclaimed before the confirmation tick settled.
        XCTAssertEqual(tracker.nextStep(hasWindow: true, isHidden: false, hasEditorFocus: false), .claim)
        XCTAssertEqual(tracker.nextStep(hasWindow: true, isHidden: false, hasEditorFocus: true), .confirm)
        XCTAssertEqual(tracker.nextStep(hasWindow: true, isHidden: false, hasEditorFocus: true), .done)
    }

    func testTabSwitchAfterClearedRequestDoesNotReTriggerFocus() {
        var tracker = FindFocusTracker()
        var request = FindFocusRequest()
        request.trigger()
        XCTAssertTrue(tracker.beginIfNeeded(request))
        request.clear()

        var remountedTracker = FindFocusTracker()
        XCTAssertFalse(remountedTracker.beginIfNeeded(request))
    }

    #if os(macOS)
    @MainActor
    func testFindFocusOwnershipDistinguishesOwnEditorFromOtherWindowTextFields() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 200),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        let content = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 200))
        let findField = FindNSTextField(frame: NSRect(x: 10, y: 150, width: 200, height: 24))
        let otherField = NSTextField(frame: NSRect(x: 10, y: 100, width: 200, height: 24))
        content.addSubview(findField)
        content.addSubview(otherField)
        window.contentView = content

        // Another NSTextField's editor satisfies `firstResponder is NSText`,
        // yet `FindFocusOwnership` correctly reports false for `findField`.
        XCTAssertTrue(window.makeFirstResponder(otherField))
        XCTAssertTrue(window.firstResponder is NSText)
        XCTAssertFalse(FindFocusOwnership.ownsEditor(findField))

        var request = FindFocusRequest()
        request.trigger()
        var query = ""
        let coordinator = FindField.Coordinator(
            text: Binding(get: { query }, set: { query = $0 }),
            focusRequest: Binding(get: { request }, set: { request = $0 }),
            onEscape: { query = "" }
        )
        coordinator.field = findField
        XCTAssertTrue(coordinator.tracker.beginIfNeeded(request))

        XCTAssertFalse(coordinator.stepFocus(sequence: request.sequence))
        XCTAssertTrue(FindFocusOwnership.ownsEditor(findField))
        XCTAssertTrue(window.firstResponder === findField.currentEditor())

        XCTAssertFalse(coordinator.stepFocus(sequence: request.sequence))
        XCTAssertTrue(coordinator.stepFocus(sequence: request.sequence))
    }

    @MainActor
    func testEscapeClearsFindFieldTextAndBinding() {
        let field = FindNSTextField(frame: NSRect(x: 0, y: 0, width: 200, height: 24))
        field.stringValue = "volcano"
        var query = "volcano"
        var escaped = false
        var request = FindFocusRequest()
        let coordinator = FindField.Coordinator(
            text: Binding(get: { query }, set: { query = $0 }),
            focusRequest: Binding(get: { request }, set: { request = $0 }),
            onEscape: { escaped = true }
        )
        field.delegate = coordinator

        let handled = coordinator.control(
            field,
            textView: NSTextView(),
            doCommandBy: #selector(NSResponder.cancelOperation(_:))
        )
        XCTAssertTrue(handled)
        XCTAssertEqual(field.stringValue, "")
        XCTAssertEqual(query, "")
        XCTAssertTrue(escaped)
    }
    #endif
}
