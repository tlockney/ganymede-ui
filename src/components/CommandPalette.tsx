import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { type PaletteEntry, filterEntries } from '../lib/palette';

type Props = {
  entries: PaletteEntry[];
  /** Runs an entry: its own argument, or the text typed for its prompt. */
  onRun(entry: PaletteEntry, arg: string | undefined): void;
  onClose(): void;
};

/**
 * The command palette (#211, ⇧⌘P): a field over a list of every command.
 * Typing filters it; ↑ and ↓ move, ↩ runs, Esc closes. An entry that
 * needs text (Rename…) turns the field into a prompt for it, and ↩ runs
 * it with what was typed; Esc goes back to the list.
 */
export function CommandPalette({ entries, onRun, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [asking, setAsking] = useState<PaletteEntry>();
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const shown = useMemo(() => filterEntries(entries, query), [entries, query]);
  // The first one that can run, after each new filter.
  useEffect(() => {
    const first = shown.findIndex(e => !e.disabled);
    setActive(first < 0 ? 0 : first);
  }, [shown]);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [asking]);

  // The active row stays in view as ↑ and ↓ move it.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const choose = (entry: PaletteEntry | undefined) => {
    if (!entry || entry.disabled) return;
    if (entry.prompt) {
      setAsking(entry);
      setText(entry.initial ?? '');
      return;
    }
    onRun(entry, entry.arg);
  };

  const move = (by: number) => {
    if (!shown.some(e => !e.disabled)) return;
    let next = active;
    do {
      next = (next + by + shown.length) % shown.length;
    } while (shown[next]?.disabled);
    setActive(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // The notebook and the app's shortcuts don't see keys typed here.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (asking) setAsking(undefined);
      else onClose();
      return;
    }
    if (asking) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = text.trim();
        if (value) onRun(asking, value);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Enter':
        e.preventDefault();
        choose(shown[active]);
        break;
    }
  };

  const optionId = (i: number) => `${id}-option-${i}`;

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet palette" role="dialog" aria-label="Command palette">
        {asking ? (
          <>
            <label className="palette-prompt" htmlFor={`${id}-field`}>
              {asking.label.replace(/…$/, '')}
            </label>
            <input
              id={`${id}-field`}
              ref={field}
              className="palette-field"
              placeholder={asking.prompt}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </>
        ) : (
          <>
            <input
              ref={field}
              className="palette-field"
              role="combobox"
              aria-label="Command"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={shown[active] ? optionId(active) : undefined}
              placeholder="Type a command"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <ul
              id={`${id}-list`}
              ref={list}
              className="palette-list"
              role="listbox"
              aria-label="Commands"
            >
              {shown.map((entry, i) => (
                <li
                  key={`${entry.id}\n${entry.arg ?? ''}`}
                  id={optionId(i)}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={entry.disabled || undefined}
                  className={`palette-item${i === active ? ' active' : ''}`}
                  // Keeps focus in the field.
                  onMouseDown={e => e.preventDefault()}
                  onMouseMove={() => !entry.disabled && i !== active && setActive(i)}
                  onClick={() => choose(entry)}
                >
                  <span className="palette-label">{entry.label}</span>
                  <span className="palette-group">{entry.group}</span>
                  {entry.keys && <kbd className="palette-keys">{entry.keys}</kbd>}
                </li>
              ))}
            </ul>
            {!shown.length && <p className="palette-empty">No matching commands</p>}
            <p className="visually-hidden" role="status">
              {shown.length === 1 ? '1 command' : `${shown.length} commands`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
