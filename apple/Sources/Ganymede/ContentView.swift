import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    #if os(macOS)
    /// The notebook or folder this window shows; nil for the last folder.
    @Binding var target: WindowTarget?
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
            .navigationTitle((target ?? .folder(model.root)).title)
            // A notebook opened from the Finder (double-click, Open With,
            // the Dock) arrives here, in a new window or in the one already
            // showing that file.
            .onOpenURL { url in
                if url.isFileURL { target = WindowTarget(opening: url) }
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
                            Label("Kernel Server", systemImage: "server.rack")
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
                KernelServerView()
                    .navigationTitle("Kernels")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { settings = false }
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

    private var page: URL? { model.page(for: target) }
    #else
    private var page: URL? { model.url }
    #endif

    private var content: some View {
        Group {
            if let url = page {
                WebView(url: url)
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
            "The kernel server's token was not saved",
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
