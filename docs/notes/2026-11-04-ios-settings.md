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
- Settings save 0.4 s after the last change (`.task(id:)` cancels the
  older wait) and again on leaving the screen, since leaving cancels that
  wait. Only a change the person made saves: loading doesn't write back.
  The page runs the saves in the order sent, so the last one wins. The
  key saves 0.6 s after the last keystroke, on leaving, and before a
  provider switch, which loads the other provider's key into the field.
  The key field shows for every provider, optional for a local server,
  as in the page's sheet.
- A change cancels a running Test, whose answer would be for the old
  settings.
- Before the page has a backend (the server didn't start, a remote is
  unreachable) the Agent screen says it is waiting for the page.
- `agentSettingsFrom` defaults a model or server URL that is blank after
  trimming: a blank server URL would make the OpenAI client send a local
  test's key to api.openai.com.
- Keyboard Shortcuts still opens the page's sheet, from the Settings
  sheet's `onDismiss`: rebinding keys lives in the page, and the
  shortcuts are the page's. It is off unless a notebook is on screen: on
  the iPhone the page is parked behind the list until one is pushed. The
  page's Connect sheet still shows if the app's own server can't be
  reached.
- Untried on a device: no Swift toolchain in the container, so the macOS
  CI job is the first build.
