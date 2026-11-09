## 2026-11-09, The device permission ledger in the apps (#383)

ganymede-device's ledger needs to know which notebook a call comes from,
but a `device` call carries only its kernel page's `owner` number. The
UI page knows each session's notebook path and the kernel page knows each
kernel's owner, so each tells Swift its half: the UI page posts
`{ kernel, op: 'notebook', path }` on every session start and update
(`NotebookSessionClient`), the kernel page posts `{ kernel, op: 'owner',
owner }` when it starts a kernel, and `KernelHost` calls `setNotebook`
once it has both. Neither message goes on to the other page.

Paths are made absolute against the app server's root, so an answer
keeps across launches and folder changes. Renames come from the contents
manager's `fileChanged` and from the iPad sidebar's `file-moved`
command; a folder rename moves every notebook under it. A rename in the
Finder isn't seen, and the notebook asks again.

Each window has its own bridge and ledger, and owners restart at 1 in
each kernel page, so the ledgers can't be one object. ganymede-device#86
made ledgers on one store read it on each use instead, which also lets
Settings › Device use a ledger of its own.

The prompt reuses ganymede-device's `SystemDialogPresenter` action
sheet, so it looks like the other `device` dialogs, one at a time.
Open-time prompts (from `metadata.ganymede.device`) offer Allow, Don't
Allow and Not Now, since "once" means nothing before a call.
