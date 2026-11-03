import { useEffect, useRef, useState } from 'react';

type Props = {
  /** The notebook's name, without `.ipynb`. */
  name: string;
  dirty: boolean;
  /**
   * Renames the notebook to what was typed; false keeps the field open to
   * try again. Without it the title is plain text.
   */
  onRename?(input: string): Promise<boolean>;
};

/**
 * The toolbar's title (#202). A click or tap edits it in place: Enter (or
 * leaving the field) renames the notebook, Escape cancels.
 */
export function NotebookTitle({ name, dirty, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  /**
   * Set while a rename runs and once the field is done with: a blur then
   * (the field leaving the page after Enter or Escape) must not rename.
   */
  const settled = useRef(false);

  useEffect(() => {
    if (!editing) return;
    settled.current = false;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const edited = dirty && <span className="edited"> — Edited</span>;
  if (!onRename) {
    return (
      <div className="title">
        {name}
        {edited}
      </div>
    );
  }

  /** After Enter a failed rename stays open to fix; after a blur it doesn't. */
  const commit = async (retry: boolean) => {
    const field = input.current;
    if (!field || settled.current) return;
    settled.current = true;
    setBusy(true);
    const ok = await onRename(field.value);
    setBusy(false);
    if (ok || !retry) {
      setEditing(false);
    } else {
      // Try again: the pane says what went wrong.
      settled.current = false;
      field.focus();
    }
  };

  if (editing) {
    return (
      <input
        ref={input}
        className="title-field"
        aria-label="Notebook Name"
        defaultValue={name}
        readOnly={busy}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        enterKeyHint="done"
        size={Math.max(8, name.length + 2)}
        onKeyDown={e => {
          // The notebook's own shortcuts listen on the document.
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            settled.current = true;
            setEditing(false);
          }
        }}
        onBlur={() => void commit(false)}
      />
    );
  }

  return (
    <div className="title">
      <button
        type="button"
        className="title-button"
        title="Rename Notebook"
        onClick={() => setEditing(true)}
      >
        {name}
      </button>
      {edited}
    </div>
  );
}
