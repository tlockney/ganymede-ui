import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    #if os(iOS)
    @Environment(\.scenePhase) private var phase
    @State private var picking = false
    #endif

    var body: some View {
        #if os(macOS)
        content
            .frame(minWidth: 720, minHeight: 480)
            .navigationTitle(model.root.lastPathComponent)
        #else
        NavigationStack {
            content
                .ignoresSafeArea(.container, edges: .bottom)
                .navigationTitle(model.root.lastPathComponent)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            picking = true
                        } label: {
                            Label("Open Folder", systemImage: "folder")
                        }
                    }
                }
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

    private var content: some View {
        Group {
            if let url = model.url {
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
    }
}
