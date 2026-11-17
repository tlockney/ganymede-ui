# Secrets: shared named secrets with per-notebook access (design note)

Issue: ganymede-ui#650. Tracking: ganymede-ui#570, item 2. Replaces the
"per notebook" scope in [phase-3.md](phase-3.md) part 2 and the store
built in #113, which the apps never registered.

## Decision

Thomas, 2026-11-17 (ganymede-ui#570): one shared set of named secrets,
with access granted per notebook and per name.

- Each credential is stored once in the keychain under its name
  ("github", "openai"), not once per notebook. Notebooks that depend on
  each other share a credential by asking for the same name.
- A notebook reads a name only after a ledger yes for that notebook and
  that name. Never over a remote kernel.
- Settings lists each secret with the notebooks that may read it and
  when each last read it. Access drops for a notebook that changed
  outside the app or is gone, as host grants do (tlockney/ganymede#767)
  and kept answers will (ganymede-ui#584). Long-unused secrets are
  flagged for deletion.
- A later "project" grouping, if wanted, grants several names at once;
  it is not a second store.

Two worries shape the rest: the keychain filling up with items nothing
uses any more, and notebooks that need the same credential.

## API

The TypeScript surface keeps its four calls and their types:

```ts
device.secrets.get(name): Promise<string | null>
device.secrets.set(name, value: string): Promise<void>
device.secrets.delete(name): Promise<boolean>
device.secrets.list(): Promise<string[]>
```

What changes is what each one may touch.

**Names.** A name is 1 to 64 characters from ASCII letters, digits,
`.`, `_` and `-`, and names are matched without regard to case: "GitHub"
and "github" are one secret. The per-notebook store allowed any 128
UTF-16 code units. A name is now shared and shown in prompts, so
lookalike names (a Cyrillic "і" in "gіthub") and near-duplicates that
differ only in case would both mislead and multiply items. A name
outside the rule fails `failed` before any prompt. The keychain account
is the lowercase form; the label keeps the spelling first saved.
Values stay strings up to 64 KiB as UTF-8.

**Two kinds of access.** Reading a name and changing it are granted
separately, both per notebook and per name, through the ledger:

- Read, ledger capability `secrets:<name>`: `get`.
- Change, ledger capability `secrets.set:<name>`: `set`.
- Delete, ledger capability `secrets.delete:<name>`: `delete`, never
  kept (below).

`<name>` in a capability is always the lowercase form, so "GitHub" and
"github" are one grant; prompts and Settings show the secret's label
instead. The bridge keys each call by its name with
`setLedgerCapability`, as `shortcuts.run` keys by `shortcuts:<name>`,
and all three are narrower than the `secrets` namespace: a kept "deny"
for `secrets` refuses every name, and a kept "always" for `secrets`
lets none through.

**`get(name)`** asks for read access when the notebook has no kept
answer for the name. Once allowed, it answers the value, or `null` when
no secret has that name. The prompt comes before the lookup, so a
notebook learns nothing about which names exist without a yes. When the
name isn't saved and the call came from a window, the prompt also
offers a secure text field ("Enter it now"): the person types the
credential into the app, it is saved under the name, the notebook gets
read access as answered, and `get` answers it. That way a credential
never has to pass through a cell's source or output, where it would be
saved into the `.ipynb`.

**`set(name, value)`** needs change access and replaces an existing
secret's value for every notebook that reads it, so the prompt says so
and names them (below). "Always Allow" is offered, since a notebook
that refreshes an OAuth token has to replace it unattended. Only the
person creates a name: in Settings, or in `get`'s "enter it now"
prompt. A `set` for a name that isn't saved fails `failed` ("no secret
named “github”: add it in Settings › Device") before any prompt, so a
notebook can't squat a name (Security, below; decision 2).

**`delete(name)`** removes the keychain item for everyone and answers
whether there was one. It has its own capability so that refusing a
delete can't block a later `set`: if delete shared `secrets.set:<name>`,
its "Don't Allow" would keep a deny there and stop a token refresh. Its
prompt offers Allow Once and Don't Allow, and Don't Allow answers the
ledger nil (as a dismissed prompt does today), which refuses this call
and keeps nothing; so no ledger change is needed, nothing about delete
is ever kept, and a delete always asks. The usual place to delete is
Settings.

**`list()`** answers, sorted, the names this notebook has a kept read
"always" for that exist now. It never asks, and it never shows names the
notebook hasn't been given: the set of names says which services the
person uses. A kept "deny" for `secrets` makes it fail `denied`.

**`requestAuthorization()`** for `secrets` asks nothing, as for
`shortcuts`: it has no single answer to keep. A notebook can name the
secrets it needs in its metadata, at `metadata.ganymede.device`
(`["secrets:github"]`), and the app asks for read access to each at
open, so a set of notebooks that share credentials can be granted up
front. `DeviceBridge.undecided` keeps only declarations it has a
permission for, so the Swift PR must let `secrets:<name>` through. A bare `"secrets"`
declaration asks nothing, as `shortcuts` does.

### Prompts

Each names the notebook by file name and the secret by its label, made
safe for quotes with `AppLedgerPrompter.quotable`.

- Read: "“Report.ipynb” wants to read the secret “github”". Allow Once,
  Always Allow, Don't Allow, Don't Allow Any Secrets (a kept deny for
  `secrets`). Message: "Always Allow lets this notebook read it until
  the notebook changes outside Ganymede or you revoke it in Settings ›
  Device."
- Read, not saved: the same title, with "No secret named “github” is
  saved on this device." and a secure field; Save and Allow Once, Save
  and Always Allow, Don't Allow.
- Replace: "“Setup.ipynb” wants to replace the secret “github”".
  Message: "Report.ipynb and Sync.ipynb read it and will get the new
  value." (or "No other notebook reads it."). Allow Once, Always Allow,
  Don't Allow.
- Delete: "“Setup.ipynb” wants to delete the secret “github”", with the
  same message. Allow Once, Don't Allow (refuses this call only).

## Keychain layout

One generic password per name:

- `kSecAttrService` `ganymede.device.secrets`; `kSecAttrAccount` the
  lowercase name; `kSecAttrLabel` "Ganymede secret “GitHub”" with the
  name as first saved, so the item reads plainly wherever the system
  lists it.
- `kSecAttrSynchronizable` false: never in iCloud Keychain.
- `kSecAttrAccessible` `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,
  so a headless run can read while the device is locked once it has
  been unlocked since it started; before that a call fails
  `unavailable`. The cost is that an item is readable while the device
  is locked.
- On the Mac, `kSecUseDataProtectionKeychain` true, so the class above
  applies; it needs a signed app.
- `kSecAttrAccessGroup` `<team>.ganymede.device`, shared with the app's
  extensions ([phase-4.md](phase-4.md), part 2), with
  `keychain-access-groups` on the app and each extension.

`KeychainSecretStore` changes in two ways: the account is the
lowercase name, and the store takes a label when it creates an item.
`SecretStore.write(_:to:)` and `KeychainSecretStore.write` have no label
today; `write` gains one, set as `kSecAttrLabel` on `SecItemAdd` and
left alone on `SecItemUpdate`, so a replace keeps the first spelling.
Nothing about a notebook is in the keychain, so a rename or move
touches no item, and `NotebookSecrets`' pending renames (`pendingMoves`, `settle`,
`forgetPendingMoves`) go away.

## Ledger and index

Access is ordinary ledger rows, `(notebook path, secrets:<name>)` and
`(notebook path, secrets.set:<name>)`, with answer `always` or `deny`,
in the App Group store the extensions already read. Notebook paths are
the ledger's: absolute, resolved by `AppKernels.resolve`, following
renames through `notebookMoved`. So the existing Settings list by
notebook shows them too ("Secret “github”", "Change secret “github”"),
with Revoke, and `revoke(notebook:)` drops them with the rest.

Dropping access when a notebook changes is #584's job, not a second
mechanism. #584 is open; what this note needs from it is that each kept
row stores what the app last saw of the file, refreshed on the app's own
saves, and that the stamp includes the inode, as tlockney/ganymede#827
does for host grants (size, modification time and inode). Size and
modification time alone miss a file replaced by one of the same size
with its time set back, which git and archive tools can do; #584's body
also allows a hash, which is fine if refreshed on the app's saves. When
the file no longer matches, every kept row for that path goes, secrets
rows included, and the next call asks again. So secrets depend on #584
landing first. A notebook is gone when its file is missing and its
folder is there; then its rows go when Settings or a call next looks. A
notebook on a volume that isn't mounted, or an iCloud file not yet
downloaded, isn't gone: its rows stay. Settings showing such a notebook
as "Not found" with Revoke is new; nothing in Settings does that today
(PR 3).

The keychain item itself never goes with access: a notebook replaced
in git loses its grant, and the credential waits for the next yes.

What the keychain can't hold cheaply sits in an index in the App Group
suite, one UserDefaults key per fact, so no write rewrites another
process's entries:

- `ganymede.device.secrets.meta.<name>`: a dictionary with when the
  secret was saved and changed, and by which notebook path (or
  "Settings"). Written only by the app, on save and replace.
- `ganymede.device.secrets.read.<name>\u{1F}<notebook path>`: one date,
  that notebook's last read of that name. `<name>` is lowercase; the
  unit separator can't occur in a name and doesn't occur in paths the
  ledger keeps (URLRunPermissions splits its keys on it too).

Reads update their key at most once an hour, so a loop that reads a
token doesn't rewrite UserDefaults on every call. Phase 4 lets
extensions read the App Group and only the app write; read-time keys are
the exception, since a headless read should count as a read. Each
read-time key has one writer at a time in practice (the process running
that notebook), and a write keeps the later of the stored and new
dates, so the worst race loses a time a few seconds apart. Settings
finds read times by prefix in `dictionaryRepresentation()`.
`notebookMoved` renames a notebook's read-time keys with its rows, and
deleting a secret removes its keys.

The keychain is the source of truth for which secrets exist. An item
with no index entry (the index was lost, or the app was deleted and
installed again: the keychain survives that on iOS) lists as "never
read". An index entry with no item is dropped.

## Settings

Settings › Device gains a Secrets section above the per-notebook list:

- One row per secret, by label, with when it was saved and last
  changed, and by which notebook.
- Under it, each notebook with access: its name, "Can read" or "Can read
  and change", and "Last read 3 days ago" or "Never read", each with
  Revoke. A notebook's path is the row's detail, as in the list by
  notebook.
- Add Secret… and, on each row, Change Value…: a name and a secure
  field, so the person can enter or rotate a credential without any
  notebook seeing it. Neither grants any notebook access.
- Delete, with a confirmation naming the notebooks that read it.
- Show Value… on each row asks for the device's own authentication
  (Touch ID, Face ID or the passcode, through `LocalAuthentication`'s
  `.deviceOwnerAuthentication`) and then shows the value until the
  section is left. Values are never shown otherwise.

A secret is flagged "Unused" when nothing has read it for 90 days, or
when no notebook has access and it was saved or last read more than 30
days ago. Flagged secrets sort first with the reason ("Not read since
June", "No notebook can read it"), and the section has Delete Unused,
which lists what it will delete and asks once. Nothing is deleted
without the person.

## Headless runs

A run with no window (Shortcuts' Run Script on Device, the share sheet,
a widget refresh) has no prompter, so:

- `get` answers only with a kept read "always"; otherwise `denied`. The
  "enter it now" path needs a window, so a missing name with a kept
  "always" answers `null`.
- `set` needs a kept change "always", so a token refresh can run
  unattended once the person said so. It never creates a name.
- `delete` is never kept, so it always fails `denied` headless.
- `list` behaves as in a window.
- `hello` lists the secrets methods only when the notebook has a kept
  "always" for some `secrets:` name, and the call checks the name.
  `hello` is the same for every kernel on a bridge today
  (`DeviceBridge.capabilities` takes no owner); a headless bridge runs
  one notebook, so PR 2 makes `hello` take the asking owner and its
  notebook.

## Security

**Replacing another notebook's credential.** The shared model's new
risk: a notebook with change access to "github" could put in a token
for an account its author controls, and the notebooks that read
"github" would then push their data there, or fail in ways that leak
it. Change access is separate from read access and per name; its prompt
says which notebooks read the name; Settings shows who last changed
each secret. A notebook granted read access can't change it. That is
a prompt, not a guarantee: someone who allows "Always" for a changing
notebook trusts it with every reader of that name.

**Squatting a name.** If a notebook could create names, a downloaded
notebook could save "openai" holding its author's key before the person
had saved one, and every notebook later granted "openai" would send its
prompts and data to that account. The read prompt can't help: it shows
the name, not who put the value there. So only the person creates a
name (Settings or "enter it now"), and `set` only replaces; Settings
also shows which notebook last changed each secret. Thomas decided
cells never create names (decision 2).

**Exfiltration.** A notebook allowed to read a name can send the value
anywhere; the grant is the trust decision, and there is no network
policy behind it. The limits are scope and visibility: a notebook reads
only names it was granted, `list` shows only those, the prompt comes
before any lookup, and access goes when the file changes outside the
app, so a pulled or downloaded notebook asks again. The bridge never
logs a value or puts one in an error message, and Settings shows one
only after the device's own authentication. A value printed in a cell is saved in the notebook like any
output; device.md says so.

**Which notebook is asking.** Access is keyed by what the notebook page
tells the bridge each kernel runs. A cell can't change that, but script
in the page can, such as output of a notebook marked trusted, and could
use another notebook's grants. device.md already says so for the
ledger; with secrets it means a credential, so the secrets section
repeats it.

**Remote kernels, never.** Secrets stay out of the remote subset and
the browser fallback. A server kernel's `device` doesn't have them, and
a remote kernel's call answers `unavailable` without a prompt.

**At rest.** Keychain, this device only, never synced, readable after
first unlock. App deletion on iOS leaves items behind; the "never read"
flag is how they come back into view.

## Migration

Nothing to migrate: the apps never called `addSecrets()`, so no
keychain item or pending rename exists outside tests. The change
replaces `NotebookSecrets` with a shared store, drops its pending-rename
key, and changes the account format; the service name stays.

## Pull requests

1. TypeScript types and protocol: TSDoc and `support.ts` notes for the
   shared model (names, read and change access, `list`), reference.md
   regenerated, protocol.md "Secrets" rewritten from this note.
2. Swift store and ledger, after #584: `SharedSecrets` and the index in
   place of `NotebookSecrets`, the lowercase account, a label parameter
   on `SecretStore.write` and `KeychainSecretStore.write` set as
   `kSecAttrLabel` on create, the `secrets:`, `secrets.set:` and
   `secrets.delete:` ledger capabilities (lowercase names), declared
   `secrets:<name>` at open, `hello` per owner with the headless rule,
   and XCTest
   against a fake keychain: two notebooks share a name, a third can't
   read it, change access is separate, a changed file drops access, a
   rename keeps it.
3. Apps and Settings: `addSecrets()` in the app's bridges and the
   extensions' with the access group and entitlement, the prompts in
   `AppLedgerPrompter` (`title` and `describe` for the three
   capabilities, delete's Don't Allow answering nil),
   `DeviceGrants.name(_:)` in DeviceSettings.swift for the per-notebook
   list, Settings' Secrets section with Add, Change Value, Delete and
   Unused, and "Not found" for a notebook whose file can't be reached
   now.
4. Docs: docs/device.md's secrets rows and a Secrets section, with an
   "Unreleased" note until the apps' release.

## Decisions

Thomas answered the open questions on 2026-11-17 (ui#650):

1. Names: ASCII letters, digits, `.`, `_` and `-`, up to 64, matched
   without regard to case. Kept.
2. Creating names: only the person creates a name (Settings or the
   "enter it now" prompt); cells only replace.
3. Change access keeps "Always Allow", so a notebook can rotate a token
   unattended.
4. "Unused" thresholds: 90 days unread, 30 days with no notebook
   allowed.
5. Settings shows a value only after the device's own authentication.
