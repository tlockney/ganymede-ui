## 2026-11-07, the device prompt names its notebook (#389)

The browser's device prompt said "A cell asks to use this device." With
several notebooks open in tabs, that didn't say which. `promptClick`
takes an `asker` read when each prompt shows, and the notebook pane
passes the file's current name and the kernel's display name, so a
renamed notebook is named as it is now. The other half of #389, a
preview of the text `clipboard.writeText` would copy, needs the text in
ganymede-device's `ClickRequest` first (tlockney/ganymede-device#74).
