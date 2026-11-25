## 2026-11-25, Files sidebar keyboard navigation (#787)

The Mac's Files sidebar `List` had no selection, so it never took focus
and the keyboard did nothing. It, and the iPad's Files tab, now have one:
a single optional `FolderEntry` selection, with `.tag(entry)` on each file
row and on each folder's label row (only entries are selectable; the
offline line, "No files" and errors are not). Up and Down are the list's
own and only move the selection. Return, Right and Left are ours
(`SidebarKeys`, an `onKeyPress` on the list, key-down only; ⌘, ⌥, ⌃ and ⇧
make a press not ours, but Caps Lock and the keypad and function flags
the arrow keys carry don't):

- Return opens the selected file (if this place can open it; otherwise it
  is left alone) or toggles the selected folder.
- Right expands a collapsed folder, Left collapses an expanded one. Both
  set a definite value, never toggle, so the list's own handling of the
  arrows can't undo them. On anything else they return `.ignored`.

`SidebarKeyAction.action(for:selected:isExpanded:)` makes the decision as
a pure function (`SidebarKey.swift`, in both test targets in
`project.yml`), with `SidebarKey(key:modifiers:)` for which presses count;
`SidebarKeyTests` covers every key against a file (openable or not), an
expanded and a collapsed folder and no selection, and the modifier cases.

Rows stopped being `Button`s: a button inside a selectable list can keep
the click from selecting the row. A file row and `FolderRowLabel` are now
the row's content with a tap gesture running along with the list's, which
selects the row and opens the file or toggles the folder. A file that
can't open in this place can still be selected. Both keep a button's
accessibility (the trait and a default action; a folder's Expanded or
Collapsed value and hint). On the Mac a click that opens a notebook or data file hands the keyboard
back to the page (`returnKeyboardToPage`, as the bottom panel does), so
Down and Return then act in the notebook. A rename or delete clears the
selection when it is the renamed or deleted row or inside it (a path
prefix with a `/` boundary). A reload that no longer lists the selected
row does not clear it; Return on it then does what a stale row does.
The selection is also cleared when the page's open path changes away
from it (the page renamed or moved the open notebook). A file that can't
open in this place is dimmed (the others keep the list's own colours),
reads "Can't open here" to VoiceOver and isn't a button there.

On the iPad a tap that opens a notebook does not hand the keyboard back
to the page: the app has no existing way to do it there (the Mac's
`returnKeyboardToPage` is AppKit), so it is a by-hand check below.

The iPad kept each folder's expansion in `IPadFolderContents`; it is now
one `Set<URL>` in `IPadSidebar`, handed down in `IPadFolderActions` as the
Mac's `isExpanded`, so the key handler can reach any folder. The iPad's list is shared by
every navigator tab, so it has a selection and keys only while Files
shows, and a tab change clears the selection. Expansion now also survives switching navigator tabs, not only while the folder's
view lives. The iPhone's list shares the code but has no selection (its
binding reads nil and ignores writes): a row there only opens or toggles.

Not done: Left on a file or a collapsed folder doesn't select its parent
folder; it needs the parent's entry from the tree, which the rows don't
have, so the key is ignored.

Swift can't build or run here, and the views have no unit tests, so the
by-hand checks are for #399 (Mac) and #273 (iPad):

1. Mac: click in the Files sidebar, then press ↑ and ↓: the selection
   moves, and no file opens.
2. Mac: select a collapsed folder and press →: it expands. Press → again:
   nothing changes. Press ←: it collapses; ← again does nothing.
3. Mac: Return on a selected notebook opens it; Return on a selected
   folder expands, then collapses it. Return on another file opens it in
   the editor window.
4. Mac: click a file: it opens and the row is selected. Click a folder:
   it toggles and the row is selected. The arrow still toggles.
5. Mac: right-click rows: the context menu still shows for files and
   folders. Rename or delete the selected row: no stale selection stays.
6. Mac: with VoiceOver, a file row reads as a button and VO+Space opens
   it; a folder reads Expanded or Collapsed and VO+Space toggles it.
7. iPad with a hardware keyboard, Files tab: the same as 1 to 3.
8. iPad: tap a file and a folder, and use the long-press menu: as before.
9. iPhone: tap a file (opens, no row stays highlighted) and a folder
   (toggles).
10. Mac: click a notebook in the sidebar, then press Down or Return: they
    act in the notebook, not the sidebar.
11. iPad: a tap on a folder toggles it exactly once.
12. iPad: select a file in Files, switch to Search or Running, press
    Return: nothing opens. In Search, ← and → move the caret in the Find
    files field.
13. Mac and iPad: with Caps Lock on, → and ← still expand and collapse.
14. iPad with a hardware keyboard: tap a notebook, press Down: the
    notebook moves, not the sidebar.
15. Mac: rename the open notebook from the page: the sidebar keeps no
    stale selection. A machine's text file is dimmed and VoiceOver reads
    "Can't open here".
