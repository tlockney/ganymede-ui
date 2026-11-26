import { useEffect, useRef, useState } from 'react';
import type { KernelSpec } from '@jupyterlab/services';
import type { CellType, NotebookController } from './NotebookPane';
import { NotebookTitle } from './NotebookTitle';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { DEVICE_LABEL, isPageSpec, offersDevice, pickerLabel } from '../lib/kernel-device';
import { type Place, shortStatusText, statusText } from '../lib/header-status';
import { useNarrow } from '../lib/useNarrow';
import {
  ChevronDownIcon,
  JournalIcon,
  MoreIcon,
  LockIcon,
  NotebookIcon,
  PlayIcon,
  PublishIcon,
  ShieldIcon,
  SidebarIcon,
  StopIcon,
} from './Icons';
import { EXPORT_FORMATS, EXPORT_LABELS, type ExportFormat } from '../lib/export';

type Props = {
  controller?: NotebookController;
  sidebarOpen: boolean;
  onToggleSidebar(): void;
  onShowShortcuts?(): void;
  /** Opens the command palette (#211); no button without it. */
  onShowPalette?(): void;
  /** Switches the notebook to and from its journal view (#184); no button without it. */
  onToggleJournal?(): void;
  /** Shows or hides the Variables view (#242); no button without it. */
  onToggleVariables?(): void;
  variablesOpen?: boolean;
  specs?: KernelSpec.ISpecModels;
  /** Where the notebooks are saved and the kernels run (#801); the status line names it. */
  place?: Place;
  /** What the notebook asks for that its grant doesn't give (host API). */
  accessMissing?: string[];
  /** Opens Notebook Access; shown while `accessMissing` has anything. */
  onNotebookAccess?(): void;
  /** Opens Publish as Web Page (#563); no item without it. */
  onPublish?(): void;
  /** Run with Parameters; absent where the backend can't. */
  onRunWithParams?(): void;
  /** Export as Markdown or a script; absent where the backend can't. */
  onExport?(format: ExportFormat): void;
};

const TRUST_PROMPT =
  'Trust this notebook?\n\n' +
  'Its HTML and JavaScript outputs will render in full and can run code in ' +
  'this page. Only trust notebooks from people you trust.';

const CELL_TYPES: readonly [CellType, string][] = [
  ['code', 'Code'],
  ['markdown', 'Markdown'],
  ['raw', 'Raw'],
];

/** A page with no backend yet (a test): saved and run in the page. */
const HERE: Place = { saved: 'in this browser', runs: () => 'here' };

type MenuName = 'status' | 'run' | 'share' | 'more';

/**
 * The unified titlebar and toolbar, as in a macOS document window (#801):
 * the title with a status line under it (where the file is saved, where it
 * runs, the kernel), Run Cell and Interrupt always in view, and the rest in
 * the Share and "⋯" menus, in a fixed order whatever the width.
 */
export function Toolbar({
  controller: c,
  sidebarOpen,
  onToggleSidebar,
  onShowShortcuts,
  onShowPalette,
  onToggleJournal,
  onToggleVariables,
  variablesOpen = false,
  specs,
  place = HERE,
  accessMissing = [],
  onNotebookAccess,
  onPublish,
  onExport,
  onRunWithParams,
}: Props) {
  const disabled = !c;
  // The journal view hides the cells: what runs or edits them waits for the notebook.
  const noCells = !c || c.journal;
  const kernelDisplay = c?.missingKernel
    ? undefined
    : (c?.kernelName && specs?.kernelspecs[c.kernelName]?.display_name) || c?.kernelName;
  const trust = () => {
    if (c && window.confirm(TRUST_PROMPT)) void c.trust();
  };
  const kernels = Object.values(specs?.kernelspecs ?? {}).flatMap(s => (s ? [s] : []));

  const [open, setOpen] = useState<MenuName>();
  const narrow = useNarrow();
  const anchors = {
    status: useRef<HTMLButtonElement>(null),
    run: useRef<HTMLButtonElement>(null),
    share: useRef<HTMLButtonElement>(null),
    more: useRef<HTMLButtonElement>(null),
  };
  const toggle = (name: MenuName) => setOpen(o => (o === name ? undefined : name));
  const popup = (name: MenuName) => ({
    ref: anchors[name],
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open === name,
    onClick: () => toggle(name),
  });

  const statusInput = c && {
    place,
    dirty: c.dirty,
    locked: c.locked,
    kernelName: c.kernelName,
    kernelDisplay,
    missingKernel: c.missingKernel,
    status: c.status,
    pageKernel: isPageSpec(c.kernelName ? specs?.kernelspecs[c.kernelName] : undefined),
  };
  const status = statusInput && statusText(statusInput);

  const menus: Record<MenuName, { label: string; items: MenuItem[] }> = {
    status: {
      label: 'Notebook and Kernel',
      items: [
        ...(c ? [{ heading: 'File' }, { note: c.path }] : []),
        ...(c && specs
          ? [
              { heading: 'Kernel' },
              ...(c.kernelVersionLine ? [{ note: c.kernelVersionLine }] : []),
              ...kernels.map(s => ({
                label: pickerLabel(s).text,
                ariaLabel: pickerLabel(s).label,
                title: offersDevice(s) ? DEVICE_LABEL : undefined,
                checked: c.kernelName === s.name,
                onSelect: () => void c.changeKernel(s.name),
              })),
            ]
          : []),
      ],
    },
    run: {
      label: 'More run actions',
      items: [
        { label: 'Run All', disabled: noCells, onSelect: () => void c?.runAll() },
        ...(onRunWithParams
          ? [{ label: 'Run with Parameters…', disabled, onSelect: onRunWithParams }]
          : []),
        { label: 'Clear All Outputs', disabled: noCells, onSelect: () => c?.clearOutputs() },
        'separator',
        {
          label: 'Restart Kernel',
          disabled: disabled || c?.status === 'none',
          onSelect: () => void c?.restart(),
        },
        {
          label: 'Restart & Run All',
          disabled: noCells,
          onSelect: () => void c?.restartAndRunAll(),
        },
      ],
    },
    share: {
      label: 'Share',
      items: [
        { label: 'Download Notebook', disabled, onSelect: () => c?.download() },
        ...(onExport
          ? EXPORT_FORMATS.map(f => ({
              label: EXPORT_LABELS[f],
              disabled,
              onSelect: () => onExport(f),
            }))
          : []),
        ...(onPublish ? [{ label: 'Publish as Web Page…', disabled, onSelect: onPublish }] : []),
      ],
    },
    more: {
      label: 'More',
      items: [
        // Shown as buttons too, except on a phone, where the title needs the room (#801).
        ...(c && !c.trusted ? [{ label: 'Trust Notebook…', onSelect: trust }] : []),
        ...(c && onNotebookAccess && accessMissing.length > 0
          ? [{ label: 'Notebook Access…', onSelect: onNotebookAccess }]
          : []),
        ...((c && !c.trusted) || (c && onNotebookAccess && accessMissing.length > 0)
          ? ['separator' as const]
          : []),
        ...(onToggleJournal
          ? [
              {
                label: c?.journal ? 'Open as Notebook' : 'View as Journal',
                disabled,
                onSelect: onToggleJournal,
              },
            ]
          : []),
        ...(onToggleVariables
          ? [
              {
                label: variablesOpen ? 'Hide Variables' : 'Show Variables',
                disabled,
                onSelect: onToggleVariables,
              },
            ]
          : []),
        { label: 'Insert Code Cell', disabled: noCells, onSelect: () => c?.insert('code') },
        { label: 'Insert Text Cell', disabled: noCells, onSelect: () => c?.insert('markdown') },
        { heading: 'Cell Type' },
        ...CELL_TYPES.map(([type, label]) => ({
          label,
          disabled: noCells,
          checked: c?.cellType === type,
          onSelect: () => c?.changeCellType(type),
        })),
        'separator',
        { label: 'Save', disabled: disabled || !c?.dirty, onSelect: () => void c?.save() },
        ...(onShowPalette ? [{ label: 'Command Palette…', onSelect: onShowPalette }] : []),
        ...(onShowShortcuts ? [{ label: 'Keyboard Shortcuts', onSelect: onShowShortcuts }] : []),
      ],
    },
  };

  // A menu whose opener has gone (the notebook closed) closes, so it doesn't
  // open again by itself when the opener comes back (#801).
  useEffect(() => {
    if (open && !anchors[open].current) setOpen(undefined);
    // The status opener comes and goes with the notebook (`c`); the others stay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, c]);

  return (
    <header className="toolbar">
      <div className="toolbar-leading">
        <button
          className="tb-button"
          title={sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <SidebarIcon />
        </button>
        <div className="title-block">
          {c?.eyebrow && (
            // The journal's eyebrow, in the notebook view too (#852): the
            // header of a notebook an agent keeps says what it is.
            <p className="title-eyebrow">{c.eyebrow}</p>
          )}
          <div className="title-row">
            <NotebookTitle
              // A fresh field for each notebook.
              key={c?.path}
              name={c ? c.name.replace(/\.ipynb$/, '') : 'Ganymede'}
              onRename={c?.rename}
            />
            {c && onToggleJournal && (!narrow || c.journal) && (
              // The header names which view shows (#819); the other part calls
              // the same toggle as the More menu item, which keeps the cell.
              // On a phone it takes a row of its own, so only the journal
              // view shows it; the notebook keeps the ⋯ item and its height.
              <div
                className="mode-switch"
                role="group"
                aria-label={`View: ${c.journal ? 'Journal' : 'Notebook'}`}
              >
                <button
                  type="button"
                  aria-label="Notebook"
                  title="Notebook"
                  aria-pressed={!c.journal}
                  onClick={() => {
                    if (c.journal) {
                      onToggleJournal();
                      // On a phone this unmounts the control, and focus would
                      // fall out of the header: the More (⋯) button takes it,
                      // its View item being the control's twin (#819).
                      if (narrow) anchors.more.current?.focus();
                    }
                  }}
                >
                  <NotebookIcon />
                  <span className="mode-label">Notebook</span>
                </button>
                <button
                  type="button"
                  aria-label="Journal"
                  title="Journal"
                  aria-pressed={c.journal}
                  onClick={() => {
                    if (!c.journal) onToggleJournal();
                  }}
                >
                  <JournalIcon />
                  <span className="mode-label">Journal</span>
                </button>
              </div>
            )}
          </div>
          {c && (
            <button
              type="button"
              className={`status-line${c.locked ? ' locked' : ''}`}
              aria-label={status}
              title={status}
              {...popup('status')}
            >
              <span className={`status-dot s-${c.status}`} />
              <span className="status-text">
                <span className="status-full">{status}</span>
                <span className="status-short">{shortStatusText(statusInput!)}</span>
              </span>
              <ChevronDownIcon className="status-caret" />
            </button>
          )}
        </div>
      </div>

      <div className="toolbar-trailing">
        {c && !c.trusted && (
          <button className="tb-button tb-decision" title="Trust Notebook" onClick={trust}>
            <ShieldIcon />
          </button>
        )}
        {c && onNotebookAccess && accessMissing.length > 0 && (
          <button
            className="tb-button tb-decision"
            title={`Notebook Access: asks for ${accessMissing.join(', ')}`}
            onClick={onNotebookAccess}
          >
            <LockIcon />
          </button>
        )}
        <div className="run-group" role="group" aria-label="Run">
          <button
            className="run-button"
            title="Run Cell (⇧↩)"
            aria-label="Run Cell"
            disabled={noCells}
            onClick={() => void c?.run()}
          >
            <PlayIcon />
            <span className="tb-label">Run Cell</span>
          </button>
          <button
            className="run-menu-button"
            title="More run actions"
            aria-label="More run actions"
            {...popup('run')}
          >
            <ChevronDownIcon />
          </button>
        </div>
        <button
          className="tb-button tb-labeled"
          title="Interrupt"
          aria-label="Interrupt"
          disabled={disabled || c?.status !== 'busy'}
          onClick={() => void c?.interrupt()}
        >
          <StopIcon />
          <span className="tb-label">Interrupt</span>
        </button>
        <button
          className="tb-button tb-labeled"
          title="Share"
          aria-label="Share"
          {...popup('share')}
        >
          <PublishIcon />
          <span className="tb-label">Share</span>
        </button>
        <button className="tb-button" title="More" aria-label="More" {...popup('more')}>
          <MoreIcon />
        </button>
      </div>
      {open && anchors[open].current && menus[open].items.length > 0 && (
        <ContextMenu
          // A new menu for each opener, so focus and Escape follow it.
          key={open}
          at={anchors[open].current}
          label={menus[open].label}
          items={menus[open].items}
          onClose={() => setOpen(undefined)}
        />
      )}
    </header>
  );
}
