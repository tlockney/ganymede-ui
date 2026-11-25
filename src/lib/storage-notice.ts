/** Where browser work is kept, said before the first edit (#815). */
export const STORAGE_NOTE = 'Saved in this browser. Download a copy to keep it elsewhere.';

/**
 * Whether the notice that says where browser work is stored (#815) was
 * dismissed. Kept in local storage, so per origin, as the other
 * `ganymede-ui:*` settings and the onboarding welcome (`onboarding.ts`).
 */
const KEY = 'ganymede-ui:storage-notice';

/** Set on dismissal, so it holds for this page when storage is off. */
let dismissedHere = false;

export function storageNoticeDismissed(): boolean {
  if (dismissedHere) return true;
  try {
    return localStorage.getItem(KEY) === 'dismissed';
  } catch {
    return false;
  }
}

/** For tests: forget a dismissal kept only in this page. */
export function resetStorageNoticeForTests(): void {
  dismissedHere = false;
}

export function dismissStorageNotice(): void {
  dismissedHere = true;
  try {
    localStorage.setItem(KEY, 'dismissed');
  } catch {
    // Private mode: dismissed for this page only.
  }
}
