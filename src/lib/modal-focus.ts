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
 * Keeps Tab inside `root` by moving focus itself, every time: to the next
 * stop (Shift+Tab the previous), wrapping at the ends, and in from anywhere
 * outside, such as the body after a focused button was disabled. Leaving
 * any Tab to the browser isn't enough: WebKit (Safari, the Mac and iPad
 * apps), with its default settings, skips buttons and checkboxes, so from
 * the Token field its next stop is the page behind.
 */
export function containTab(e: KeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const stops = tabbables(root);
  // Nothing to stop at (every control disabled): Tab still mustn't leave.
  if (stops.length === 0) return;
  const active = document.activeElement;
  const at = active instanceof HTMLElement ? stops.indexOf(active) : -1;
  let next: number;
  if (at >= 0) next = at + (e.shiftKey ? -1 : 1);
  else if (active instanceof Node && root.contains(active)) {
    // Inside but not a stop (the sheet itself, a clicked radio that isn't
    // chosen): the stop after it in document order, or before it.
    const after = stops.findIndex(
      s => !!(active.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    if (e.shiftKey) next = (after < 0 ? stops.length : after) - 1;
    else next = after;
  } else next = e.shiftKey ? stops.length - 1 : 0;
  stops[(next + stops.length) % stops.length].focus();
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
      // Nothing has focus (the sheet took it away with it). Focus still
      // inside the sheet happens only in a StrictMode remount, where the
      // sheet stays in the page between cleanup and setup.
      const free = !now || now === document.body || !!root?.contains(now);
      if (free) opener?.focus();
    };
    // Mount and unmount only: the sheet's first focus and its opener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
