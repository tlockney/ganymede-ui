## 2026-11-04, one Settings screen on iPad and iPhone (#210)

- The gear button (⌘, with a keyboard, or Settings in the notebook's ⋯
  menu) opens one native screen: the Kernels, Remotes and SSH key
  sections `RemotesView` already had, then Agent, then Keyboard
  Shortcuts while a hardware keyboard is attached (`GCKeyboard`). The
  Mac's Settings window is unchanged.
- The agent's settings stay the page's, in `localStorage`, so the page,
  the agent and the browser keep reading them from one place. The app
  reaches them with a new `window.ganymede.call(id, arg)` that answers
  with a value: `agent-settings`, `save-agent-settings`, `agent-models`
  and `test-agent` (`src/lib/native-agent.ts`). Swift calls it with
  `callAsyncJavaScript`'s completion-handler form: the async form traps
  when the answer is null.
- The app writes the API key straight to the Keychain item
  (`agent-key.<provider>`) that the page's `KeychainCredentialStore`
  reads through `agentKeys`; that store has no cache, so the page sees
  the new key on its next read. Test sends the key typed, not yet saved.
- Settings save 0.4 s after the last change and the key 0.6 s after the
  last keystroke (`.task(id:)` cancels the older wait), and the key also
  on leaving the screen or switching provider, since a switch loads the
  other provider's key into the field.
- `agentSettingsFrom` defaults a model or server URL that is blank after
  trimming: a blank server URL would make the OpenAI client send a local
  test's key to api.openai.com.
- Keyboard Shortcuts still opens the page's sheet, after the Settings
  sheet has gone: rebinding keys lives in the page, and the shortcuts are
  the page's. The page's Connect sheet still shows if the app's own
  server can't be reached.
- Untried on a device: no Swift toolchain in the container, so the macOS
  CI job is the first build.
