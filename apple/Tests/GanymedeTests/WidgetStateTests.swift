import DeviceBridge
import XCTest

final class WidgetStateTests: XCTestCase {
    /// What `UserDefaultsWidgetStore` writes, as the widget reads it.
    private func published(_ json: String) throws -> [PublishedWidget] {
        try JSONDecoder().decode([PublishedWidget].self, from: Data(json.utf8))
    }

    private let two = """
    [{"notebook": "/n/Weather.ipynb", "kind": "today", "updated": 10,
      "content": {"title": "Today", "rows": [{"label": "High", "value": 21, "unit": "°C"}], "sparkline": [1, 2]}},
     {"notebook": "/n/Weather.ipynb", "kind": "week", "updated": 20,
      "content": {"rows": [], "sparkline": []}}]
    """

    func testAnIDNamesItsNotebookAndKind() throws {
        let id = WidgetState.id(notebook: "/n/a\nb.ipynb", kind: "today")
        let parsed = try XCTUnwrap(WidgetState.parse(id))
        XCTAssertEqual(parsed.notebook, "/n/a\nb.ipynb")
        XCTAssertEqual(parsed.kind, "today")
        XCTAssertNil(WidgetState.parse("no newline"))
    }

    func testOffShowsNothing() throws {
        let widgets = try published(two)
        let id = WidgetState.id(notebook: "/n/Weather.ipynb", kind: "today")
        XCTAssertEqual(WidgetState.resolve(enabled: false, published: widgets, selection: id), .off)
    }

    func testShowsTheConfiguredWidget() throws {
        let widgets = try published(two)
        let id = WidgetState.id(notebook: "/n/Weather.ipynb", kind: "today")
        guard case let .shown(widget) = WidgetState.resolve(enabled: true, published: widgets, selection: id) else {
            return XCTFail("not shown")
        }
        XCTAssertEqual(widget.content.title, "Today")
        XCTAssertEqual(widget.content.rows.first?.value, 21)
    }

    func testUnsetAndMissing() throws {
        let widgets = try published(two)
        XCTAssertEqual(WidgetState.resolve(enabled: true, published: widgets, selection: nil), .unset)
        let gone = WidgetState.id(notebook: "/n/Weather.ipynb", kind: "month")
        XCTAssertEqual(
            WidgetState.resolve(enabled: true, published: widgets, selection: gone),
            .missing(notebook: "/n/Weather.ipynb", kind: "month")
        )
    }

    func testPublishedIsNewestFirst() throws {
        let suite = "WidgetStateTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set(Data(two.utf8), forKey: "ganymede.device.widgets")
        XCTAssertEqual(WidgetState.published(in: defaults).map(\.kind), ["week", "today"])
        XCTAssertEqual(WidgetState.published(in: nil), [])
    }

    func testName() {
        XCTAssertEqual(WidgetState.name("/n/Weather.ipynb"), "Weather")
        XCTAssertEqual(WidgetState.name("/n/notes.txt"), "notes.txt")
    }
}
