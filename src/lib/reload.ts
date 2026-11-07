/**
 * Reloading the page with unsaved edits. A browser asks first through
 * `beforeunload`, but the Apple apps' web view has no public delegate
 * method for that prompt and reloads without asking (#375). So a reload
 * the page starts itself saves every open notebook first, and asks only
 * when one can't be saved.
 */

/** Saves a notebook if it has edits; true when nothing is left unsaved. */
export type ReloadGuard = () => Promise<boolean>;

const guards = new Set<ReloadGuard>();

/** Registers `guard` until the returned function is called. */
export function guardReload(guard: ReloadGuard): () => void {
  guards.add(guard);
  return () => guards.delete(guard);
}

export const UNSAVED_RELOAD =
  'Some notebooks have changes that couldn’t be saved. Reload anyway and lose them?';

/**
 * Saves what the guards can, then reloads, unless something stayed
 * unsaved and the user says not to. Resolves to whether it reloaded.
 */
export async function reloadPage(
  reload: () => void = () => window.location.reload(),
  ask: (message: string) => boolean = message => window.confirm(message),
): Promise<boolean> {
  const saved = await Promise.all([...guards].map(g => g().catch(() => false)));
  if (!saved.every(Boolean) && !ask(UNSAVED_RELOAD)) return false;
  reload();
  return true;
}
