#if os(iOS)
import UIKit
import XCTest

/// The iOS editor's line-number gutter (#517, #524): made only once the
/// text view is in a window, and reading the text view from its superview.
@MainActor
final class LineNumberGutterTests: XCTestCase {
    private func textView() -> CodeUITextView {
        // TextKit 1, as the editor makes it (CodeTextView.swift).
        let view = CodeUITextView(usingTextLayoutManager: false)
        view.frame = CGRect(x: 0, y: 0, width: 320, height: 200)
        view.text = (1...30).map { "line \($0)" }.joined(separator: "\n")
        view.lineCount = 30
        return view
    }

    func testNoGutterOutsideAWindow() {
        let view = textView()
        view.layoutIfNeeded()
        XCTAssertNil(view.gutter)
        // The inset is set all the same, so text doesn't move once the
        // gutter appears.
        XCTAssertEqual(view.textContainerInset.left, LineNumbers.width(for: 30))
    }

    func testGutterAppearsOnceInAWindow() {
        let view = textView()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        window.addSubview(view)
        view.layoutIfNeeded()
        guard let gutter = view.gutter else { return XCTFail("no gutter in a window") }
        XCTAssertTrue(gutter.superview === view)
        XCTAssertTrue(gutter.textView === view)
        XCTAssertEqual(gutter.frame.width, LineNumbers.width(for: 30))
        XCTAssertEqual(gutter.frame.height, view.bounds.height)
    }

    func testMovingIntoAWindowAsksForALayout() {
        // Laid out off screen first, so only `didMoveToWindow` can ask
        // for the layout that makes the gutter.
        let view = textView()
        view.layoutIfNeeded()
        XCTAssertNil(view.gutter)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        window.addSubview(view)
        view.layoutIfNeeded()
        XCTAssertNotNil(view.gutter)
    }

    func testGutterFindsItsTextViewAfterBeingReAdded() {
        // UIKit can take a text view's subviews down (#517); the next
        // layout puts the same gutter back.
        let view = textView()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        window.addSubview(view)
        view.layoutIfNeeded()
        guard let gutter = view.gutter else { return XCTFail("no gutter in a window") }
        gutter.removeFromSuperview()
        XCTAssertNil(gutter.textView)
        view.setNeedsLayout()
        view.layoutIfNeeded()
        XCTAssertTrue(view.gutter === gutter)
        XCTAssertTrue(gutter.superview === view)
        XCTAssertTrue(gutter.textView === view)
        XCTAssertEqual(view.subviews.filter { $0 is LineNumberGutter }.count, 1)
    }

    func testGutterIsReusedWhenTheViewMovesBetweenWindows() {
        let view = textView()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        window.addSubview(view)
        view.layoutIfNeeded()
        let first = view.gutter
        XCTAssertNotNil(first)

        view.removeFromSuperview()
        view.layoutIfNeeded()
        XCTAssertTrue(view.gutter === first)

        let other = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        other.addSubview(view)
        view.layoutIfNeeded()
        XCTAssertTrue(view.gutter === first)
        XCTAssertTrue(first?.textView === view)
        XCTAssertEqual(view.subviews.filter { $0 is LineNumberGutter }.count, 1)
    }

    func testGutterWidensForMoreLines() {
        let view = textView()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        window.addSubview(view)
        view.lineCount = 12_345
        view.layoutIfNeeded()
        let width = LineNumbers.width(for: 12_345)
        XCTAssertGreaterThan(width, LineNumbers.width(for: 30))
        XCTAssertEqual(view.gutter?.frame.width, width)
        XCTAssertEqual(view.textContainerInset.left, width)
    }

    func testAGutterOutsideATextViewDrawsWithoutCrashing() {
        let gutter = LineNumberGutter(frame: CGRect(x: 0, y: 0, width: 40, height: 100))
        XCTAssertNil(gutter.textView)
        let image = UIGraphicsImageRenderer(bounds: gutter.bounds).image { _ in
            gutter.draw(gutter.bounds)
        }
        XCTAssertEqual(image.size, gutter.bounds.size)
    }
}
#endif
