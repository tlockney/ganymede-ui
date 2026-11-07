import SwiftUI
#if os(iOS)
import GameController

/// The iPad and iPhone app's one Settings screen (#210, #332): where
/// kernels run, the remotes and the SSH key, the agent, and, with a
/// hardware keyboard, the keyboard shortcuts. The page's own Settings and
/// Connect sheets are for the browser; in the app they open this screen.
/// Pushes `.agent` or `.shortcuts` (the navigation stack's path).
struct SettingsScreen: View {
    var page: PageModel
    let done: () -> Void
    @Environment(AppModel.self) private var model
    @State private var hardwareKeyboard = GCKeyboard.coalesced != nil

    var body: some View {
        RemotesView {
            Section {
                NavigationLink(value: SettingsTab.appearance) {
                    Label("Appearance", systemImage: "textformat")
                }
                NavigationLink(value: SettingsTab.agent) {
                    Label("Agent", systemImage: "sparkles")
                }
            }
            CrashReportsSettings()
            if hardwareKeyboard {
                Section {
                    NavigationLink(value: SettingsTab.shortcuts) {
                        Label("Keyboard Shortcuts", systemImage: "keyboard")
                    }
                } footer: {
                    Text("Lists the notebook's shortcuts, and changes them.")
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: SettingsTab.self) { tab in
            switch tab {
            case .appearance:
                Form {
                    CodeFontSettings()
                }
                .navigationTitle("Appearance")
                .navigationBarTitleDisplayMode(.inline)
            case .agent:
                AgentSettingsView(page: page)
            case .shortcuts:
                Group {
                    if let server = model.serverURL {
                        ShortcutsPane(server: server)
                    } else {
                        Text("Waiting for the server…").foregroundStyle(.secondary)
                    }
                }
                .navigationTitle("Keyboard Shortcuts")
                .navigationBarTitleDisplayMode(.inline)
            default:
                EmptyView()
            }
        }
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done", action: done)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .GCKeyboardDidConnect)) { _ in
            hardwareKeyboard = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .GCKeyboardDidDisconnect)) { _ in
            hardwareKeyboard = GCKeyboard.coalesced != nil
        }
    }
}
#endif

/// The optional agent: on or off, the provider, model and key, and a
/// test. In the iPad and iPhone's Settings screen and the Mac's Settings
/// window (#332). The page keeps the settings and runs the test (`native-agent.ts`);
/// the key goes to the Keychain, where the page reads it.
struct AgentSettingsView: View {
    var page: PageModel
    var secrets: SecretStore = KeychainStore()

    @State private var panel: AgentPanel?
    /// Whether the person changed the settings, so loading them doesn't
    /// save them straight back.
    @State private var changed = false
    @State private var testRun: Task<Void, Never>?
    @State private var problem: String?
    @State private var key = ""
    @State private var models: [String] = []
    @State private var testing = false
    @State private var result: (ok: Bool, message: String)?
    @State private var savedKeys = false

    var body: some View {
        Group {
            if let panel {
                form(panel)
            } else if let problem {
                VStack(spacing: 8) {
                    Text("Couldn’t Load the Agent’s Settings").font(.headline)
                    Text(problem).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                .padding()
            } else if page.ready {
                ProgressView()
            } else {
                // No backend yet: the server didn't start, or a remote
                // can't be reached. The settings load once it connects.
                VStack(spacing: 8) {
                    ProgressView()
                    Text("The agent’s settings load once the notebook page has connected to its server.")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
            }
        }
        .navigationTitle("Agent")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task(id: page.ready) { await load() }
        // Saved a moment after the last change, not on each keystroke.
        // Saves run in order on the page, so the last one wins.
        .task(id: panel) {
            guard changed, let panel,
                  (try? await Task.sleep(nanoseconds: 400_000_000)) != nil
            else { return }
            await save(panel)
        }
        .task(id: key) {
            guard (try? await Task.sleep(nanoseconds: 600_000_000)) != nil else { return }
            saveKey()
        }
        .onDisappear {
            saveKey()
            // Also on pushing Choose a Model: a cancelled test must not
            // leave the button at "Testing…".
            stopTest()
            // Leaving cancels the wait above: save what is there now.
            if changed, let panel { Task { @MainActor in await save(panel) } }
        }
    }

    private func form(_ panel: AgentPanel) -> some View {
        Form {
            Section {
                Toggle("Agent", isOn: binding(\.enabled))
            } footer: {
                Text("An assistant that can edit and run the notebook, with a model you choose. "
                    + "Nothing of it loads until it is on.")
            }
            if panel.enabled {
                Section("Model") {
                    Picker("Provider", selection: Binding(get: { panel.provider }, set: pick)) {
                        ForEach(panel.providers) { Text($0.name).tag($0.id) }
                    }
                    TextField("Model", text: binding(\.model))
                        .plainTextInput()
                    if !models.isEmpty {
                        Picker("Choose a Model", selection: binding(\.model)) {
                            if !models.contains(panel.model) { Text(panel.model).tag(panel.model) }
                            ForEach(models, id: \.self) { Text($0).tag($0) }
                        }
                        #if os(iOS)
                        .pickerStyle(.navigationLink)
                        #else
                        .pickerStyle(.menu)
                        #endif
                    }
                    if panel.provider == "local" {
                        TextField("Server URL", text: binding(\.baseUrl))
                            .plainTextInput(url: true)
                    }
                }
                Section {
                    SecureField(panel.current?.needsKey ?? true ? "API Key" : "API Key (optional)", text: $key)
                        .plainTextInput()
                        .onSubmit(saveKey)
                } header: {
                    Text("API Key")
                } footer: {
                    Text(panel.current?.needsKey ?? true
                        ? "Kept in the Keychain on this device."
                        : "Only if the server asks for one. Kept in the Keychain on this device.")
                }
                Section {
                    Button(testing ? "Testing…" : "Test") {
                        testRun?.cancel()
                        testRun = Task { @MainActor in await test(panel) }
                    }
                    .disabled(testing)
                    if let result {
                        Label(result.message, systemImage: result.ok ? "checkmark.circle" : "xmark.octagon")
                            .foregroundStyle(result.ok ? Color.green : Color.red)
                    }
                } footer: {
                    Text("Sends one short request to the model.")
                }
            } else if savedKeys {
                Section {
                    Button("Forget Saved Keys", role: .destructive, action: forgetKeys)
                } footer: {
                    Text("Turning the agent off keeps its keys until you forget them.")
                }
            }
        }
        .formStyle(.grouped)
        .task(id: panel.enabled ? panel.provider : nil) { await loadModels(panel) }
    }

    private func binding<T>(_ field: WritableKeyPath<AgentPanel, T>) -> Binding<T> {
        Binding(
            get: { panel![keyPath: field] },
            set: {
                panel?[keyPath: field] = $0
                changed = true
                stopTest()
                if field as AnyKeyPath == \AgentPanel.enabled, let panel { savedKeys = hasSavedKeys(panel) }
            }
        )
    }

    private func load() async {
        guard panel == nil else { return }
        guard page.ready else { return }
        do {
            guard let loaded = AgentPanel(body: try await page.call("agent-settings")) else {
                problem = "The notebook page answered with something else."
                return
            }
            key = secrets.get(AgentKeys.account(loaded.provider)) ?? ""
            savedKeys = hasSavedKeys(loaded)
            panel = loaded
        } catch {
            problem = error.localizedDescription
        }
    }

    private func pick(_ provider: String) {
        // The key typed so far is the old provider's.
        saveKey()
        panel?.pick(provider)
        changed = true
        key = secrets.get(AgentKeys.account(provider)) ?? ""
        stopTest()
    }

    private func save(_ panel: AgentPanel) async {
        do {
            _ = try await page.call("save-agent-settings", arg: panel.json())
        } catch {
            result = (false, "The settings weren’t saved: \(error.localizedDescription)")
        }
    }

    /// A change makes the last test's answer out of date.
    private func stopTest() {
        testRun?.cancel()
        testRun = nil
        testing = false
        result = nil
    }

    private func saveKey() {
        guard let panel else { return }
        let account = AgentKeys.account(panel.provider)
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        // Only when it changed: an empty field mustn't keep rewriting.
        guard trimmed != (secrets.get(account) ?? "") else { return }
        do {
            try secrets.set(account, trimmed)
            savedKeys = hasSavedKeys(panel)
        } catch {
            result = (false, "The key wasn’t saved: \(error.localizedDescription)")
        }
    }

    private func hasSavedKeys(_ panel: AgentPanel) -> Bool {
        panel.providers.contains { secrets.get(AgentKeys.account($0.id)) != nil }
    }

    private func forgetKeys() {
        guard let panel else { return }
        for provider in panel.providers {
            try? secrets.set(AgentKeys.account(provider.id), "")
        }
        key = ""
        savedKeys = hasSavedKeys(panel)
    }

    private func loadModels(_ panel: AgentPanel) async {
        guard panel.enabled else { return }
        models = (try? await page.call("agent-models", arg: panel.provider)) as? [String] ?? []
    }

    private func test(_ panel: AgentPanel) async {
        testing = true
        result = nil
        defer { if !Task.isCancelled { testing = false } }
        let answer: [String: Any]?
        do {
            answer = try await page.call("test-agent", arg: panel.json(key: key)) as? [String: Any]
        } catch {
            if !Task.isCancelled { result = (false, error.localizedDescription) }
            return
        }
        // A change since it started: its answer is for other settings.
        guard !Task.isCancelled else { return }
        result = (answer?["ok"] as? Bool ?? false, answer?["message"] as? String ?? "No answer.")
    }
}

private extension View {
    /// A field for names, keys and URLs: no capitals or corrections.
    func plainTextInput(url: Bool = false) -> some View {
        #if os(iOS)
        return self
            .keyboardType(url ? .URL : .default)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        #else
        return autocorrectionDisabled()
        #endif
    }
}
