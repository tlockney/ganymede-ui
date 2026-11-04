#if os(iOS)
import GameController
import SwiftUI

/// The iPad and iPhone app's one Settings screen (#210): where kernels
/// run, the remotes and the SSH key, the agent, and, with a hardware
/// keyboard, the keyboard shortcuts. The page's own Settings and Connect
/// sheets are for the browser.
struct SettingsScreen: View {
    @ObservedObject var page: PageModel
    let done: () -> Void
    @State private var hardwareKeyboard = GCKeyboard.coalesced != nil

    var body: some View {
        RemotesView {
            Section {
                NavigationLink {
                    AgentSettingsView(page: page)
                } label: {
                    Label("Agent", systemImage: "sparkles")
                }
            }
            if hardwareKeyboard {
                Section {
                    Button {
                        done()
                        // The page's sheet, once this one has gone: it
                        // rebinds keys, which only the page can.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                            page.run("show-shortcuts")
                        }
                    } label: {
                        Label("Keyboard Shortcuts", systemImage: "keyboard")
                    }
                    .disabled(!page.state.hasNotebook)
                } footer: {
                    Text(page.state.hasNotebook
                        ? "Lists the notebook's shortcuts, and changes them."
                        : "Open a notebook to see its shortcuts.")
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
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

/// The optional agent: on or off, the provider, model and key, and a
/// test. The page keeps the settings and runs the test (`native-agent.ts`);
/// the key goes to the Keychain, where the page reads it.
struct AgentSettingsView: View {
    @ObservedObject var page: PageModel
    var secrets: SecretStore = KeychainStore()

    @State private var panel: AgentPanel?
    /// What the page has, so loading doesn't save it straight back.
    @State private var saved: AgentPanel?
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
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Agent")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: page.ready) { await load() }
        // Saved a moment after the last change, not on each keystroke.
        .task(id: panel) {
            guard let panel, panel != saved,
                  (try? await Task.sleep(nanoseconds: 400_000_000)) != nil
            else { return }
            do {
                _ = try await page.call("save-agent-settings", arg: panel.json())
                saved = panel
            } catch {
                result = (false, "The settings weren’t saved: \(error.localizedDescription)")
            }
        }
        .task(id: key) {
            guard (try? await Task.sleep(nanoseconds: 600_000_000)) != nil else { return }
            saveKey()
        }
        .onDisappear { saveKey() }
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
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !models.isEmpty {
                        Picker("Choose a Model", selection: binding(\.model)) {
                            if !models.contains(panel.model) { Text(panel.model).tag(panel.model) }
                            ForEach(models, id: \.self) { Text($0).tag($0) }
                        }
                        .pickerStyle(.navigationLink)
                    }
                    if panel.provider == "local" {
                        TextField("Server URL", text: binding(\.baseUrl))
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }
                if panel.current?.needsKey ?? true {
                    Section {
                        SecureField("API Key", text: $key)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .onSubmit(saveKey)
                    } header: {
                        Text("API Key")
                    } footer: {
                        Text("Kept in the Keychain on this device.")
                    }
                }
                Section {
                    Button(testing ? "Testing…" : "Test") { Task { await test(panel) } }
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
        .task(id: panel.enabled ? panel.provider : nil) { await loadModels(panel) }
    }

    private func binding<T>(_ field: WritableKeyPath<AgentPanel, T>) -> Binding<T> {
        Binding(
            get: { panel![keyPath: field] },
            set: {
                panel?[keyPath: field] = $0
                result = nil
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
            saved = loaded
            panel = loaded
        } catch {
            problem = error.localizedDescription
        }
    }

    private func pick(_ provider: String) {
        // The key typed so far is the old provider's.
        saveKey()
        panel?.pick(provider)
        key = secrets.get(AgentKeys.account(provider)) ?? ""
        result = nil
    }

    private func saveKey() {
        guard let panel, panel.current?.needsKey ?? true else { return }
        let account = AgentKeys.account(panel.provider)
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        // Only when it changed: an empty field mustn't keep rewriting.
        guard trimmed != (secrets.get(account) ?? "") else { return }
        do {
            try secrets.set(account, trimmed)
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
        defer { testing = false }
        do {
            let answer = try await page.call("test-agent", arg: panel.json(key: key)) as? [String: Any]
            result = (answer?["ok"] as? Bool ?? false, answer?["message"] as? String ?? "No answer.")
        } catch {
            result = (false, error.localizedDescription)
        }
    }
}
#endif
