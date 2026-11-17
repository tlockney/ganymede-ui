#if os(macOS)
import AppKit
import XCTest

/// The Mac editor's line-number ruler (#661): it must not paint outside
/// its own bounds, where the text view is.
@MainActor
final class LineNumberRulerTests: XCTestCase {
    private func ruler() -> LineNumberRuler {
        // TextKit 1, as the editor makes it (CodeTextView.swift).
        let textView = NSTextView(usingTextLayoutManager: false)
        textView.string = (1...30).map { "line \($0)" }.joined(separator: "\n")
        let scrollView = NSScrollView(frame: NSRect(x: 0, y: 0, width: 300, height: 100))
        scrollView.documentView = textView
        let ruler = LineNumberRuler(textView: textView, scrollView: scrollView)
        ruler.lineCount = 30
        ruler.frame = NSRect(x: 0, y: 0, width: ruler.ruleThickness, height: 100)
        return ruler
    }

    func testClipsToItsBounds() {
        XCTAssertTrue(ruler().clipsToBounds)
    }

    func testADirtyRectBeyondItsBoundsLeavesTheRestUnpainted() throws {
        let ruler = ruler()
        let width = 300, height = 100
        let bitmap = try XCTUnwrap(NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
            samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
            bytesPerRow: 0, bitsPerPixel: 0))
        let context = try XCTUnwrap(NSGraphicsContext(bitmapImageRep: bitmap))
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        // A dirty rect as wide as the editor, as AppKit can pass to a view
        // that doesn't clip to its bounds.
        ruler.draw(NSRect(x: 0, y: 0, width: width, height: height))
        context.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()

        let inside = try XCTUnwrap(bitmap.colorAt(x: 2, y: 50))
        XCTAssertGreaterThan(inside.alphaComponent, 0, "the ruler fills its own background")
        let outside = try XCTUnwrap(bitmap.colorAt(x: width - 10, y: 50))
        XCTAssertEqual(outside.alphaComponent, 0, "the ruler painted over the text view")
    }
}
#endif
