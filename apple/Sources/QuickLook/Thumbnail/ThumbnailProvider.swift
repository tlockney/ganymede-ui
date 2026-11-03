import AppKit
import QuickLookThumbnailing

/// The Finder's thumbnail of a notebook (#135): its first cells drawn as a
/// page, from `NotebookSummary`. Drawn natively, since a thumbnail has to
/// be quick and the preview's web view is not.
final class ThumbnailProvider: QLThumbnailProvider {
    /// Larger files get the Finder's generic icon.
    static let maxBytes = 32 * 1024 * 1024

    override func provideThumbnail(
        for request: QLFileThumbnailRequest, _ handler: @escaping (QLThumbnailReply?, Error?) -> Void
    ) {
        do {
            let size = try request.fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= Self.maxBytes else { throw CocoaError(.fileReadTooLarge) }
            let summary = try NotebookSummary(data: Data(contentsOf: request.fileURL))
            let page = ThumbnailPage.size(fitting: request.maximumSize)
            let reply = QLThumbnailReply(contextSize: page) {
                ThumbnailPage(summary: summary).draw(in: page)
                return true
            }
            handler(reply, nil)
        } catch {
            handler(nil, error)
        }
    }
}

/// A notebook's first page, laid out at a fixed size and scaled to the
/// thumbnail. Light, as document thumbnails are in the Finder.
struct ThumbnailPage {
    static let width: CGFloat = 480
    static let height: CGFloat = 640
    private static let margin: CGFloat = 28
    private static let gap: CGFloat = 10

    let summary: NotebookSummary

    /// The largest page, 3:4 like a sheet of paper, that fits `maximum`.
    static func size(fitting maximum: CGSize) -> CGSize {
        let scale = min(maximum.width / width, maximum.height / height)
        return CGSize(width: (width * scale).rounded(.down), height: (height * scale).rounded(.down))
    }

    func draw(in size: CGSize) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        context.saveGState()
        defer { context.restoreGState() }
        // Top-down coordinates at the page's own size.
        context.translateBy(x: 0, y: size.height)
        context.scaleBy(x: size.width / Self.width, y: -size.height / Self.height)
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)

        NSColor.white.setFill()
        CGRect(x: 0, y: 0, width: Self.width, height: Self.height).fill()

        let column = Self.width - 2 * Self.margin
        var y = Self.margin
        for block in summary.blocks {
            guard y < Self.height else { break }
            y += draw(block, at: CGPoint(x: Self.margin, y: y), width: column) + Self.gap
        }
    }

    /// Draws one block and returns its height.
    private func draw(_ block: NotebookSummary.Block, at origin: CGPoint, width: CGFloat) -> CGFloat {
        switch block {
        case .heading(let text, let level):
            let size: CGFloat = level == 1 ? 26 : level == 2 ? 20 : 16
            return drawText(text, font: .boldSystemFont(ofSize: size), color: .black, at: origin, width: width)
        case .text(let text):
            return drawText(text, font: .systemFont(ofSize: 13), color: .darkGray, at: origin, width: width)
        case .code(let lines):
            let inset: CGFloat = 8
            let font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
            let text = attributed(lines.joined(separator: "\n"), font: font, color: .black)
            let bounds = text.boundingRect(
                with: CGSize(width: width - 2 * inset, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin])
            let box = CGRect(x: origin.x, y: origin.y, width: width, height: ceil(bounds.height) + 2 * inset)
            NSColor(white: 0.96, alpha: 1).setFill()
            NSBezierPath(roundedRect: box, xRadius: 6, yRadius: 6).fill()
            text.draw(with: box.insetBy(dx: inset, dy: inset), options: [.usesLineFragmentOrigin])
            return box.height
        case .output(let lines):
            let font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
            return drawText(lines.joined(separator: "\n"), font: font, color: .darkGray, at: origin, width: width)
        case .image(let data):
            guard let image = NSImage(data: data), image.size.width > 0, image.size.height > 0 else { return 0 }
            let scale = min(1, width / image.size.width)
            let rect = CGRect(
                x: origin.x, y: origin.y, width: image.size.width * scale, height: image.size.height * scale)
            image.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
            return rect.height
        }
    }

    private func attributed(_ text: String, font: NSFont, color: NSColor) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color])
    }

    private func drawText(_ text: String, font: NSFont, color: NSColor, at origin: CGPoint, width: CGFloat) -> CGFloat {
        let string = attributed(text, font: font, color: color)
        let bounds = string.boundingRect(
            with: CGSize(width: width, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin])
        let rect = CGRect(x: origin.x, y: origin.y, width: width, height: ceil(bounds.height))
        string.draw(with: rect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
        return rect.height
    }
}
