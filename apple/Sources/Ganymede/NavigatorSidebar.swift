#if os(macOS)
import AppKit
import SwiftUI

/// The Mac window's sidebar (#246): a strip of navigator tabs
/// (`NavigatorTab`), each using the sidebar's full height, as Xcode's
/// navigators do.
struct NavigatorSidebar: View {
    let folder: URL
    /// Where the files are; this Mac's disk for now (#737).
    var source: any FileSource = LocalFileSource()
    /// The window's place (#740): its own is the place menu's current one,
    /// and a machine's has no Recents (this Mac's notebooks), Reveal in
    /// Finder or text editor.
    var place: Place = .thisDevice
    var page: PageModel
    /// The window's bottom panel, for terminals the foot's menu opens (a
    /// machine's window has one too, #858).
    var panel: PanelController?
    let openFile: (String) -> Void
    /// The selected tab, kept per window.
    @SceneStorage("navigator.tab") private var tab: NavigatorTab = .files
    private let terminals = OpenTerminals.shared
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(spacing: 0) {
            // This Mac and each connected machine (#701); nothing to switch
            // to without a machine.
            if model.places.count > 1 {
                PlaceMenu(
                    entries: model.places, current: place, reachability: .shared
                ) { picked in
                    if picked != place,
                       let target = WindowTarget.root(of: picked, device: model.root) {
                        openWindow(value: target)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 8)
            }
            // The app's mark and name (#873): the window's own header, above
            // its navigators, as a Mac app's sidebar has. The icon is the
            // app's, so only the name is read.
            HStack(spacing: 8) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .interpolation(.high)
                    .frame(width: 24, height: 24)
                    .accessibilityHidden(true)
                Text("Ganymede")
                    .font(.title3.weight(.bold))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            capsule
            Divider()
            switch shownTab {
            case .files:
                FolderSidebar(
                    folder: folder, source: source, place: place,
                    machineName: place.machineID.flatMap(model.machineName(_:)),
                    page: page, openFile: openFile)
            case .search:
                SearchNavigator(folder: folder, source: source, place: place, page: page, openFile: openFile)
            case .running:
                RunningList(page: page)
            case .journals:
                JournalsNavigator(place: place, page: page)
            case .outline:
                OutlineNavigator(page: page)
            case .recents:
                RecentsNavigator(page: page)
            }
            Divider()
            ProjectLine(
                folder: folder,
                // A machine's home isn't this Mac's: its paths stay as its
                // server reports them (#873).
                home: place.isThisDevice ? projectHome : nil,
                placeName: placeName,
                showsInFinder: place.isThisDevice,
                panel: panel)
        }
    }

    /// The tabs in one capsule (#873): the shown tab draws its symbol and its
    /// name on a raised fill and takes the width the others leave; the rest
    /// draw the symbol alone. No segment's width depends on the Running
    /// badge — it is an overlay — so nothing moves as kernels come and go.
    private var capsule: some View {
        HStack(spacing: 2) {
            ForEach(tabs) { item in
                Button {
                    tab = item
                } label: {
                    segment(item)
                }
                .buttonStyle(.plain)
                .foregroundStyle(shownTab == item ? Color.primary : Color.secondary)
                .help(item.help)
                .accessibilityLabel(item.title)
                // How many kernels and terminals run, said here: the badge
                // itself is hidden from VoiceOver.
                .accessibilityValue(item == .running ? NavigatorTab.runningValue(running) : "")
                .accessibilityAddTraits(shownTab == item ? .isSelected : [])
                .keyboardShortcut(item.shortcut, modifiers: .command)
                .overlay(alignment: .topTrailing) { badge(item) }
            }
        }
        // One tab group to VoiceOver (#873): each segment is a tab in it,
        // with its name and whether it is shown.
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
        .padding(3)
        .background(Capsule().fill(Color.primary.opacity(0.05)))
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5))
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .padding(.bottom, 6)
    }

    @ViewBuilder
    private func segment(_ item: NavigatorTab) -> some View {
        if shownTab == item {
            // The name gives way to the symbol alone when the capsule is too
            // narrow for both: at the sidebar's 180pt the other five tabs
            // leave it about 28pt, and a truncated word reads worse than the
            // symbol on its own. The tooltip keeps the name to hand.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 5) {
                    Image(systemName: item.symbol)
                        .symbolVariant(.fill)
                    Text(item.title)
                        .lineLimit(1)
                        .fixedSize()
                }
                Image(systemName: item.symbol)
                    .symbolVariant(.fill)
            }
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, minHeight: 22)
            .background(RoundedRectangle(cornerRadius: 5).fill(Color.primary.opacity(0.1)))
            .contentShape(Rectangle())
        } else {
            Image(systemName: item.symbol)
                .frame(width: 24, height: 22)
                .contentShape(Rectangle())
        }
    }

    /// How many kernels and terminals run, on the Running tab.
    @ViewBuilder
    private func badge(_ item: NavigatorTab) -> some View {
        if item == .running, running > 0 {
            Text("\(running)")
                .font(.system(size: 9, weight: .semibold))
                .padding(.horizontal, 3)
                .background(Capsule().fill(Color("AccentFill")))
                .foregroundStyle(Color("OnAccent"))
                .offset(x: 2, y: -2)
                .accessibilityHidden(true)
        }
    }

    /// This Mac's home folder, which the foot abbreviates to "~".
    private var projectHome: URL { FileManager.default.homeDirectoryForCurrentUser }

    /// "This Mac", or the name of the machine whose window this is (#740).
    private var placeName: String {
        place.machineID.flatMap(model.machineName(_:)) ?? Places.deviceName
    }

    /// The tabs: not Recents for a machine, whose notebooks aren't in them.
    private var tabs: [NavigatorTab] {
        NavigatorTab.tabs(for: place)
    }

    /// The selected tab, or Files when a machine's window has Recents kept.
    private var shownTab: NavigatorTab { tabs.contains(tab) ? tab : .files }

    private var running: Int { page.state.sessions.count + terminals.entries.count }
}

// MARK: - Search

/// Names under the window's folder, and with the box ticked, the text of
/// its notebooks (#246). Searching starts a moment after typing stops.
private struct SearchNavigator: View {
    let folder: URL
    let source: any FileSource
    var place: Place = .thisDevice
    var page: PageModel
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
        .task(id: "\(folder.absoluteString)|\(query)|\(contents)") { await search() }
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
        .scrollContentBackground(.hidden)
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
        .disabled(!match.entry.isDirectory && !match.entry.canOpen(in: place))
        .contextMenu {
            Button("Open") { open(match.entry) }
                .disabled(!match.entry.isDirectory && !match.entry.canOpen(in: place))
            if match.entry.isNotebook || match.entry.isDirectory {
                Button("Open in New Tab") {
                    if let target = WindowTarget(opening: match.entry) { openWindow(value: target) }
                }
            }
            if place.isThisDevice {
                Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([match.entry.url]) }
            }
        }
    }

    private func symbol(_ entry: FolderEntry) -> String {
        entry.isDirectory ? "folder" : entry.isNotebook ? "book.closed" : "doc"
    }

    /// The match's folder, relative to the window's.
    private func relativeFolder(_ entry: FolderEntry) -> String {
        FileSearch.relativeFolder(of: entry.url, in: folder)
    }

    private func open(_ entry: FolderEntry) {
        if entry.opensInPage {
            page.run("open", arg: entry.serverPath)
        } else if entry.isDirectory {
            if let target = WindowTarget(opening: entry) { openWindow(value: target) }
        } else if entry.canOpen(in: place) {
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
        let (query, folder, contents, source) = (query, folder, contents, source)
        // Off the main thread; a detached task doesn't inherit
        // cancellation, so pass it on, and the scan checks its own flag.
        let scan = Task.detached(priority: .userInitiated) {
            await FileSearch().run(query, in: folder, contents: contents, source: source)
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

// MARK: - Journals

/// The notebooks an agent is in or last wrote, in the window's place (#705,
/// #740): the server's open rooms, asked again every few seconds while the
/// tab shows.
private struct JournalsNavigator: View {
    let place: Place
    var page: PageModel
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    @State private var result: Journals.Result?

    var body: some View {
        let journals: [Journals.Journal] = if case .rooms(let rooms)? = result { Journals.journalsOf(rooms) } else { [] }
        List {
            ForEach(journals) { journal in
                Button {
                    page.run("open", arg: journal.path)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Label(journal.name, systemImage: "book.pages")
                                .lineLimit(1)
                            Text([journal.agent, Journals.status(journal)].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        if journal.running {
                            Circle().fill(Color("Ready")).frame(width: 6, height: 6)
                                .accessibilityLabel("An agent is in it")
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(journal.path)
                .contextMenu {
                    Button("Open") { page.run("open", arg: journal.path) }
                    Button("Open in New Tab") { openInNewTab(journal) }
                }
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .overlay { status(journals) }
        // Starts when the tab shows, and is cancelled when it hides or the
        // server (its address and token) changes.
        .task(id: model.serverURL) { await poll() }
    }

    @ViewBuilder
    private func status(_ journals: [Journals.Journal]) -> some View {
        if result == nil {
            ProgressView()
        } else if let text = Journals.statusMessage(result, journalCount: journals.count) {
            message(text)
        }
    }

    private func message(_ text: String) -> some View {
        Text(text).foregroundStyle(.secondary).multilineTextAlignment(.center).padding()
    }

    private func openInNewTab(_ journal: Journals.Journal) {
        let target: WindowTarget?
        if let id = place.machineID {
            target = WindowTarget.machine(id, path: journal.path, isFolder: false)
        } else {
            target = WindowTarget(opening: URL(fileURLWithPath: "/" + journal.path))
        }
        if let target { openWindow(value: target) }
    }

    /// An older server won't start answering, so it is not asked again.
    private func poll() async {
        guard let server = model.serverURL else { return }
        while !Task.isCancelled {
            let answer = await Journals.fetch(place: place, server: server)
            guard !Task.isCancelled else { return }
            result = answer
            if answer == .unsupported { return }
            try? await Task.sleep(for: .seconds(Journals.pollSeconds))
        }
    }
}

// MARK: - Outline

/// The open notebook's Markdown headings (#212), indented by level;
/// clicking one selects its cell and scrolls it to the top.
struct OutlineNavigator: View {
    var page: PageModel

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
        .scrollContentBackground(.hidden)
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
    var page: PageModel
    private let recents = Recents.shared
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        List {
            ForEach(recents.urls, id: \.self) { url in
                Button {
                    page.run("open", arg: FolderEntry.serverPath(url))
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Label(url.deletingPathExtension().lastPathComponent, systemImage: "book.closed")
                        Text(ProjectLineText.abbreviate(url.deletingLastPathComponent().path, home: NSHomeDirectory()))
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
        .scrollContentBackground(.hidden)
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
