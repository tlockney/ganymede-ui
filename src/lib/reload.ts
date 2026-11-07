/**
 * Reloading the page with unsaved edits. A browser asks first through
 * `beforeunload`, but the Apple apps' web view has no public delegate
 * method for that prompt and reloads without asking (#375). So a reload
 * the page starts saves the open notebook's edits first, and waits for
 * the last save of a notebook just closed, whose pane is already gone;
 * it asks only when something couldn't be saved.
 */
import { pendingHandoffs } from './rename';

/** Saves a notebook if it has edits; true when nothing is left unsaved. */
export type ReloadGuard = () => Promise<boolean>;

const guards = new Set<ReloadGuard>();

/** Registers `guard` until the returned function is called. */
export function guardReload(guard: ReloadGuard): () => void {
  guards.add(guard);
  return () => guards.delete(guard);
}

export const UNSAVED_RELOAD = 'Some edits couldn’t be saved. Reload anyway and lose them?';

/**
 * Saves what the guards can and waits for saves in flight, then reloads,
 * unless something stayed unsaved and the user says not to. The question
 * starts with why each save in flight failed, since the notice that would
 * have said so goes with the page. Resolves to whether it reloaded.
 */
export async function reloadPage(
  reload: () => void = () => window.location.reload(),
  ask: (message: string) => boolean = message => window.confirm(message),
): Promise<boolean> {
  const [saved, handed] = await Promise.all([
    Promise.all([...guards].map(g => g().catch(() => false))),
    Promise.all(
      pendingHandoffs().map(h =>
        h.catch((e: unknown) => (e instanceof Error ? e.message : String(e))),
      ),
    ),
  ]);
  const why = [...new Set(handed.filter((m): m is string => !!m))];
  if (why.length > 0 || !saved.every(Boolean)) {
    if (!ask([...why, UNSAVED_RELOAD].join('\n\n'))) return false;
  }
  reload();
  return true;
}
