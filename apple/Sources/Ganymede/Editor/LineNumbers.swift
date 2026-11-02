import Foundation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Line numbers beside the editor's text (#122): a ruler on the Mac, a
/// gutter inside the text view on iOS. Both number logical lines, not
/// wrapped ones, at the first fragment of each line.
@MainActor
enum LineNumbers {
    /// The visible lines' numbers and the rect of each one's first line
    /// fragment, in text container coordinates.
    static func visible(
        layoutManager: NSLayoutManager, container: NSTextContainer, text: NSString, in rect: CGRect
    ) -> [(number: Int, rect: CGRect)] {
        var lines: [(number: Int, rect: CGRect)] = []
        if text.length > 0 {
            let glyphs = layoutManager.glyphRange(forBoundingRect: rect, in: container)
            let characters = layoutManager.characterRange(forGlyphRange: glyphs, actualGlyphRange: nil)
            var start = CodeEditing.lineStart(characters.location, in: text)
            var number = CodeEditing.lineNumber(at: start, in: text)
            let end = NSMaxRange(characters)
            while start < text.length, start <= end {
                let glyph = layoutManager.glyphIndexForCharacter(at: start)
                lines.append((number, layoutManager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)))
                start = NSMaxRange(text.lineRange(for: NSRange(location: start, length: 0)))
                number += 1
            }
        }
        // The empty line after a final newline, or in an empty file.
        let extra = layoutManager.extraLineFragmentRect
        if extra.height > 0, extra.maxY >= rect.minY, extra.minY <= rect.maxY {
            lines.append((CodeEditing.lineCount(text), extra))
        }
        return lines
    }

    static var font: PlatformFont {
        .monospacedDigitSystemFont(ofSize: Highlighting.font.pointSize - 2, weight: .regular)
    }

    static var color: PlatformColor {
        #if os(macOS)
        .tertiaryLabelColor
        #else
        .tertiaryLabel
        #endif
    }

    /// Wide enough for the largest number, and at least two digits.
    static func width(for lineCount: Int) -> CGFloat {
        let digits = max(2, String(lineCount).count)
        let digit = ("8" as NSString).size(withAttributes: [.font: font]).width
        return ceil(CGFloat(digits) * digit) + 16
    }

    /// Draws `number` right-aligned in a column `width` wide, centered on a
    /// line `height` tall whose top is `y`.
    static func draw(_ number: Int, width: CGFloat, y: CGFloat, height: CGFloat) {
        let label = NSAttributedString(string: String(number), attributes: [.font: font, .foregroundColor: color])
        let size = label.size()
        label.draw(at: CGPoint(x: width - size.width - 8, y: y + (height - size.height) / 2))
    }
}

#if os(macOS)
/// The Mac's line numbers: the scroll view's vertical ruler.
final class LineNumberRuler: NSRulerView {
    var lineCount = 1 {
        didSet {
            let thickness = LineNumbers.width(for: lineCount)
            if ruleThickness != thickness { ruleThickness = thickness }
            needsDisplay = true
        }
    }

    init(textView: NSTextView, scrollView: NSScrollView) {
        super.init(scrollView: scrollView, orientation: .verticalRuler)
        clientView = textView
        ruleThickness = LineNumbers.width(for: lineCount)
        scrollView.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            self, selector: #selector(redraw), name: NSView.boundsDidChangeNotification, object: scrollView.contentView)
    }

    @available(*, unavailable)
    required init(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    @objc private func redraw() {
        needsDisplay = true
    }

    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.textBackgroundColor.setFill()
        dirtyRect.fill()
        drawHashMarksAndLabels(in: dirtyRect)
    }

    override func drawHashMarksAndLabels(in rect: NSRect) {
        guard let textView = clientView as? NSTextView, let layoutManager = textView.layoutManager,
              let container = textView.textContainer
        else { return }
        let origin = textView.textContainerOrigin
        let visible = textView.visibleRect.offsetBy(dx: -origin.x, dy: -origin.y)
        // Where the text view's top left is in the ruler.
        let offset = convert(NSPoint.zero, from: textView)
        for line in LineNumbers.visible(
            layoutManager: layoutManager, container: container, text: textView.string as NSString, in: visible)
        {
            LineNumbers.draw(
                line.number, width: ruleThickness, y: offset.y + origin.y + line.rect.minY, height: line.rect.height)
        }
    }
}
#else
/// The iOS text view, with its line numbers in a gutter on the left.
final class CodeUITextView: UITextView {
    private let gutter = LineNumberGutter()

    var lineCount = 1 {
        didSet { if lineCount != oldValue { setNeedsLayout() } }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if gutter.superview == nil {
            gutter.textView = self
            addSubview(gutter)
        }
        let width = LineNumbers.width(for: lineCount)
        if textContainerInset.left != width {
            textContainerInset.left = width
        }
        // It scrolls with the text view's bounds, so it stays in view.
        gutter.frame = CGRect(x: bounds.minX, y: bounds.minY, width: width, height: bounds.height)
        gutter.setNeedsDisplay()
    }
}

private final class LineNumberGutter: UIView {
    weak var textView: CodeUITextView?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        backgroundColor = .clear
        isUserInteractionEnabled = false
        contentMode = .redraw
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func draw(_ rect: CGRect) {
        guard let textView else { return }
        let inset = textView.textContainerInset
        let visible = CGRect(
            x: 0, y: textView.bounds.minY - inset.top,
            width: textView.textContainer.size.width, height: textView.bounds.height)
        for line in LineNumbers.visible(
            layoutManager: textView.layoutManager, container: textView.textContainer,
            text: (textView.text ?? "") as NSString, in: visible)
        {
            LineNumbers.draw(
                line.number, width: bounds.width, y: line.rect.minY + inset.top - textView.bounds.minY,
                height: line.rect.height)
        }
    }
}
#endif
