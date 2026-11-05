#if os(macOS)
import AppKit
import SwiftUI

/// The Mac window's sidebar (#246): a strip of navigator tabs, each using
/// the sidebar's full height, as Xcode's navigators do.
enum NavigatorTab: String, CaseIterable, Identifiable {
    case files, search, running, outline, recents

    var id: String { rawValue }

    var title: String {
        switch self {
        case .files: "Files"
        case .search: "Search"
        case .running: "Running"
        case .outline: "Outline"
        case .recents: "Recents"
        }
    }

    var symbol: String {
        switch self {
        case .files: "folder"
        case .search: "magnifyingglass"
        case .running: "bolt"
        case .outline: "list.bullet.indent"
        case .recents: "clock"
        }
    }

    /// ⌘1 to ⌘5, as Xcode's navigators.
    var shortcut: KeyEquivalent {
        KeyEquivalent(Character(String((Self.allCases.firstIndex(of: self) ?? 0) + 1)))
    }
}

struct NavigatorSidebar: View {
    let folder: URL
    @ObservedObject var page: PageModel
    let openFile: (String) -> Void
    /// The selected tab, kept per window.
    @SceneStorage("navigator.tab") private var tab: NavigatorTab = .files
    @ObservedObject private var terminals = OpenTerminals.shared

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 2) {
                ForEach(NavigatorTab.allCases) { item in
                    Button {
                        tab = item
                    } label: {
                        Image(systemName: item.symbol)
                            .symbolVariant(tab == item ? .fill : .none)
                            .frame(width: 28, height: 22)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(tab == item ? Color.accentColor : Color.secondary)
                    .help("\(item.title) (⌘\(String(item.shortcut.character)))")
                    .accessibilityLabel(item.title)
                    .accessibilityAddTraits(tab == item ? .isSelected : [])
                    .keyboardShortcut(item.shortcut, modifiers: .command)
                    // How many kernels and terminals run, on the Running tab.
                    .overlay(alignment: .topTrailing) {
                        if item == .running, running > 0 {
                            Text("\(running)")
                                .font(.system(size: 9, weight: .semibold))
                                .padding(.horizontal, 3)
                                .background(Capsule().fill(Color.accentColor))
                                .foregroundStyle(.white)
                                .offset(x: 2, y: -2)
                                .accessibilityHidden(true)
                        }
                    }
                }
            }
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            Divider()
            switch tab {
            case .files:
                FolderSidebar(folder: folder, page: page, openFile: openFile)
            case .search:
                SearchNavigator(folder: folder, page: page, openFile: openFile)
            case .running:
                RunningList(page: page)
            case .outline:
                OutlineNavigator(page: page)
            case .recents:
                RecentsNavigator(page: page)
            }
            Divider()
            ServerLine(page: page)
        }
    }

    private var running: Int { page.state.sessions.count + terminals.entries.count }
}

// MARK: - Search

/// Names under the window's folder, and with the box ticked, the text of
/// its notebooks (#246). Searching starts a moment after typing stops.
private struct SearchNavigator: View {
    let folder: URL
    @ObservedObject var page: PageModel
    let openFile: (String) -> Void
    @Environment(\.openWindow) private var openWindow
    @SceneStorage("navigator.query") private var query = ""
    @SceneStorage("navigator.contents") private var contents = false
    @State private var results = FileSearch.Results()
    @State private var searching = false
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            field
            list
        }
        .task(id: "\(folder.path)|\(query)|\(contents)") { await search() }
    }

    private var field: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("Search", text: $query)
                .textFieldStyle(.roundedBorder)
                .focused($fieldFocused)
                .onExitCommand { query = "" }
            Toggle("Search notebook contents", isOn: $contents)
                .toggleStyle(.checkbox)
                .font(.callout)
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .onAppear { fieldFocused = true }
    }

    private var list: some View {
        List {
            if !results.names.isEmpty {
                Section("Names") {
                    ForEach(results.names) { match in row(match) }
                }
            }
            if !results.contents.isEmpty {
                Section("Contents") {
                    ForEach(results.contents) { match in row(match) }
                }
            }
        }
        .listStyle(.sidebar)
        .overlay { status }
    }

    @ViewBuilder
    private var status: some View {
        if FileSearch.normalized(query).isEmpty {
            EmptyView()
        } else if searching && results.names.isEmpty && results.contents.isEmpty {
            Text("Searching…").foregroundStyle(.secondary)
        } else if results.names.isEmpty && results.contents.isEmpty {
            Text(results.stoppedEarly ? "No matches in the files searched" : "No matches")
                .foregroundStyle(.secondary)
        }
    }

    private func row(_ match: FileSearch.Match) -> some View {
        Button {
            open(match.entry)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Label(match.entry.title, systemImage: symbol(match.entry))
                Text(relativeFolder(match.entry))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if let snippet = match.snippet {
                    Text(snippet)
                        .font(.system(.caption, design: .monospaced))
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Open") { open(match.entry) }
            if match.entry.isNotebook || match.entry.isDirectory {
                Button("Open in New Tab") { openWindow(value: WindowTarget(opening: match.entry.url)) }
            }
            Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([match.entry.url]) }
        }
    }

    private func symbol(_ entry: FolderEntry) -> String {
        entry.isDirectory ? "folder" : entry.isNotebook ? "book.closed" : "doc"
    }

    /// The match's folder, relative to the window's.
    private func relativeFolder(_ entry: FolderEntry) -> String {
        let parent = entry.url.deletingLastPathComponent().standardizedFileURL.path
        let base = folder.standardizedFileURL.path
        if parent == base { return folder.lastPathComponent }
        if parent.hasPrefix(base + "/") {
            return folder.lastPathComponent + "/" + parent.dropFirst(base.count + 1)
        }
        return parent
    }

    private func open(_ entry: FolderEntry) {
        if entry.isNotebook {
            page.run("open", arg: entry.serverPath)
        } else if entry.isDirectory {
            openWindow(value: WindowTarget(opening: entry.url))
        } else {
            openFile(entry.serverPath)
        }
    }

    /// Runs as the view's task for the query: a newer query cancels it,
    /// and with it the scan. Only the latest search changes `results` and
    /// `searching`, so an older one never shows its matches or clears the
    /// flag under a newer query. The previous results stay until the new
    /// ones arrive.
    private func search() async {
        guard !FileSearch.normalized(query).isEmpty else {
            results = FileSearch.Results()
            searching = false
            return
        }
        searching = true
        // Wait for typing to stop.
        try? await Task.sleep(nanoseconds: 250_000_000)
        guard !Task.isCancelled else { return }
        let (query, folder, contents) = (query, folder, contents)
        // Off the main thread; a detached task doesn't inherit
        // cancellation, so pass it on, and the scan checks its own flag.
        let scan = Task.detached(priority: .userInitiated) {
            FileSearch().run(query, in: folder, contents: contents, isCancelled: { Task.isCancelled })
        }
        let found = await withTaskCancellationHandler {
            await scan.value
        } onCancel: {
            scan.cancel()
        }
        guard !Task.isCancelled else { return }
        results = found
        searching = false
    }
}

// MARK: - Outline

/// The open notebook's Markdown headings (#212), indented by level;
/// clicking one selects its cell and scrolls it to the top.
private struct OutlineNavigator: View {
    @ObservedObject var page: PageModel

    var body: some View {
        let headings = page.state.headings
        // Indent from the outline's top level, not from `#`.
        let top = headings.map(\.level).min() ?? 1
        List {
            ForEach(Array(headings.enumerated()), id: \.offset) { _, heading in
                Button {
                    page.run("go-to-cell", arg: String(heading.cell))
                } label: {
                    Text(heading.text)
                        .fontWeight(heading.level == top ? .semibold : .regular)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .padding(.leading, CGFloat(max(0, heading.level - top)) * 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(heading.text)
            }
        }
        .listStyle(.sidebar)
        .overlay {
            if headings.isEmpty {
                Text(page.state.hasNotebook ? "No headings in this notebook" : "No notebook open")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding()
            }
        }
    }
}

// MARK: - Recents

/// File › Open Recent's notebooks: in this window, or a new one.
private struct RecentsNavigator: View {
    @ObservedObject var page: PageModel
    @ObservedObject private var recents = Recents.shared
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        List {
            ForEach(recents.urls, id: \.self) { url in
                Button {
                    page.run("open", arg: FolderEntry.serverPath(url))
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Label(url.deletingPathExtension().lastPathComponent, systemImage: "book.closed")
                        Text(url.deletingLastPathComponent().path.replacingOccurrences(of: NSHomeDirectory(), with: "~"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button("Open") { page.run("open", arg: FolderEntry.serverPath(url)) }
                    Button("Open in New Tab") { openWindow(value: WindowTarget(opening: url)) }
                    Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                }
            }
        }
        .listStyle(.sidebar)
        .overlay {
            if recents.urls.isEmpty {
                Text("Notebooks you open show here").foregroundStyle(.secondary)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !recents.urls.isEmpty {
                Button("Clear Recents") { recents.clear() }
                    .buttonStyle(.borderless)
                    .padding(8)
            }
        }
    }
}
#endif
