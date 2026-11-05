import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import type { KernelSpec } from '@jupyterlab/services';
import type { CellType, NotebookController } from './NotebookPane';
import { NotebookTitle } from './NotebookTitle';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { GAP, MORE_WIDTH, overflowing } from '../lib/overflow';
import {
  CodeIcon,
  DownloadIcon,
  ForwardIcon,
  CommandIcon,
  KeyboardIcon,
  MoreIcon,
  PlayIcon,
  RestartIcon,
  SaveIcon,
  ShieldIcon,
  SidebarIcon,
  StopIcon,
  TextIcon,
} from './Icons';

type Props = {
  controller?: NotebookController;
  sidebarOpen: boolean;
  onToggleSidebar(): void;
  onShowShortcuts?(): void;
  /** Opens the command palette (#211); no button without it. */
  onShowPalette?(): void;
  specs?: KernelSpec.ISpecModels;
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

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  busy: 'Running',
  starting: 'Starting',
  restarting: 'Restarting',
  autorestarting: 'Restarting',
  connecting: 'Connecting',
  dead: 'Stopped',
  unknown: 'Unknown',
  terminating: 'Stopping',
  none: 'Starts when you run a cell',
};

/**
 * One toolbar item: what it shows, what it becomes in the "…" menu when
 * it doesn't fit, and how readily it goes there (lower goes first). Run
 * never goes, so a phone keeps Run and "…".
 */
type Item = { key: string; priority: number; node: ReactNode; menu: MenuItem[] };

/** Room the title keeps before items move into the menu. */
const TITLE_MIN = 120;

/** The unified titlebar and toolbar, as in a macOS document window. */
export function Toolbar({
  controller: c,
  sidebarOpen,
  onToggleSidebar,
  onShowShortcuts,
  onShowPalette,
  specs,
}: Props) {
  const disabled = !c;
  const kernelDisplay = c?.missingKernel
    ? `${c.missingKernel} (not installed)`
    : (c?.kernelName && specs?.kernelspecs[c.kernelName]?.display_name) || c?.kernelName;
  const trust = () => {
    if (c && window.confirm(TRUST_PROMPT)) void c.trust();
  };
  const kernels = Object.values(specs?.kernelspecs ?? {}).flatMap(s => (s ? [s] : []));

  const items: Item[] = [
    {
      key: 'run',
      priority: Infinity,
      node: (
        <button
          className="tb-button"
          title="Run Cell (⇧↩)"
          disabled={disabled}
          onClick={() => void c?.run()}
        >
          <PlayIcon />
        </button>
      ),
      menu: [],
    },
    {
      key: 'run-more',
      priority: 7,
      node: (
        <div className="segmented" role="group" aria-label="Run">
          <button
            className="tb-button"
            title="Run All"
            disabled={disabled}
            onClick={() => void c?.runAll()}
          >
            <ForwardIcon />
          </button>
          <button
            className="tb-button"
            title="Interrupt"
            disabled={disabled || c?.status !== 'busy'}
            onClick={() => void c?.interrupt()}
          >
            <StopIcon />
          </button>
          <button
            className="tb-button"
            title="Restart Kernel"
            disabled={disabled || c?.status === 'none'}
            onClick={() => void c?.restart()}
          >
            <RestartIcon />
          </button>
        </div>
      ),
      menu: [
        { label: 'Run All', disabled, onSelect: () => void c?.runAll() },
        {
          label: 'Interrupt',
          disabled: disabled || c?.status !== 'busy',
          onSelect: () => void c?.interrupt(),
        },
        {
          label: 'Restart Kernel',
          disabled: disabled || c?.status === 'none',
          onSelect: () => void c?.restart(),
        },
      ],
    },
    {
      key: 'insert',
      priority: 4,
      node: (
        <div className="segmented" role="group" aria-label="Insert">
          <button
            className="tb-button"
            title="Insert Code Cell"
            disabled={disabled}
            onClick={() => c?.insert('code')}
          >
            <CodeIcon />
          </button>
          <button
            className="tb-button"
            title="Insert Text Cell"
            disabled={disabled}
            onClick={() => c?.insert('markdown')}
          >
            <TextIcon />
          </button>
        </div>
      ),
      menu: [
        { label: 'Insert Code Cell', disabled, onSelect: () => c?.insert('code') },
        { label: 'Insert Text Cell', disabled, onSelect: () => c?.insert('markdown') },
      ],
    },
    {
      key: 'cell-type',
      priority: 3,
      node: (
        <label className="popup-button" title="Cell Type">
          <select
            aria-label="Cell Type"
            disabled={disabled}
            value={c?.cellType ?? 'code'}
            onChange={e => c?.changeCellType(e.target.value as CellType)}
          >
            {CELL_TYPES.map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ),
      menu: [
        { heading: 'Cell Type' },
        ...CELL_TYPES.map(([type, label]) => ({
          label,
          disabled,
          checked: c?.cellType === type,
          onSelect: () => c?.changeCellType(type),
        })),
      ],
    },
  ];
  if (c && !c.trusted) {
    items.push({
      key: 'trust',
      priority: 6,
      node: (
        <button className="tb-button" title="Trust Notebook" onClick={trust}>
          <ShieldIcon />
        </button>
      ),
      menu: [{ label: 'Trust Notebook…', onSelect: trust }],
    });
  }
  if (specs && c) {
    items.push({
      key: 'kernel',
      priority: 2,
      node: (
        <label className="popup-button" title="Kernel">
          <select
            aria-label="Kernel"
            value={c.kernelName ?? ''}
            onChange={e => void c.changeKernel(e.target.value)}
          >
            {!c.kernelName && (
              <option value="" disabled>
                {c.missingKernel ? `${c.missingKernel} (not installed)` : 'Pick a kernel'}
              </option>
            )}
            {kernels.map(s => (
              <option key={s.name} value={s.name}>
                {s.display_name}
              </option>
            ))}
          </select>
        </label>
      ),
      menu: [
        { heading: 'Kernel' },
        ...kernels.map(s => ({
          label: s.display_name,
          checked: c.kernelName === s.name,
          onSelect: () => void c.changeKernel(s.name),
        })),
      ],
    });
  }
  if (onShowPalette) {
    items.push({
      key: 'palette',
      priority: 1,
      node: (
        <button className="tb-button" title="Command Palette" onClick={onShowPalette}>
          <CommandIcon />
        </button>
      ),
      menu: [{ label: 'Command Palette…', onSelect: onShowPalette }],
    });
  }
  items.push(
    {
      key: 'shortcuts',
      priority: 1,
      node: (
        <button className="tb-button" title="Keyboard Shortcuts" onClick={onShowShortcuts}>
          <KeyboardIcon />
        </button>
      ),
      menu: onShowShortcuts ? [{ label: 'Keyboard Shortcuts', onSelect: onShowShortcuts }] : [],
    },
    {
      key: 'download',
      priority: 0,
      node: (
        <button
          className="tb-button"
          title="Download Notebook"
          disabled={disabled}
          onClick={() => c?.download()}
        >
          <DownloadIcon />
        </button>
      ),
      menu: [{ label: 'Download Notebook', disabled, onSelect: () => c?.download() }],
    },
    {
      key: 'save',
      priority: 5,
      node: (
        <button
          className="tb-button"
          title="Save (⌘S)"
          disabled={disabled || !c?.dirty}
          onClick={() => void c?.save()}
        >
          <SaveIcon />
        </button>
      ),
      menu: [{ label: 'Save', disabled: disabled || !c?.dirty, onSelect: () => void c?.save() }],
    },
  );

  // What doesn't fit goes into the "…" menu (#201). Each item's width is
  // read while it shows (all show at first) and kept for when it doesn't;
  // the toolbar's width and the title's room give the space.
  const toolbar = useRef<HTMLElement>(null);
  const leading = useRef<HTMLDivElement>(null);
  const trailing = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const widths = useRef(new Map<string, number>());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const keys = items.map(i => i.key).join(' ');

  useLayoutEffect(() => {
    const bar = toolbar.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(bar.clientWidth));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const bar = toolbar.current;
    if (!bar || !leading.current || !trailing.current) return;
    // No layout (a test without one): show everything.
    if (bar.clientWidth === 0) return setHidden(h => (h.size ? new Set() : h));
    for (const child of trailing.current.querySelectorAll<HTMLElement>('.tb-item')) {
      widths.current.set(child.dataset.key!, child.getBoundingClientRect().width);
    }
    const style = getComputedStyle(bar);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) || 0;
    const barGap = parseFloat(style.columnGap) || 12;
    const sidebarButton = leading.current.firstElementChild?.getBoundingClientRect().width ?? 0;
    // The title's and subtitle's full widths (they clip, so scrollWidth is
    // the text's, not the room it has now).
    const title = Math.max(
      0,
      ...[...leading.current.querySelectorAll<HTMLElement>('.title, .subtitle-text')].map(
        e => e.scrollWidth + (e.classList.contains('subtitle-text') ? 12 : 0),
      ),
    );
    const room =
      bar.clientWidth - padding - barGap - sidebarButton - GAP - Math.min(title, TITLE_MIN);
    const next = overflowing(
      items.map(i => ({
        key: i.key,
        priority: i.priority,
        width: widths.current.get(i.key) ?? MORE_WIDTH,
      })),
      room,
      more.current?.getBoundingClientRect().width || MORE_WIDTH,
    );
    setHidden(h => (sameSet(h, next) ? h : next));
    // `items` is new every render; its keys, the width and what changes
    // an item's width are what count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, width, c?.name, c?.status, kernelDisplay, c?.trusted, c?.cellType]);

  const menu = items
    .filter(i => hidden.has(i.key) && i.menu.length)
    .flatMap((i, n) => (n ? ['separator' as const, ...i.menu] : i.menu));

  return (
    <header className="toolbar" ref={toolbar}>
      <div className="toolbar-leading" ref={leading}>
        <button
          className="tb-button"
          title={sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <SidebarIcon />
        </button>
        <div className="title-block">
          <NotebookTitle
            // A fresh field for each notebook.
            key={c?.path}
            name={c ? c.name.replace(/\.ipynb$/, '') : 'Ganymede'}
            dirty={!!c?.dirty}
            onRename={c?.rename}
          />
          {c && (
            <div className="subtitle">
              <span className={`status-dot s-${c.status}`} />
              <span className="subtitle-text">
                {kernelDisplay ?? 'No kernel'} · {STATUS_LABEL[c.status] ?? c.status}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-trailing" ref={trailing}>
        {items
          .filter(i => !hidden.has(i.key))
          .map(i => (
            <span key={i.key} className="tb-item" data-key={i.key}>
              {i.node}
            </span>
          ))}
        {menu.length > 0 && (
          <button
            ref={more}
            className="tb-button"
            title="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            <MoreIcon />
          </button>
        )}
      </div>
      {menuOpen && more.current && menu.length > 0 && (
        <ContextMenu
          at={more.current}
          label="More"
          items={menu}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </header>
  );
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every(k => b.has(k));
}
