## 2026-11-17, secrets design note (#650)

Thomas decided on #570 that `device.secrets` keeps one shared set of
named secrets, granted per notebook and per name, instead of the
per-notebook store built in ganymede-device#113. The design is in
[packages/device/docs/secrets.md](../../packages/device/docs/secrets.md).

The apps never called `addSecrets()`, so there is nothing to migrate.
Moving the notebook out of the keychain account removes the pending
rename machinery: a rename now only moves ledger rows, which
`PermissionLedger.move` already does. Read and change access are
separate ledger capabilities (`secrets:<name>`, `secrets.set:<name>`),
following the `shortcuts:<name>` pattern, so a notebook allowed to read
a credential can't swap it for one its author controls. Dropping access
when a notebook changes outside the app reuses #584's file stamps rather
than adding a second mechanism, so the Swift work waits on #584.

docs/device.md, plan.md, phase-3.md and protocol.md now point to the
note where they said "per notebook". The generated device table and
reference.md still describe the package as built; the TypeScript pull
request changes them.
