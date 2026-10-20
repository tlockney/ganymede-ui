import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    #if os(iOS)
    @Environment(\.scenePhase) private var phase
    @State private var picking = false
    @State private var settings = false
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
