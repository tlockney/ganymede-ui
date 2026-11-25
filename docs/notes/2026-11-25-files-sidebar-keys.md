## 2026-11-25, Files sidebar keyboard navigation (#787)

The Mac's Files sidebar `List` had no selection, so it never took focus
and the keyboard did nothing. It, and the iPad's Files tab, now have one:
a single optional `FolderEntry` selection, with `.tag(entry)` on each file
row and on each folder's label row (only entries are selectable; the
offline line, "No files" and errors are not). Up and Down are the list's
own and only move the selection. Return, Right and Left are ours
(`SidebarKeys`, an `onKeyPress` on the list, key-down only, no modifiers):

- Return opens the selected file (if this place can open it) or toggles
  the selected folder.
- Right expands a collapsed folder, Left collapses an expanded one. Both
  set a definite value, never toggle, so the list's own handling of the
  arrows can't undo them. On anything else they return `.ignored`.

`SidebarKeyAction.action(for:selected:isExpanded:)` makes the decision as
a pure function (`SidebarKey.swift`, in both test targets in
`project.yml`); `SidebarKeyTests` covers every key against a file, an
expanded and a collapsed folder and no selection.

Rows stopped being `Button`s: a button inside a selectable list can keep
the click from selecting the row. A file row and `FolderRowLabel` are now
the row's content with a tap gesture running along with the list's, which
selects the row and opens the file or toggles the folder. A file that
can't open in this place can still be selected. Both keep a button's
accessibility (the trait and a default action; a folder's Expanded or
Collapsed value and hint). Selection also follows a rename or delete of
the selected row by clearing.

The iPad kept each folder's expansion in `IPadFolderContents`; it is now
one `Set<URL>` in `IPadSidebar`, handed down in `IPadFolderActions` as the
Mac's `isExpanded`, so the key handler can reach any folder. Expansion
now also survives switching navigator tabs, not only while the folder's
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
