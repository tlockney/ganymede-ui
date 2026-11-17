## 2026-11-17, Mac updates install the newest release, not one found earlier (#666)

Thomas saw the Mac app update to the next release, not the newest. The
feed was right: `releases/latest/download/appcast.xml` held only v0.12.1.
Sparkle 2 keeps an update it found for the rest of the process, and later
checks show that one again without reading the feed
(`-[SPUUpdater checkForUpdatesWithDriver:…]` resumes `_resumableUpdate`
when there is one). An app left running across 0.12.0 and 0.12.1, three
hours apart, offered 0.12.0 behind the toolbar button, and clicking it
showed and installed 0.12.0. Remind Me Later held it the same way.

Sparkle has no call to drop a held update, so `AppUpdater.checkForUpdates`
asks `UpdateCheck.startsFresh` (in UpdateFeed.swift, so the test target
builds it without Sparkle) and starts a new `SPUStandardUpdaterController` before a check the person
starts (Check for Updates…, Check Now, the toolbar button). It does when
no session is open, or when the open session only holds the toolbar
button's update, not yet downloaded. A running check, a download, a
downloaded update or a window the person has seen carries on. The old
updater's KVO observations are invalidated first so its last changes
don't reach the new state. A new updater starts its schedule a run loop
later and skips it while the check runs, then schedules after it.

Not fixed: with automatic downloads on, Sparkle stages the installer to
run at quit, and a new updater resumes that installer. A release that
ships after the download is found on the next check after that install.
A downloaded update with no installer yet (the person put off the
authorization prompt) is downloaded again by the new updater. While the
toolbar button waits, scheduled checks don't run, and after Remind Me
Later they resume the held release, so the button and badge name the
release found first until clicked; clicking installs the newest.

Tests cover the decision (`UpdateCheckTests`). That `checkForUpdates`
acts on it, with a real Sparkle updater, is checked by hand (ui#399).
