## 2026-11-11, Notebook widgets (#436)

Phase 4.5 of the device API. A WidgetKit extension, `GanymedeWidgets` on
the Mac and `GanymedeWidgets-iOS`, is embedded in both apps. It shows
what a notebook published with `device.widget.update(kind, content)`:
title, rows, tint and sparkline. Editing the widget picks a notebook and
kind from what has been published (an `AppEntity` over the App Group's
`ganymede.device.widgets`).

It is a spike, off until Settings › Device › Notebook Widgets is on. The
switch lives in the App Group, so the widget reads it too and, while it
is off, says how to turn it on. With it on, each new window's bridge
calls `addWidgets` with a `UserDefaultsWidgetStore` on the group's
defaults, which reloads the widget's kind on each change. A notebook
already open keeps the bridge it had, so the switch applies to notebooks
opened afterwards.

The widget never runs the notebook. Background refresh needs a copy of
the notebook in the group and the runner inside the widget's time
budget, so it is #494, with tap-to-open, the switch for open notebooks,
and the by-hand checks.

The logic that picks what to show (`WidgetState`) is apart from WidgetKit
so the unit tests cover it. iOS signing needs `IOS_WIDGETS_PROFILE`,
which `release-ios.sh` now requires with the other profiles.
