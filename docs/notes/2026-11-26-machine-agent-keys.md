## 2026-11-26, Agent keys in a connected machine's window (#849)

A machine's window had no `agentKeys` handler, so the page fell back to
`BrowserCredentialStore`: a key typed for the agent there went into the
app origin's web storage, and the Keychain key from a This Mac window
wasn't there. `Place.allows(.agentKeys)` is now true for a machine, so
both kinds of window read and write the same Keychain items.

It is safe because the handler's own check, `AgentKeys.trusted`, takes
only the main frame on the page's origin, and the only pages on that
origin a machine's window loads are the app's own (`Place.allowsLoading`,
#842). A machine's files and nbconvert pages come through the mount with
`sandbox allow-scripts`, so they run in an opaque origin and are refused,
as this device's `/files` pages are. A test now covers the opaque origin.

Keys the released build kept in web storage from a machine's window
would otherwise stay there, unseen and unremovable. `adoptBrowserKeys`
moves each into the Keychain when the Keychain has none for that
provider, then clears it from web storage; one the Keychain refuses
stays for the next page load.

Part of ganymede#965, section 2. By-hand checks on #399 (Mac) and
#273 (iPad and iPhone).
