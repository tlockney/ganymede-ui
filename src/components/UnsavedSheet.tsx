import { useEffect, useId, useRef, type RefObject } from 'react';
import { useModalFocus } from '../lib/modal-focus';

export type UnsavedChoiceProps = {
  name: string;
  why?: string;
  keepRef?: RefObject<HTMLButtonElement | null>;
  onKeepEditing(): void;
  onDownloadCopy?(): void;
  onSwitchAnyway?(): void;
};

/**
 * The three-way choice shown when a notebook can't be saved before closing it:
 * keep editing, download a copy, or switch without saving (#792, #808).
 */
export function UnsavedChoice({
  name,
  why,
  keepRef,
  onKeepEditing,
  onDownloadCopy,
  onSwitchAnyway,
}: UnsavedChoiceProps) {
  return (
    <div className="sheet-unsaved" role="alert">
      <p className="sheet-error">
        Couldn’t save “{name}”.{why && ` ${why}`} Switching closes it, and its unsaved edits would
        be lost. {why ? 'Keep editing to try again.' : 'Keep editing to see why and try again.'}
      </p>
      <div className="sheet-buttons">
        <button type="button" className="push-button" onClick={onSwitchAnyway}>
          Switch Without Saving
        </button>
        <button type="button" className="push-button" onClick={onDownloadCopy}>
          Download a Copy
        </button>
        <button ref={keepRef} type="button" className="push-button primary" onClick={onKeepEditing}>
          Keep Editing
        </button>
      </div>
    </div>
  );
}

type SheetProps = {
  name: string;
  why?: string;
  onKeepEditing(): void;
  onDownloadCopy(): void;
  onSwitchAnyway(): void;
};

/**
 * Modal prompt shown when a notebook's save fails or times out before closing
 * it in the page (#808).
 */
export function UnsavedSheet({
  name,
  why,
  onKeepEditing,
  onDownloadCopy,
  onSwitchAnyway,
}: SheetProps) {
  const headingId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  useModalFocus(sheet, () => keepButton.current);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.preventDefault();
      // Only the sheet closes, not whatever listens for Escape behind it.
      e.stopPropagation();
      onKeepEditing();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onKeepEditing]);

  return (
    <div
      className="sheet-backdrop"
      // A click on the dimmed page keeps focus in the sheet.
      onMouseDown={e => e.target === e.currentTarget && e.preventDefault()}
    >
      <div
        ref={sheet}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <h2 id={headingId}>Unsaved edits</h2>
        <UnsavedChoice
          name={name}
          why={why}
          keepRef={keepButton}
          onKeepEditing={onKeepEditing}
          onDownloadCopy={onDownloadCopy}
          onSwitchAnyway={onSwitchAnyway}
        />
      </div>
    </div>
  );
}
