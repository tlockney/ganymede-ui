/**
 * Wrap Code (#813): long lines in cells wrap at the editor's edge instead of
 * scrolling sideways, which on a phone hides most of a line. The switch is
 * the app's, kept in local storage like the live Markdown preview's
 * (`markdown-preview.ts`) and off by default. Every editor follows it, in
 * every open window, for as long as it lives.
 */
import { Compartment, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { Signal } from '@lumino/signaling';

const KEY = 'ganymede-ui:wrap-code';
/** The switch for this page when local storage can't hold it. */
let fallback: boolean | undefined;
const changed = new Signal<object, boolean>({});
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === KEY || e.key === null) changed.emit(wrapCodeEnabled());
  });
}

/** Whether cells wrap long lines; off unless the person turned it on. */
export function wrapCodeEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return fallback ?? false;
  }
}

/** Turn wrapping on or off, in every open editor, and remember it. */
export function setWrapCodeEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
    fallback = undefined;
  } catch {
    // Private mode: for this page only.
    fallback = on;
  }
  changed.emit(on);
}

/** For tests: forget a switch kept only in this page. */
export function resetWrapCodeForTests(): void {
  fallback = undefined;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}

/** An editor extension: wraps lines while the switch is on. */
export function wrapCode(): Extension {
  const slot = new Compartment();
  const pick = (on: boolean): Extension => (on ? EditorView.lineWrapping : []);
  const follow = ViewPlugin.fromClass(
    class {
      private readonly onSwitch = (_: unknown, on: boolean) => {
        this.view.dispatch({ effects: slot.reconfigure(pick(on)) });
      };
      constructor(private readonly view: EditorView) {
        changed.connect(this.onSwitch);
      }
      destroy() {
        changed.disconnect(this.onSwitch);
      }
    },
  );
  return [slot.of(pick(wrapCodeEnabled())), follow];
}
