import XCTest

@MainActor
final class OpenTerminalsTests: XCTestCase {
    private func entry(_ id: UUID, _ title: String) -> OpenTerminals.Entry {
        .init(id: id, title: title, inPanel: true, reveal: {}, close: {})
    }

    func testKeepsTheOrderTheyOpenedIn() {
        let terminals = OpenTerminals()
        let first = UUID(), second = UUID()
        terminals.update(entry(first, "zsh"))
        terminals.update(entry(second, "ssh"))
        // A new title replaces the entry where it is.
        terminals.update(entry(first, "vim"))
        XCTAssertEqual(terminals.entries.map(\.title), ["vim", "ssh"])
        terminals.remove(first)
        XCTAssertEqual(terminals.entries.map(\.id), [second])
    }
}
