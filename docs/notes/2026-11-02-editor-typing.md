## 2026-11-02, Line numbers, auto-indent and pairing in the editor (#122)

The apps' text editor now numbers lines, indents on Return, and pairs brackets and quotes. This finishes #122.

Notes:

- The typing help is plain functions on the text (`CodeEditing`), so the Mac's `NSTextViewDelegate` and iOS's `UITextViewDelegate` share it and XCTest covers it without a text view. Each returns the replacement and the selection after, or nil to let the keystroke through.
- On the Mac the edit goes through `shouldChangeText` / `replaceCharacters` / `didChangeText`, which the text view registers for undo like typing. On iOS it goes through `UITextInput.replace(_:withText:)` for the same reason. Both skip input methods with marked text, and undo and redo, which would otherwise pair a bracket again.
- iOS reports backspace only as an empty replacement of one character. The editor treats it as backspace when the range ends at an empty selection.
- The indent comes from the file: tabs if more lines start with a tab, else the narrowest space indent (2 or 4). An empty file uses 4 spaces for Python and plain text, 2 for the rest.
- Quotes pair only in code, not in Markdown or plain text, where they are mostly apostrophes; and not after a letter, digit or the same quote, so `don't` and Python's `"""` type as written.
- Line numbers count logical lines (a wrapped line has one number), from the visible glyph range, so a redraw costs the visible lines plus a newline count up to the first.
