## 2026-11-25, Folder rows expand on click (#786)

In the Files sidebar on the Mac, iPad and iPhone, a folder expanded only
from its disclosure arrow; clicking its name did nothing. Now a click or
tap anywhere on the row toggles it, as in VS Code's Explorer. File rows
already open on one click, and a folder has nothing to open in place
(Open in New Tab stays in its menu), so one click toggling a folder
matches them.

`FolderRowLabel` is the folder's label on both: a plain button over the
whole row that toggles the `DisclosureGroup`'s binding. The Mac keeps
using the per-window stored expansion; the iPad's tree, which used
`DisclosureGroup`'s own state, now keeps a set of expanded URLs per
folder view so the label can toggle it. Like before, that state lasts
only while the view does.

Nothing here is built or run in CI beyond compiling, and SwiftUI view
wiring has no unit test, so the by-hand checks are on #399 (Mac) and
#273 (iPad, iPhone): click or tap toggles, the arrow still does, the
Mac keeps expanded folders across launches, the context menu still
opens, and VoiceOver reads the state.

Keyboard navigation (arrow keys, Right/Left to expand and collapse)
needs the sidebar list to take a selection, which changes how file rows
open; it is #787.
