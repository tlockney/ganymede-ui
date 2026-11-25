import { type RefObject, useEffect } from 'react';

const TABBABLE = 'button, input, select, textarea, a[href], [tabindex]';

/** The elements Tab stops at inside `root`, in document order. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    el =>
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      !el.closest('[hidden], [inert]') &&
      (el as HTMLInputElement).type !== 'hidden',
  );
}

/**
 * Keeps Tab inside `root`: wraps from the last stop to the first (Shift+Tab
 * the other way), and brings focus back in from anywhere outside, such as
 * the body after a focused button was disabled.
 */
export function containTab(e: KeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
  const stops = tabbables(root);
  // Nothing to stop at (every control disabled): Tab still mustn't leave.
  if (stops.length === 0) {
    e.preventDefault();
    return;
  }
  const first = stops[0];
  const last = stops[stops.length - 1];
  const active = document.activeElement;
  let next: HTMLElement | undefined;
  if (!(active instanceof Node) || !root.contains(active)) next = e.shiftKey ? last : first;
  else if (!e.shiftKey && active === last) next = first;
  else if (e.shiftKey && active === first) next = last;
  if (!next) return;
  e.preventDefault();
  next.focus();
}

/**
 * Modal focus for a sheet: focuses `initial()` on mount, keeps Tab inside
 * `ref`, and on unmount gives focus back to the element that had it before
 * the sheet opened, unless something else has taken focus since (focusing
 * an opener that left the page does nothing).
 */
export function useModalFocus(
  ref: RefObject<HTMLElement | null>,
  initial: () => HTMLElement | null | undefined,
): void {
  useEffect(() => {
    const root = ref.current;
    const before = document.activeElement;
    const opener = before instanceof HTMLElement ? before : undefined;
    (initial() ?? root)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (ref.current) containTab(e, ref.current);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const now = document.activeElement;
      // Focus left with the sheet (it was inside), or nothing has it.
      const free = !now || now === document.body || !!root?.contains(now);
      if (free) opener?.focus();
    };
    // Mount and unmount only: the sheet's first focus and its opener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
