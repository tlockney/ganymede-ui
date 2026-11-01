import SwiftUI

/// A window, or on iPhone a full-screen view, editing one text file on the
/// app's own server (#122). It reloads the file when it changes on disk
/// and there are no edits, and asks what to do when there are.
struct EditorWindow: View {
    @StateObject private var document: EditorDocument
    #if os(iOS)
    @Environment(\.scenePhase) private var phase
    /// Shown on iPhone, where the editor covers the notebook: closes it.
    var onClose: (() -> Void)?
    @State private var confirmingClose = false
    #endif

    #if os(macOS)
    init(request: EditorRequest) {
        _document = StateObject(wrappedValue: EditorDocument(path: request.path) { AppModel.shared.localServer })
    }
    #else
    init(request: EditorRequest, onClose: (() -> Void)? = nil) {
        _document = StateObject(wrappedValue: EditorDocument(path: request.path) { AppModel.shared.localServer })
        self.onClose = onClose
    }
    #endif

    var body: some View {
        VStack(spacing: 0) {
            if document.changedOnDisk {
                bar("“\(document.name)” changed on disk, and has unsaved edits here.") {
                    Button("Use the File on Disk") { Task { await document.load() } }
                    Button("Save Mine") { Task { await document.overwrite() } }
                }
            } else if document.loaded, let problem = document.problem {
                bar(problem) {
                    Button("Try Again") { Task { await document.retry() } }
                }
            }
            if document.loaded {
                CodeTextView(document: document)
            } else if let problem = document.problem {
                VStack(spacing: 12) {
                    Text(problem)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Try Again") { Task { await document.load() } }
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(document.name)
        .toolbar {
            #if os(iOS)
            if let onClose {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        if document.dirty { confirmingClose = true } else { onClose() }
                    }
                }
            }
            #endif
            ToolbarItem(placement: .primaryAction) {
                Button("Save") { Task { await document.save() } }
                    .disabled(!document.dirty)
            }
        }
        .task {
            await document.load()
            // Changes on disk, from another app or a kernel.
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await document.checkForChanges()
            }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 320)
        .background(WindowReader { document.attach(to: $0) })
        .focusedSceneObject(document)
        #else
        .navigationBarTitleDisplayMode(.inline)
        // iOS may end a scene in the background without asking, so the
        // edits are saved on the way there.
        .onChange(of: phase) { phase in
            if phase == .background { Task { await document.save() } }
        }
        .confirmationDialog(
            "Save the changes to “\(document.name)”?", isPresented: $confirmingClose, titleVisibility: .visible
        ) {
            Button("Save") {
                Task {
                    if await document.save() { onClose?() }
                }
            }
            Button("Don’t Save", role: .destructive) { onClose?() }
        }
        #endif
    }

    private func bar<Buttons: View>(_ message: String, @ViewBuilder buttons: () -> Buttons) -> some View {
        HStack {
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(3)
            Spacer()
            buttons()
        }
        .padding(8)
        .background(.bar)
    }
}

#if os(iOS)
/// An editor in its own scene, beside the notebook on iPad.
struct EditorScene: View {
    let request: EditorRequest?

    var body: some View {
        NavigationStack {
            if let request {
                EditorWindow(request: request)
            } else {
                Text("No file is open.")
                    .foregroundStyle(.secondary)
            }
        }
    }
}
#endif
