/**
 * Offsets in code points and in UTF-16 units. The kernel counts code
 * points, as Jupyter's `cursor_pos` does; CodeMirror and JavaScript strings
 * count UTF-16 units, so every character outside the Basic Multilingual
 * Plane (emoji, `𝐚`) is two units.
 */
import { Text } from '@jupyterlab/coreutils';

/** A code point offset into `code` as a string offset, clamped to the text. */
export function codePointToOffset(code: string, offset: number): number {
  if (offset <= 0) return 0;
  return Math.min(Text.charIndexToJsIndex(offset, code), code.length);
}

/** A string offset into `code` as a code point offset, clamped to the text. */
export function offsetToCodePoint(code: string, offset: number): number {
  if (offset <= 0) return 0;
  return Text.jsIndexToCharIndex(Math.min(offset, code.length), code);
}

/** The number of code points in `code`. */
export function codePointLength(code: string): number {
  return offsetToCodePoint(code, code.length);
}
