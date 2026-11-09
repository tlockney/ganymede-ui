/** The module name cdp-kernel's `jupyter.widget` models ask for (#417), with any version. */
export const ANYWIDGET_MODULE = 'anywidget';
/** The version the app registers it under; `*` from the kernel matches it. */
export const ANYWIDGET_VERSION = '0.9.0';

/**
 * The frame's changes without the keys that start with `_`: those wire the
 * model (`_view_name`, `_model_module`, `_esm`...), and a frame that set
 * them could pick an unsandboxed view for the model's next render.
 */
export function ownKeys(changes: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(changes).filter(([key]) => !key.startsWith('_')));
}
