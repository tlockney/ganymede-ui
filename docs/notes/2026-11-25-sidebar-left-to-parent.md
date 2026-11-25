## 2026-11-25, Files sidebar: Left to parent, iPad keyboard hand-back (#791)

Follow-up to #787. Three parts:

**← on a file or a collapsed folder selects its parent folder**, as in
Finder; at the top level it does nothing, and an expanded folder still
collapses first. `SidebarKeyAction` has a `.selectParent` case, chosen
for Left when the row isn't an expanded folder and has a parent
(`hasParent`). The parent comes from a new `SidebarTree` (in
`SidebarKey.swift`, so both test targets already build it): each
folder's contents (`FolderContents` on the Mac, `IPadFolderContents` on
the iPad) report every listing through a `listed` action, and the tree
keeps, per folder URL, the rows it listed and, per row, the folder
holding it. The folder's URL is the one its contents were given, which
is the folder row's own `url`, so the parent built from it is equal to
the row's `.tag` and the list highlights it; nothing is rebuilt from a
path, which could differ by a trailing slash. A row in the root folder
has no parent. `SidebarKeys` asks the sidebar for the parent and selects
it through the same setter a click uses (on the iPad, only while Files
shows).

**A reload that drops the selected row clears the selection.** After a
listing changes (`listed` skips one equal to the last), the sidebar asks
the tree whether the selected row is still listed: its folder lists it
and each folder above lists the one below, up to the window's folder. A
file deleted or renamed outside the app, or anything inside a folder a
reload dropped, is not, so the selection goes and Return can't act on a
stale row. The tree is reset with the selection when the window's
folder changes. The rename and delete paths keep clearing it at once,
as before.

**iPad: a tap that opens a notebook or data file gives the keyboard to
the page**, as the Mac's click does with `returnKeyboardToPage`. The
row's tap calls a new `openByTap` action: `open`, then, in the iPad's
tabbed sidebar only, `becomeFirstResponder` on the page's web view
(`PageModel.webView`) on the next turn of the run loop, as
`TerminalSurface` defers its focus changes, and only when the web view
is in a window and not hidden. The iPhone's list is unchanged (it pushes
the notebook over the list). VoiceOver's default action and the context
menu's Open still call `open` alone, as on the Mac.

`SidebarKeyTests` covers the new rows: Left inside a folder on a file
(openable or not) and a collapsed folder selects the parent, an
expanded folder still collapses, the top level and no selection do
nothing, and having a parent changes no other key. The `SidebarTree`
tests cover the parent of rows at each depth, none at the top or for an
unlisted row (or the same URL as a folder), a reload dropping a file, a
reload dropping a folder with rows nested two deep, a folder renamed
outside the app, the same listing recorded again, and URLs that form a
loop. The views' wiring (the `listed` calls, the selection setter, the
web view focus) has no unit tests; Swift doesn't build here.

By-hand checks, for #399 (Mac) and #273 (iPad):

1. Mac: expand a folder, select a notebook in it, press ←: the folder's
   row is selected. ← again: the folder collapses. ← again: its parent
   (if any) is selected; at the top level nothing happens.
2. Mac: select a notebook at the top level and press ←: nothing changes.
3. Mac: select a file, delete it in the Finder, bring the app to the
   front: the selection goes; Return then does nothing.
4. iPad with a hardware keyboard, Files tab: the same as 1 to 3 (for 3,
   delete it in the Files app and come back).
5. iPad with a hardware keyboard: tap a notebook, press ↓: the notebook
   moves, not the sidebar. Tap a folder: the keyboard stays in the
   sidebar.
6. iPad without a hardware keyboard: tapping a notebook doesn't bring up
   the on-screen keyboard.
7. iPhone: tapping a notebook opens it as before.
