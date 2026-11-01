import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    #if os(macOS)
    /// The notebook or folder this window shows, following the page; nil
    /// for a window opened on nothing, until its page opens a notebook.
    @Binding var target: WindowTarget?
    /// What the page was loaded for. A window opened on nothing keeps the
    /// folder that was the default then, so a later Open Folder… (which
    /// changes the default) leaves it alone.
    @State private var loaded: WindowTarget
    @Environment(\.openWindow) private var openWindow

    init(target: Binding<WindowTarget?>) {
        _target = target
        _loaded = State(initialValue: target.wrappedValue ?? .folder(AppModel.shared.root))
    }
    #endif
    #if os(iOS)
    @Environment(\.scenePhase) private var phase
    @State private var picking = false
    @State private var settings = false
    #endif

    var body: some View {
        #if os(macOS)
        content
            .frame(minWidth: 720, minHeight: 480)
            .navigationTitle((target ?? loaded).title)
            .focusedSceneValue(\.windowFolder, (target ?? loaded).folder)
            // A notebook opened from the Finder (double-click, Open With,
            // the Dock) arrives here, in a new window or in the one already
            // showing that file. The claim below matches by substring, so
            // another file (or the second of several opened at once) goes
            // to its own window.
            .onOpenURL { url in
                guard url.isFileURL else { return }
                let opening = WindowTarget(opening: url)
                if target == nil {
                    target = opening
                    loaded = opening
                } else if opening != target {
                    openWindow(value: opening)
                }
            }
            .handlesExternalEvents(preferring: externalEvents, allowing: externalEvents)
        #else
        NavigationStack {
            content
                .ignoresSafeArea(.container, edges: .bottom)
                .navigationTitle(model.root.lastPathComponent)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .primaryAction) {
                        Button {
                            settings = true
                        } label: {
                            Label("Remotes", systemImage: "server.rack")
                        }
                        Button {
                            picking = true
                        } label: {
                            Label("Open Folder", systemImage: "folder")
                        }
                    }
                }
        }
        .sheet(isPresented: $settings) {
            NavigationStack {
                RemotesView()
                    .navigationTitle("Remotes")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { settings = false }
                        }
                    }
            }
            .environmentObject(model)
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { result in
            if case .success(let folder) = result {
                model.open(folder: folder)
            }
        }
        .onChange(of: phase) { phase in
            if phase == .active {
                Task { await model.resume() }
            }
        }
        #endif
    }

    #if os(macOS)
    /// A notebook window takes the Finder's later opens of its own file
    /// (matched by containment, so only files), and nothing else; a new
    /// window is made for any other file.
    private var externalEvents: Set<String> {
        if case .file(let url) = target { return [url.absoluteString] }
        return []
    }

    private var page: URL? { model.page(for: loaded) }

    /// The page opened another notebook, or closed it: the window now
    /// shows that, for its title and for the Finder's later opens. The page
    /// stays as it is.
    private func follow(_ url: URL?) {
        guard let url else { return }
        if let shown = WindowTarget(page: url) {
            if shown != target { target = shown }
        } else if case .file(let file) = target {
            target = .folder(file.deletingLastPathComponent())
        }
    }
    #else
    private var page: URL? { model.url }
    #endif

    private var content: some View {
        Group {
            if let url = page {
                #if os(macOS)
                WebView(url: url, onNavigate: follow)
                #else
                WebView(url: url)
                #endif
            } else if let error = model.error {
                VStack(spacing: 12) {
                    Text("Ganymede could not start").font(.headline)
                    Text(error)
                        .textSelection(.enabled)
                        .multilineTextAlignment(.center)
                    Button("Try Again") { model.start() }
                }
                .padding()
            } else {
                ProgressView()
            }
        }
        .task { model.startIfNeeded() }
        .alert(
            "Remotes",
            isPresented: Binding(
                get: { model.keychainError != nil },
                set: { if !$0 { model.keychainError = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.keychainError ?? "")
        }
    }
}
