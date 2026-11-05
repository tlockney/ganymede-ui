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

    func testSummarisesWhatRuns() {
        XCTAssertEqual(OpenTerminals.summary(kernels: 0, terminals: 0), "Nothing running")
        XCTAssertEqual(OpenTerminals.summary(kernels: 1, terminals: 0), "1 kernel")
        XCTAssertEqual(OpenTerminals.summary(kernels: 0, terminals: 2), "2 terminals")
        XCTAssertEqual(OpenTerminals.summary(kernels: 2, terminals: 1), "2 kernels, 1 terminal")
    }
}
