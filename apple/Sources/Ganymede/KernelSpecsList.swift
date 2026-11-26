import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Puts `text` on the pasteboard.
func copyToPasteboard(_ text: String) {
    #if os(macOS)
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
    #else
    UIPasteboard.general.string = text
    #endif
}

/// Settings: the kernels installed on the server kernels run on, each with
/// its details (#206, #694). On the Mac this is Settings > Kernels; on the
/// iPad and iPhone it follows the location picker.
struct InstalledKernelsSection: View {
    @Environment(AppModel.self) private var model
    @State private var specs: KernelSpecs?
    @State private var error: String?
    /// Bumped to list the kernels again: by Refresh, and on the Mac when the
    /// app comes back to the front, as a kernelspec may have been installed
    /// or removed meanwhile (#350).
    @State private var reload = 0

    var body: some View {
        Section {
            if let specs {
                // The app's name for the remote (#832), as Where Kernels Run
                // has it; the server's own when the app has no remote by it.
                let remote = specs.remote.map { model.kernelRemote?.title ?? $0.name }
                ForEach(specs.specs) { spec in
                    KernelSpecRow(spec: spec, isDefault: spec.name == specs.defaultName, remote: remote)
                }
                // The remote isn't answering (#832): the line that says so
                // stands in for "no kernels" when the list is empty too.
                if let line = specs.notAnswering(name: remote) {
                    Text(line).font(.caption).foregroundStyle(.secondary)
                } else if specs.specs.isEmpty {
                    // A remote's list comes through the server's gateway,
                    // which has none until it first reaches the remote.
                    Text(model.kernelRemote == nil ? "No kernels installed." : "No kernels listed yet.")
                        .foregroundStyle(.secondary)
                }
            } else if let error {
                Text(error).foregroundStyle(.secondary)
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        } header: {
            HStack {
                Text("Installed")
                Spacer()
                Button("Refresh") { reload += 1 }
                    .disabled(model.serverURL == nil)
            }
        } footer: {
            #if os(macOS)
            Text("Kernels are Jupyter kernelspecs. To add TypeScript, run `cdp-kernel install --runtime node`.")
            #endif
        }
        // Again when the server restarts, as it does when kernels move, or
        // fails to start. `serverURL` is cleared as a restart begins, so a
        // stopping server isn't asked.
        .task(id: "\(model.serverURL?.absoluteString ?? "")\n\(model.error ?? "")\n\(model.kernelRemoteID?.uuidString ?? "")\n\(reload)") { await load() }
        #if os(macOS)
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            reload += 1
        }
        #endif
    }

    private func load() async {
        guard let server = model.serverURL.flatMap(ServerEndpoint.init(serverURL:)) else {
            specs = nil
            error = model.error.map { "Ganymede could not start: \($0)" } ?? "Waiting for the server…"
            return
        }
        do {
            specs = try await KernelSpecs.load(from: server)
            error = nil
            // A remote's list may not have arrived yet: ask once more.
            if specs?.specs.isEmpty == true, model.kernelRemote != nil {
                try await Task.sleep(nanoseconds: 5_000_000_000)
                specs = try await KernelSpecs.load(from: server)
            }
        } catch {
            // A cancelled load throws URLError(.cancelled), not
            // CancellationError: either way a newer task owns the text.
            if Task.isCancelled { return }
            specs = nil
            self.error = "Couldn’t list the kernels: \(error.localizedDescription)"
        }
    }
}

/// One installed kernel: its names, and a disclosure with the fields the
/// kernelspec sets (#694).
struct KernelSpecRow: View {
    let spec: KernelSpecs.Spec
    let isDefault: Bool
    /// The remote this kernel runs on (#832), when it runs on one.
    var remote: String?

    /// "Python 3 · workmbp" for a remote's kernel, its plain name here.
    private var name: String {
        guard spec.gateway, let remote, !remote.isEmpty else { return spec.displayName }
        return "\(spec.displayName) · \(remote)"
    }

    private var summary: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                Text([spec.name, spec.language].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if isDefault {
                Text("Default").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    @State private var expanded = false

    var body: some View {
        if spec.hasDetails {
            DisclosureGroup(isExpanded: $expanded) {
                VStack(alignment: .leading, spacing: 6) {
                    if let mode = spec.interruptMode { detail("Interrupt mode", mode) }
                    if let version = spec.protocolVersion { detail("Protocol version", version) }
                    if let dir = spec.resourceDir { detail("Folder", dir, monospaced: true) }
                    if !spec.argv.isEmpty {
                        let command = KernelSpecs.shellCommand(spec.argv)
                        HStack(alignment: .firstTextBaseline) {
                            detail("Command", command, monospaced: true)
                            Spacer()
                            Button("Copy") { copyToPasteboard(command) }
                            .accessibilityLabel("Copy the command for \(spec.displayName)")
                        }
                    }
                    ForEach(spec.env) { detail("env \($0.key)", $0.value, monospaced: true) }
                    ForEach(spec.metadata) { detail("metadata \($0.key)", $0.value) }
                }
                .padding(.vertical, 4)
            } label: {
                // The whole row toggles, not only the arrow.
                summary
                    .contentShape(Rectangle())
                    .onTapGesture { expanded.toggle() }
            }
        } else {
            summary
        }
    }

    private func detail(_ title: String, _ value: String, monospaced: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value)
                .font(monospaced ? .system(.caption, design: .monospaced) : .caption)
                .textSelection(.enabled)
        }
    }
}
