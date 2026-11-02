## 2026-11-02, Agent keys in the Keychain (#166)

In the Mac and iPad apps, the agent's API keys now live in the Keychain instead of the web view's storage. The Settings sheet hides "Remember the key on this device" there, and Ganymede > Agent Settings… (⌥⌘,) opens it on the Mac.

Notes:

- The page reads keys through a `WKScriptMessageHandlerWithReply` named `agentKeys`, so `postMessage` returns a promise with the app's answer. `KeychainCredentialStore` in `packages/agent/src/settings.ts` is the page's side. `pageKeyStore()` picks it whenever the handler exists, and falls back to `BrowserCredentialStore` otherwise.
- The handler answers only the main frame, on the scheme, host and port of the URL the app loaded. Output frames, a page from another site, and the hidden kernel web view (which has no such handler) get an error or nothing. `WKSecurityOrigin` reports a default port as 0, so the check treats 0 as 80 or 443.
- Items are `agent-key.<provider>` under the app's Keychain service. Only the four providers in `PROVIDERS` are accepted, so the page can't read the SSH key or remote tokens that sit in the same service.
- ⌘, already opens the app's own Settings window (remotes), so the menu item uses ⌥⌘,. The notification goes to every window's web view, and only the key window acts on it.
- `list()` asks for each known provider in turn rather than enumerating the Keychain. That keeps the handler to two operations.
