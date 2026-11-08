## 2026-11-08, Shortcuts actions on a shared action layer (#302)

`NotebookActions` is one Swift type for the operations Shortcuts and the
coming `ganymede://` URLs (#303) offer, named after the server's MCP
tools. It calls the app's in-process server over loopback REST with the
app's token, so ganymede-ffi gained no calls. Opening a notebook is the
app's own: the intent adds the file to `OpenRequests`, the path Finder
opens take.

REST alone could not run cells and get their outputs: the execute
endpoint answered once the batch was queued, the outputs reached the
file only with the room's autosave a second later, and the room's state
reaches clients only over the yrs websocket. ganymede#566 added `wait`,
which answers with the cells once they ran; this is why the app's
`GANYMEDE_REF` moved. MCP over loopback was the other choice: it already
waits, but it answers with text rendered for a model, and #304 makes MCP
a setting the person controls, which the actions must not depend on.

The execute endpoint checks each cell's MurmurHash2 against the room's
source, and the action layer reads sources from the file. A notebook
open in a window with unsaved edits gives a mismatch; the layer reads the
file again after the autosave and retries once.

The "save results" option the issue named is not offered: cells that
run in the room are saved with it, as an agent's are.
