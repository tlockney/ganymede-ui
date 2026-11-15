## 2026-11-15, Tailnet toggle says why it is off (#632)

Settings › General › Tailnet greyed out **Share on my tailnet** until a
login was listed under "Let in without the token", and said nothing, so
the toggle looked broken. Now a caption under it asks for at least one
Tailscale login while the toggle is off and the list is empty.

When the list is empty and Tailscale knows who this Mac is signed in as,
a **Use Mine** button beside the field fills it in (its tooltip names
the login). It only
fills the field: Apply still saves it, and the toggle enables as soon as
the field holds a login. The login comes from `tailscale status --json`
(`Self.UserID`, then that entry's `LoginName` in `User`), read when the
section opens; without Tailscale, or on a tagged Mac, the button doesn't
appear.
Tested in `AppTailnetTests.testOwnLogin`; the view itself is not tested.

With a login listed, turning sharing on then failed with "Tailscale isn’t
connected" on a connected Mac. The Tailscale app's binary
(`/Applications/Tailscale.app/Contents/MacOS/Tailscale`, which
`/usr/local/bin/tailscale` also execs) acts as the CLI only when its
environment looks like a shell (`TERM` or `SHLVL` set). Started from the
app, with neither, it tried to start its GUI, printed "The Tailscale GUI
failed to start: … (Tailscale.CLIError error 3.)" to stdout and exited 0,
so the JSON parse failed. Checked on Thomas's Mac (standalone Tailscale):
`env -i … status --json` prints that line; adding `TAILSCALE_BE_CLI=1`
gives the JSON. The app now sets `TAILSCALE_BE_CLI=1` for every
`tailscale` it runs (status, serve, the remote editor's device list), and
a failed status check adds what Tailscale printed to the message.
