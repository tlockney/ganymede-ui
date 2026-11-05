/**
 * Which toolbar items move into its "…" menu (#201), from their widths
 * and priorities.
 */

/** The gap between toolbar items (`.toolbar-trailing`). */
export const GAP = 8;
/** The "…" button's width, before it has been drawn. */
export const MORE_WIDTH = 28;

/**
 * Which items to hide so the rest fit in `room`: the lowest priority
 * first, until they fit beside the "…" button. Items with an infinite
 * priority never hide. Pure.
 */
export function overflowing(
  items: { key: string; priority: number; width: number }[],
  room: number,
  moreWidth = MORE_WIDTH,
): Set<string> {
  const width = (shown: typeof items) =>
    shown.reduce((sum, i) => sum + i.width, 0) + GAP * Math.max(0, shown.length - 1);
  const hidden = new Set<string>();
  if (width(items) <= room) return hidden;
  const order = items
    .filter(i => Number.isFinite(i.priority))
    .sort((a, b) => a.priority - b.priority);
  for (const item of order) {
    hidden.add(item.key);
    const shown = items.filter(i => !hidden.has(i.key));
    if (width(shown) + GAP + moreWidth <= room) break;
  }
  return hidden;
}
