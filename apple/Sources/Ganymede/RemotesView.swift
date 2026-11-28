import SwiftUI

/// Settings: the remotes, and on the iPad and iPhone where kernels run
/// first (`KernelLocationSection`); the Mac's Settings has a Kernels tab
/// for that (#332).
struct RemotesView<Extra: View>: View {
    @Environment(AppModel.self) private var model
    /// Sections after these: the iPad and iPhone's Settings screen (#210).
    private let extra: Extra
    /// The remote being edited; a new one when it isn't in the list yet.
    @State private var editing: Remote?
    /// The remote waiting for the user to confirm its removal.
    @State private var removing: Remote?

    init(@ViewBuilder extra: () -> Extra) {
        self.extra = extra()
    }

    var body: some View {
        Form {
            #if os(iOS)
            KernelLocationSection()
            InstalledKernelsSection()
            #endif
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
            #if os(iOS)
            SSHKeySection()
            #endif
            extra
        }
        .formStyle(.grouped)
        .sheet(item: $editing) { remote in
            RemoteEditor(remote: remote, isNew: model.remote(remote.id) == nil)
                .environment(model)
        }
        .confirmationDialog(
            "Remove \(removing?.title ?? "remote")?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            presenting: removing
        ) { remote in
            Button("Remove", role: .destructive) {
                Task { @MainActor in await model.requestDelete(remote: remote.id) }
            }
        } message: { remote in
            Text(remote.id == model.kernelRemoteID
                ? "Kernels run on this remote. They will move to this device, and running kernels are shut down."
                : "Its token is removed from the keychain.")
        }
        #if os(iOS)
        .modifier(SwitchSaveAlert(coordinator: model.kernelSwitchGuard, isEnabled: editing == nil))
        #endif
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
}

/// Where kernels run: on this device (the Mac's kernelspecs, or TypeScript
/// kernels on iOS) or on one remote's server, which the in-process server
/// proxies (`gateway_url`).
struct KernelLocationSection: View {
    @Environment(AppModel.self) private var model
    /// The server's answer, and the remote it was fetched for: another
    /// remote's answer is not this one's (#832).
    private struct RemoteSpecs {
        var remote: UUID
        var specs: KernelSpecs
    }

    /// What the server says of the remote kernels run on (#832): the line
    /// under the picker while it isn't answering.
    @State private var loaded: RemoteSpecs?

    var body: some View {
        Section {
            Picker("Run kernels on", selection: kernels) {
                Text(Self.thisDevice).tag(UUID?.none)
                ForEach(model.remotes.filter(\.hasServer)) { remote in
                    Text(remote.title).tag(UUID?.some(remote.id))
                }
            }
            status
        } header: {
            Text("Where Kernels Run")
        } footer: {
            Text(Self.footer)
        }
        // A remote that goes down or comes back, as the server finds it.
        .task(id: "\(model.serverURL?.absoluteString ?? "")\n\(model.kernelRemoteID?.uuidString ?? "")") {
            await check()
        }
    }

    /// "workmbp isn't answering: …", under the picker (#832). Named as the
    /// remote is here, not as its server's URL names it, and shown only for
    /// the remote it was fetched for (which drops one fetched before a
    /// switch to this device), and only while the running server is that
    /// remote's (#854).
    @ViewBuilder
    private var status: some View {
        if let loaded, loaded.remote == model.kernelRemoteID,
           let line = Remote.notAnswering(in: loaded.specs, chosen: model.kernelRemote,
                                          served: model.servedKernels) {
            Text(line)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    /// Asks for the kernelspecs, and with them the remote's status, every
    /// 15 seconds while a remote is chosen: the server retries it at the
    /// same pace.
    private func check() async {
        // The answer belongs to the remote chosen when it was asked for: a
        // switch to this device, or to another remote, drops the last one's.
        loaded = nil
        guard let remote = model.kernelRemoteID,
              let server = model.serverURL.flatMap(ServerEndpoint.init(serverURL:))
        else { return }
        while !Task.isCancelled {
            if let specs = try? await KernelSpecs.load(from: server) {
                loaded = RemoteSpecs(remote: remote, specs: specs)
            } else if loaded?.remote != remote {
                // A failed load says nothing of another remote.
                loaded = nil
            }
            try? await Task.sleep(for: .seconds(15))
        }
    }

    private var kernels: Binding<UUID?> {
        Binding(
            get: { model.kernelRemoteID },
            set: { next in
                Task { @MainActor in await model.requestUseForKernels(next) }
            }
        )
    }

    #if os(iOS)
    private static let thisDevice = "This device"
    private static let footer = "On this device, notebooks run TypeScript kernels. On a remote, notebooks stay here and "
        + "their kernels run on its server, such as `ganymede serve --ip 0.0.0.0` on your Mac. "
        + "Add remotes below. Running kernels are shut down when this changes."
    #else
    private static let thisDevice = "This Mac"
    private static let footer = "On this Mac, notebooks use the kernels installed here, and TypeScript kernels "
        + "that run in the notebook window. On a remote, notebooks stay here and their kernels run on its "
        + "server; add one in Remotes. Running kernels are shut down when this changes."
    #endif
}

/// Adds or edits one remote.
struct RemoteEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var forgotHostKey = false
    @State private var remote: Remote
    @State private var token = ""
    @State private var useSSH: Bool
    @State private var ssh: Remote.SSH
    @State private var port = ""
    /// Run kernels on this remote's server once it is saved (#473).
    @State private var runsKernels: Bool
    /// Whether this machine's rooms get this Mac's account name (#842).
    @State private var sharesName: Bool
    /// Whether this machine's notebooks may use this device (#877).
    @State private var usesDevice: Bool
    #if os(macOS)
    /// Other devices on the tailnet, to fill in the URL (ganymede#816).
    @State private var peers: [AppTailnet.Peer] = []
    /// The name the picker last filled in, so a second pick replaces it.
    @State private var pickedName: String?
    #endif
    /// Server URLs saved before, most recent first (#731).
    @State private var recentURLs = RecentHosts.load()
    @State private var saving = false
    let isNew: Bool

    init(remote: Remote, isNew: Bool) {
        _remote = State(initialValue: remote)
        _useSSH = State(initialValue: remote.ssh != nil)
        _ssh = State(initialValue: remote.ssh ?? Remote.SSH(host: ""))
        _port = State(initialValue: remote.ssh?.port.map(String.init) ?? "")
        _runsKernels = State(initialValue: AppModel.shared.kernelRemoteID == remote.id)
        _sharesName = State(initialValue: remote.shares)
        _usesDevice = State(initialValue: remote.letsNotebooksUseDevice)
        self.isNew = isNew
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $remote.name, prompt: Text(edited.title))
                }
                Section {
                    TextField("URL", text: $remote.serverURL, prompt: Text(urlPrompt))
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        #endif
                    #if os(macOS)
                    if !peers.isEmpty {
                        Menu("Tailnet Device") {
                            ForEach(peers) { peer in
                                Button(peer.online ? peer.name : "\(peer.name) (offline)") {
                                    // Another server's token isn't for this one.
                                    token = RecentHosts.tokenAfterPicking(peer.serverURL, field: remote.serverURL, token: token)
                                    remote.serverURL = peer.serverURL
                                    if remote.name.trimmingCharacters(in: .whitespaces).isEmpty || remote.name == pickedName {
                                        remote.name = peer.name
                                        pickedName = peer.name
                                    }
                                }
                            }
                        }
                    }
                    #endif
                    let recent = RecentHosts.excluding(remote.serverURL, from: recentURLs)
                    if !recent.isEmpty {
                        Menu("Recent") {
                            ForEach(recent, id: \.self) { url in
                                Button(url) {
                                    // Another server's token isn't for this one.
                                    token = RecentHosts.tokenAfterPicking(url, field: remote.serverURL, token: token)
                                    remote.serverURL = url
                                }
                            }
                        }
                    }
                    SecureField("Token", text: $token)
                    if !remote.serverURL.trimmingCharacters(in: .whitespaces).isEmpty {
                        Toggle("Run kernels on this remote", isOn: $runsKernels)
                        Toggle("Show my name in this machine's notebooks", isOn: $sharesName)
                        Toggle("Let this machine's notebooks use this device", isOn: $usesDevice)
                        Text(deviceFooter)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Jupyter or Ganymede server")
                } footer: {
                    Text(serverFooter)
                }
                Section {
                    Toggle("Connect with SSH", isOn: $useSSH)
                    if useSSH {
                        TextField("Host", text: $ssh.host, prompt: Text(hostPrompt))
                            .autocorrectionDisabled()
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            #endif
                        TextField("User", text: $ssh.user, prompt: Text(userPrompt))
                            .autocorrectionDisabled()
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            #endif
                        TextField("Port", text: $port, prompt: Text("22"))
                            #if os(iOS)
                            .keyboardType(.numberPad)
                            #endif
                    }
                    #if os(iOS)
                    if useSSH, !isNew, !forgotHostKey, model.hostKeys.key(for: remote.id) != nil {
                        Button("Forget Host Key", role: .destructive) {
                            model.hostKeys.forget(remote.id)
                            forgotHostKey = true
                        }
                    }
                    #endif
                } header: {
                    Text("SSH")
                } footer: {
                    Text(sshFooter)
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
                        saving = true
                        Task { @MainActor in
                            let saved = await save()
                            saving = false
                            if saved { dismiss() }
                        }
                    }
                    .disabled(saving || !edited.isValid || useSSH && (!portIsValid || !userIsValid))
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 380)
        #else
        .modifier(SwitchSaveAlert(coordinator: model.kernelSwitchGuard))
        #endif
        .onAppear {
            token = isNew ? "" : model.token(for: remote.id)
        }
        #if os(macOS)
        .task {
            peers = await AppTailnet.loadPeers()
        }
        #endif
    }

    /// Saves the remote and moves kernels to it, or back to this device,
    /// if the toggle changed where they run. Like Settings › Kernels, it
    /// saves any open dirty notebooks first if applying requires a restart.
    private func save() async -> Bool {
        let saved = edited
        let wanted = runsKernels && !saved.serverURL.trimmingCharacters(in: .whitespaces).isEmpty
        let current = model.kernelRemoteID == saved.id
        let apply: @MainActor () -> Void = {
            if current && !wanted { model.useForKernels(nil) }
            model.save(saved, token: token)
            RecentHosts.record(saved.serverURL)
            if wanted && !current { model.useForKernels(saved.id) }
        }
        let willRestart = (current && !wanted)
            || (wanted && !current)
            || model.wouldRestartSaving(saved, token: token)
        if willRestart {
            return await model.guardServerRestart(commit: apply)
        }
        apply()
        return true
    }

    /// iOS has no tailnet picker, so its placeholder shows the address to type.
    private var urlPrompt: String {
        #if os(macOS)
        "https://host:8888"
        #else
        "https://host.tailnet.ts.net/"
        #endif
    }

    /// What the device toggle means, under it (#877): handlers are made with
    /// a window's page, and a read of the clipboard always asks.
    private var deviceFooter: String {
        "Applies to this machine's windows opened after the change. A notebook asking for your "
            + "clipboard always asks first."
    }

    private var serverFooter: String {
        #if os(macOS)
        let words = "Optional. Used for kernels and terminals. Choose where kernels run here, from the foot of a "
            + "window's sidebar, or from the Kernel menu. Running kernels are shut down when it changes. "
            + "A Ganymede server that lets you in by your tailnet login needs no token."
        #else
        let words = "Optional. Used for kernels and terminals. Choose where kernels run here, above, or from a "
            + "notebook's More menu. Running kernels are shut down when it changes. "
            + "A Ganymede server that lets you in by your tailnet login needs no token. "
            + "On your tailnet, enter the device's address, like https://name.tailnet.ts.net/, "
            + "with the Tailscale app connected; the full name is in the Tailscale app. "
            + "A Mac shares Ganymede there when Share on my tailnet is on in Settings › General › "
            + "Tailnet and your Tailscale login is listed."
        #endif
        guard !remote.serverURL.trimmingCharacters(in: .whitespaces).isEmpty else { return words }
        // The name setting's words, under its toggle (#842).
        #if os(macOS)
        return words + " "
            + "With Show my name on, your Mac account's name goes to that machine's notebooks, "
            + "so its agents and other people there see who edited; off, they see \"a person\". "
            + "A machine that lets you in by your tailnet login shows that login either way."
        #else
        return words + " "
            + "An iPad or iPhone sends no name, so Show my name has no effect here."
        #endif
    }

    private var hostPrompt: String {
        #if os(macOS)
        "Host name or ~/.ssh/config alias"
        #else
        "Host name"
        #endif
    }

    private var userPrompt: String {
        #if os(macOS)
        "Default"
        #else
        "Required"
        #endif
    }

    /// iOS has no ssh-config or local user name to fall back on.
    private var userIsValid: Bool {
        #if os(iOS)
        !ssh.user.trimmingCharacters(in: .whitespaces).isEmpty
        #else
        true
        #endif
    }

    private var sshFooter: String {
        #if os(macOS)
        "Optional. Used for terminals, with this Mac's ssh, its config and keys."
        #else
        "Optional. Used for terminals, signing in with the app's SSH key. The host key is "
            + "trusted the first time and checked after that."
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
        // On stays nil, as a remote saved by an older build is (#842).
        result.sharesName = Remote.sharesNameSetting(sharesName)
        // Off stays nil, as a remote saved by an older build is, which means
        // off too (#877).
        result.usesDevice = Remote.usesDeviceSetting(usesDevice)
        return result
    }
}

#if os(iOS)
/// The app's SSH key: generate or import one, and copy its public key for
/// the remote's ~/.ssh/authorized_keys.
private struct SSHKeySection: View {
    @Environment(AppModel.self) private var model
    @State private var importing = false
    @State private var confirmingRemove = false

    var body: some View {
        Section {
            if let line = model.sshPublicKey {
                Text(line)
                    .font(.caption.monospaced())
                    .textSelection(.enabled)
                Button("Copy Public Key") { UIPasteboard.general.string = line }
                Button("Remove Key", role: .destructive) { confirmingRemove = true }
            } else {
                Button("Generate Key") { model.generateSSHKey() }
                Button("Import Key…") { importing = true }
            }
        } header: {
            Text("SSH key")
        } footer: {
            Text("An ed25519 key kept in this device's keychain. Add the public key to "
                + "~/.ssh/authorized_keys on each SSH remote.")
        }
        .sheet(isPresented: $importing) {
            SSHKeyImport().environment(model)
        }
        .confirmationDialog("Remove the SSH key?", isPresented: $confirmingRemove) {
            Button("Remove", role: .destructive) { model.removeSSHKey() }
        } message: {
            Text("Remotes that only accept this key can't be reached until you add a new one there.")
        }
    }
}

/// Paste an unencrypted OpenSSH ed25519 private key.
private struct SSHKeyImport: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var failure: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text)
                        .font(.caption.monospaced())
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .frame(minHeight: 200)
                } footer: {
                    Text(failure ?? "Paste the contents of an ed25519 private key file, such as ~/.ssh/id_ed25519, "
                        + "without a passphrase.")
                }
            }
            .navigationTitle("Import Key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") {
                        do {
                            try model.importSSHKey(text)
                            dismiss()
                        } catch {
                            failure = error.localizedDescription
                        }
                    }
                    .disabled(text.isEmpty)
                }
            }
        }
    }
}
#endif

extension RemotesView where Extra == EmptyView {
    init() {
        self.init { EmptyView() }
    }
}
