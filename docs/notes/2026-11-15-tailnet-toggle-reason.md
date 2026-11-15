## 2026-11-15, Tailnet toggle says why it is off (#632)

Settings › General › Tailnet greyed out **Share on my tailnet** until a
login was listed under "Let in without the token", and said nothing, so
the toggle looked broken. Now a caption under it asks for at least one
Tailscale login while the toggle is off and the list is empty.

When the list is empty and Tailscale knows who this Mac is signed in as,
a **Use you@example.com** button beside the field fills it in. It only
fills the field: Apply still saves it, and the toggle enables as soon as
the field holds a login. The login comes from `tailscale status --json`
(`Self.UserID`, then that entry's `LoginName` in `User`), read when the
section opens; without Tailscale the button doesn't appear.
Tested in `AppTailnetTests.testOwnLogin`; the view itself is not tested.
