import XCTest

// The Quick Look extensions are Mac-only.
#if os(macOS)
import AppKit

/// What the Finder's notebook thumbnail draws (#135).
final class NotebookSummaryTests: XCTestCase {
    /// A 1x1 PNG.
    private let png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="

    private func summary(_ cells: [[String: Any]]) throws -> NotebookSummary {
        let notebook: [String: Any] = ["nbformat": 4, "nbformat_minor": 5, "metadata": [:], "cells": cells]
        return try NotebookSummary(data: JSONSerialization.data(withJSONObject: notebook))
    }

    func testReadsMarkdownAsHeadingsAndParagraphs() throws {
        let result = try summary([
            ["cell_type": "markdown", "source": ["# Galilean moons\n", "\n", "Four moons,\n", "found in 1610.\n", "## Io"]],
        ])
        XCTAssertEqual(result.blocks, [
            .heading("Galilean moons", level: 1),
            .text("Four moons, found in 1610."),
            .heading("Io", level: 2),
        ])
    }

    func testTakesCodeAndTheFirstOutputOfEachCell() throws {
        let result = try summary([
            [
                "cell_type": "code", "source": "\nprint('Io')\n\n", "execution_count": 1, "metadata": [:],
                "outputs": [
                    ["output_type": "stream", "name": "stdout", "text": ["Io\n"]],
                    ["output_type": "stream", "name": "stdout", "text": ["not shown\n"]],
                ],
            ],
            [
                "cell_type": "code", "source": "1 / 0", "execution_count": 2, "metadata": [:],
                "outputs": [["output_type": "error", "ename": "ZeroDivisionError", "evalue": "division by zero", "traceback": []]],
            ],
            ["cell_type": "raw", "source": "skipped"],
        ])
        XCTAssertEqual(result.blocks, [
            .code(["print('Io')"]), .output(["Io"]),
            .code(["1 / 0"]), .output(["ZeroDivisionError: division by zero"]),
        ])
    }

    func testPrefersAnImageToText() throws {
        let result = try summary([
            [
                "cell_type": "code", "source": "plot()", "execution_count": 1, "metadata": [:],
                "outputs": [[
                    "output_type": "display_data", "metadata": [:],
                    "data": ["text/plain": "<Figure>", "image/png": [String(png.prefix(40)), String(png.dropFirst(40)) + "\n"]],
                ]],
            ],
        ])
        XCTAssertEqual(result.blocks, [.code(["plot()"]), .image(Data(base64Encoded: png)!)])
    }

    func testStopsAfterAPage() throws {
        let long = (1...40).map { "line \($0)\n" }
        let cells = (1...30).map { _ in ["cell_type": "code", "source": long, "metadata": [:], "outputs": []] as [String: Any] }
        let result = try summary(cells)
        XCTAssertEqual(result.blocks.count, NotebookSummary.maxBlocks)
        guard case .code(let lines) = result.blocks[0] else { return XCTFail("\(result.blocks[0])") }
        XCTAssertEqual(lines.count, NotebookSummary.maxCodeLines)
    }

    func testRefusesWhatIsNotANotebook() {
        XCTAssertThrowsError(try NotebookSummary(data: Data("{".utf8)))
        XCTAssertThrowsError(try NotebookSummary(data: Data(#"{"nbformat": 3, "worksheets": []}"#.utf8)))
    }

    func testPageKeepsItsShape() {
        XCTAssertEqual(ThumbnailPage.size(fitting: CGSize(width: 512, height: 512)), CGSize(width: 384, height: 512))
        XCTAssertEqual(ThumbnailPage.size(fitting: CGSize(width: 120, height: 400)), CGSize(width: 120, height: 160))
    }

    func testDrawsAPage() throws {
        let page = ThumbnailPage(summary: try summary([
            ["cell_type": "markdown", "source": "# Moons"],
            ["cell_type": "code", "source": "moons = 4", "metadata": [:], "outputs": []],
        ]))
        let size = ThumbnailPage.size(fitting: CGSize(width: 256, height: 256))
        let bitmap = try XCTUnwrap(NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height),
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0))
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        page.draw(in: size)
        NSGraphicsContext.restoreGraphicsState()
        // White paper, with something dark on it.
        XCTAssertEqual(bitmap.colorAt(x: 1, y: 1)?.brightnessComponent ?? 0, 1, accuracy: 0.01)
        let dark = (0..<Int(size.height)).contains { y in
            (0..<Int(size.width)).contains { x in (bitmap.colorAt(x: x, y: y)?.brightnessComponent ?? 1) < 0.3 }
        }
        XCTAssertTrue(dark, "nothing drawn")
    }
}
#endif
