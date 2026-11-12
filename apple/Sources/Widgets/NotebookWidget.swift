import AppIntents
import DeviceBridge
import SwiftUI
import WidgetKit

// The notebook widget (#436, a spike, off until Settings › Device turns it
// on): shows what a notebook published with `device.widget.update`. A
// widget can't run a notebook; it shows the content the last run left in
// the App Group.

@main
struct GanymedeWidgets: WidgetBundle {
    var body: some Widget {
        NotebookWidget()
    }
}

struct NotebookWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: AppGroup.widgetKind, intent: SelectPublishedWidget.self, provider: Provider()) { entry in
            NotebookWidgetView(state: entry.state)
        }
        .configurationDisplayName("Notebook")
        .description("Shows what a notebook published with device.widget.update.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// One notebook and kind someone could pick.
struct PublishedEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Published Widget"
    static let defaultQuery = PublishedQuery()

    let id: String
    let notebook: String
    let kind: String

    init(_ widget: PublishedWidget) {
        id = WidgetState.id(notebook: widget.notebook, kind: widget.kind)
        notebook = widget.notebook
        kind = widget.kind
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(WidgetState.name(notebook)): \(kind)", subtitle: "\(notebook)")
    }
}

struct PublishedQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [PublishedEntity] {
        WidgetState.published(in: AppGroup.defaults()).map(PublishedEntity.init).filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [PublishedEntity] {
        WidgetState.published(in: AppGroup.defaults()).map(PublishedEntity.init)
    }
}

struct SelectPublishedWidget: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Notebook"
    static let description = IntentDescription("Pick what a notebook published with device.widget.update.")

    @Parameter(title: "Widget")
    var widget: PublishedEntity?
}

struct Entry: TimelineEntry {
    let date: Date
    let state: WidgetState
}

struct Provider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: .now, state: .unset)
    }

    func snapshot(for configuration: SelectPublishedWidget, in context: Context) async -> Entry {
        entry(configuration)
    }

    /// The app reloads this kind when a notebook publishes, so the
    /// timeline itself never asks to be refreshed.
    func timeline(for configuration: SelectPublishedWidget, in context: Context) async -> Timeline<Entry> {
        Timeline(entries: [entry(configuration)], policy: .never)
    }

    private func entry(_ configuration: SelectPublishedWidget) -> Entry {
        let defaults = AppGroup.defaults()
        let state = WidgetState.resolve(
            enabled: defaults?.bool(forKey: AppGroup.widgetsKey) ?? false,
            published: WidgetState.published(in: defaults),
            selection: configuration.widget?.id
        )
        return Entry(date: .now, state: state)
    }
}

struct NotebookWidgetView: View {
    let state: WidgetState

    var body: some View {
        Group {
            switch state {
            case .off:
                message("Turn on Notebook Widgets in Ganymede's Settings › Device.")
            case .unset:
                message("Edit this widget to pick what a notebook published.")
            case let .missing(notebook, kind):
                message("\(WidgetState.name(notebook)) hasn't published “\(kind)”.")
            case let .shown(widget):
                PublishedView(widget: widget)
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct PublishedView: View {
    let widget: PublishedWidget

    var body: some View {
        let content = widget.content
        VStack(alignment: .leading, spacing: 4) {
            Text(content.title ?? WidgetState.name(widget.notebook))
                .font(.headline)
                .foregroundStyle(tint)
                .lineLimit(1)
            ForEach(Array(content.rows.enumerated()), id: \.offset) { _, row in
                RowView(row: row)
            }
            Spacer(minLength: 0)
            if content.sparkline.count > 1 {
                Sparkline(values: content.sparkline)
                    .stroke(tint, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .frame(maxHeight: 28)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var tint: Color {
        switch widget.content.tint {
        case "red": .red
        case "orange": .orange
        case "yellow": .yellow
        case "green": .green
        case "mint": .mint
        case "teal": .teal
        case "cyan": .cyan
        case "blue": .blue
        case "indigo": .indigo
        case "purple": .purple
        case "pink": .pink
        case "brown": .brown
        case "gray": .gray
        default: .primary
        }
    }
}

struct RowView: View {
    let row: WidgetContent.Row

    var body: some View {
        if let value = row.value {
            HStack(alignment: .firstTextBaseline) {
                if let label = row.label {
                    Text(label).foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                Text(value.formatted(.number.precision(.fractionLength(0...2))) + (row.unit.map { " \($0)" } ?? ""))
                    .monospacedDigit()
            }
            .font(.caption)
            .lineLimit(1)
        } else {
            Text(row.text ?? "")
                .font(.caption)
                .lineLimit(2)
        }
    }
}

/// The values as a line, lowest at the bottom.
struct Sparkline: Shape {
    let values: [Double]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard values.count > 1, let low = values.min(), let high = values.max() else { return path }
        let span = high > low ? high - low : 1
        for (index, value) in values.enumerated() {
            let point = CGPoint(
                x: rect.minX + rect.width * CGFloat(index) / CGFloat(values.count - 1),
                y: rect.maxY - rect.height * CGFloat((value - low) / span)
            )
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        return path
    }
}
