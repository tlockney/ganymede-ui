/**
 * The bar of keys above the on-screen keyboard while a cell is edited
 * (#209). The keys and what they do are in `lib/keyboard-bar.ts`.
 */
import { useEffect, useState } from 'react';
import type { CommandRegistry } from '@lumino/commands';
import type { Notebook } from '@jupyterlab/notebook';
import { BAR_KEYS, editingTarget, keyboardUp, pressBarKey } from '../lib/keyboard-bar';

/** Where the visible area ends, when the bar shows. */
function barBottom(notebook: Notebook): number | undefined {
  const viewport = window.visualViewport;
  if (!viewport || !window.matchMedia?.('(pointer: coarse)').matches) return undefined;
  if (!keyboardUp(viewport, window.innerHeight) || !editingTarget(notebook)) return undefined;
  return viewport.offsetTop + viewport.height;
}

export function KeyboardBar({
  notebook,
  commands,
}: {
  notebook: Notebook;
  commands: CommandRegistry;
}) {
  const [bottom, setBottom] = useState<number>();

  useEffect(() => {
    // Focus moves before the keyboard comes up, and the keyboard goes
    // after: both ends wait a frame for the other.
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBottom(barBottom(notebook)));
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    notebook.stateChanged.connect(update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      notebook.stateChanged.disconnect(update);
    };
  }, [notebook]);

  if (bottom === undefined) return null;
  return (
    <div className="keyboard-bar" role="toolbar" aria-label="Keys" style={{ top: bottom }}>
      {BAR_KEYS.map(key => (
        <button
          key={key.label}
          type="button"
          tabIndex={-1}
          className={`keyboard-bar-key ${key.kind}`}
          title={'title' in key ? key.title : undefined}
          aria-label={'title' in key ? key.title : key.text}
          // Keep the focus, and with it the keyboard, in the editor.
          onPointerDown={e => e.preventDefault()}
          onMouseDown={e => e.preventDefault()}
          onClick={() => pressBarKey(notebook, commands, key)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
