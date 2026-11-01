import SwiftUI

/// Settings: the remotes, and where kernels run. Kernels run on this
/// device (the Mac's kernelspecs, or TypeScript kernels on iOS) or on one
/// remote's server, which the in-process server proxies (`gateway_url`).
struct RemotesView: View {
    @EnvironmentObject private var model: AppModel
    /// The remote being edited; a new one when it isn't in the list yet.
    @State private var editing: Remote?
    /// The remote waiting for the user to confirm its removal.
    @State private var removing: Remote?

    var body: some View {
        Form {
            Section {
                Picker("Run kernels on", selection: kernels) {
                    Text("This device").tag(UUID?.none)
                    ForEach(model.remotes.filter(\.hasServer)) { remote in
                        Text(remote.title).tag(UUID?.some(remote.id))
                    }
                }
            } header: {
                Text("Kernels")
            } footer: {
                Text(kernelsFooter)
            }
            Section {
                ForEach(model.remotes) { remote in
                    row(remote)
                }
                Button("Add Remote…") { editing = Remote() }
            } header: {
                Text("Remotes")
            } footer: {
                Text("A remote is a Jupyter or Ganymede server, for kernels and terminals, "
                    + "an SSH host, for terminals, or both.")
            }
        }
        .formStyle(.grouped)
        .sheet(item: $editing) { remote in
            RemoteEditor(remote: remote, isNew: model.remote(remote.id) == nil)
                .environmentObject(model)
        }
        .confirmationDialog(
            "Remove \(removing?.title ?? "remote")?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            presenting: removing
        ) { remote in
            Button("Remove", role: .destructive) { model.delete(remote: remote.id) }
        } message: { remote in
            Text(remote.id == model.kernelRemoteID
                ? "Kernels run on this remote. They will move to this device, and running kernels are shut down."
                : "Its token is removed from the keychain.")
        }
    }

    private var kernels: Binding<UUID?> {
        Binding(get: { model.kernelRemoteID }, set: { model.useForKernels($0) })
    }

    private func row(_ remote: Remote) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(remote.title)
                Text(summary(remote))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Button("Edit") { editing = remote }
                .buttonStyle(.borderless)
            #if os(macOS)
            Button(role: .destructive) {
                removing = remote
            } label: {
                Image(systemName: "minus.circle")
            }
            .buttonStyle(.borderless)
            .help("Remove \(remote.title)")
            #endif
        }
        #if os(iOS)
        .swipeActions {
            Button("Remove", role: .destructive) { removing = remote }
        }
        #endif
    }

    private func summary(_ remote: Remote) -> String {
        var parts: [String] = []
        if remote.hasServer { parts.append(remote.serverURL) }
        if let ssh = remote.ssh {
            let user = ssh.user.isEmpty ? "" : "\(ssh.user)@"
            let port = ssh.port.map { ":\($0)" } ?? ""
            parts.append("ssh \(user)\(ssh.host)\(port)")
        }
        return parts.joined(separator: " · ")
    }

    private var kernelsFooter: String {
        #if os(iOS)
        return "On this device, notebooks run TypeScript kernels. On a remote, notebooks stay here and "
            + "their kernels run on its server, such as `ganymede serve --ip 0.0.0.0` on your Mac. "
            + "Running kernels are shut down when this changes."
        #else
        return "On this device, notebooks use the kernels installed on this Mac. On a remote, notebooks "
            + "stay here and their kernels run on its server. Running kernels are shut down when this changes."
        #endif
    }
}

/// Adds or edits one remote.
struct RemoteEditor: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var remote: Remote
    @State private var token = ""
    @State private var useSSH: Bool
    @State private var ssh: Remote.SSH
    @State private var port = ""
    let isNew: Bool

    init(remote: Remote, isNew: Bool) {
        _remote = State(initialValue: remote)
        _useSSH = State(initialValue: remote.ssh != nil)
        _ssh = State(initialValue: remote.ssh ?? Remote.SSH(host: ""))
        _port = State(initialValue: remote.ssh?.port.map(String.init) ?? "")
        self.isNew = isNew
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $remote.name, prompt: Text(edited.title))
                }
                Section {
                    TextField("URL", text: $remote.serverURL, prompt: Text("https://host:8888"))
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        #endif
                    SecureField("Token", text: $token)
                } header: {
                    Text("Jupyter or Ganymede server")
                } footer: {
                    Text("Optional. Used for kernels and terminals.")
                }
                Section {
                    Toggle("Connect with SSH", isOn: $useSSH)
                    if useSSH {
                        TextField("Host", text: $ssh.host, prompt: Text(hostPrompt))
                            .autocorrectionDisabled()
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            #endif
                        TextField("User", text: $ssh.user, prompt: Text("Default"))
                            .autocorrectionDisabled()
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            #endif
                        TextField("Port", text: $port, prompt: Text("22"))
                            #if os(iOS)
                            .keyboardType(.numberPad)
                            #endif
                    }
                } header: {
                    Text("SSH")
                } footer: {
                    Text("Optional. Used for terminals.")
                }
            }
            .formStyle(.grouped)
            .navigationTitle(isNew ? "Add Remote" : "Edit Remote")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNew ? "Add" : "Save") {
                        model.save(edited, token: token)
                        dismiss()
                    }
                    .disabled(!edited.isValid || useSSH && !portIsValid)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 380)
        #endif
        .onAppear {
            token = isNew ? "" : model.token(for: remote.id)
        }
    }

    private var hostPrompt: String {
        #if os(macOS)
        "Host name or ~/.ssh/config alias"
        #else
        "Host name"
        #endif
    }

    private var portIsValid: Bool {
        port.trimmingCharacters(in: .whitespaces).isEmpty || Int(port.trimmingCharacters(in: .whitespaces)) != nil
    }

    /// The remote as it would be saved.
    private var edited: Remote {
        var result = remote
        if useSSH {
            var value = ssh
            value.host = value.host.trimmingCharacters(in: .whitespaces)
            value.user = value.user.trimmingCharacters(in: .whitespaces)
            value.port = Int(port.trimmingCharacters(in: .whitespaces))
            result.ssh = value
        } else {
            result.ssh = nil
        }
        return result
    }
}
