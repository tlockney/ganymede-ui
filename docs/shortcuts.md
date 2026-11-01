# Keyboard shortcuts

The app binds JupyterLab's notebook shortcuts plus a few of its own. To
see them in the app, press `H` in command mode, click the keyboard button
in the toolbar, or choose Help › Keyboard Shortcuts in the Mac app.

Command mode is when a cell is selected but not being edited (press `Esc`
to get there); edit mode is when the cursor is in a cell (press `Enter`).
Single-letter shortcuts such as `M` (make the cell Markdown) work only in
command mode; in edit mode they type the letter. The sheet says this too,
and the toolbar's cell type picker changes a cell's type with the mouse.

## Changing a shortcut

Every shortcut can be rebound in the same sheet. On a row, + records a
keystroke to add, × removes a binding, and Reset puts the row's defaults
back; Reset All clears every change. Outside command mode, a single
character (with or without Shift) types into the cell, so the sheet asks
for ⌘, ⌃ or ⌥ (Ctrl or Alt elsewhere) with it, and it refuses a binding
another shortcut already has where both could fire.

Changes are kept in the browser's local storage (`ganymede-ui:shortcuts`),
so they belong to one browser and one origin: the same app served from
another address starts with the defaults. The Mac and iPad apps keep their
origin across launches, so changes there last.

## Defaults

<!-- shortcuts:start -->

### Notebook

| Action                 | Mac   | Windows, Linux |
| ---------------------- | ----- | -------------- |
| Run cell, select below | `⇧↩`  | `Shift+Enter`  |
| Run cell               | `⌘↩`  | `Ctrl+Enter`   |
| Run cell, insert below | `⌥↩`  | `Alt+Enter`    |
| Find                   | `⌘F`  | `Ctrl+F`       |
| Find next              | `⌘G`  | `Ctrl+G`       |
| Find previous          | `⌘⇧G` | `Ctrl+Shift+G` |

### Command mode

| Action                  | Mac        | Windows, Linux          |
| ----------------------- | ---------- | ----------------------- |
| Edit cell               | `↩`        | `Enter`                 |
| Select cell above       | `↑`, `K`   | `Up`, `K`               |
| Select cell below       | `↓`, `J`   | `Down`, `J`             |
| Extend selection above  | `⇧↑`, `⇧K` | `Shift+Up`, `Shift+K`   |
| Extend selection below  | `⇧↓`, `⇧J` | `Shift+Down`, `Shift+J` |
| Select all cells        | `⌘A`       | `Ctrl+A`                |
| Insert cell above       | `A`        | `A`                     |
| Insert cell below       | `B`        | `B`                     |
| Delete cells            | `D` `D`    | `D` `D`                 |
| Cut cells               | `X`        | `X`                     |
| Copy cells              | `C`        | `C`                     |
| Paste cells below       | `V`        | `V`                     |
| Undo cell operation     | `Z`        | `Z`                     |
| Redo cell operation     | `⇧Z`       | `Shift+Z`               |
| Move cells up           | `⌃⇧↑`      | `Ctrl+Shift+Up`         |
| Move cells down         | `⌃⇧↓`      | `Ctrl+Shift+Down`       |
| Change to code          | `Y`        | `Y`                     |
| Change to Markdown      | `M`        | `M`                     |
| Change to raw           | `R`        | `R`                     |
| Show keyboard shortcuts | `H`        | `H`                     |

### Edit mode

| Action                        | Mac         | Windows, Linux  |
| ----------------------------- | ----------- | --------------- |
| Leave the cell (command mode) | `Esc`, `⌃M` | `Esc`, `Ctrl+M` |
| Complete                      | `⇥`         | `Tab`           |
| Show documentation            | `⇧⇥`        | `Shift+Tab`     |

### App

| Action | Mac  | Windows, Linux |
| ------ | ---- | -------------- |
| Save   | `⌘S` | `Ctrl+S`       |

<!-- shortcuts:end -->
