import type { KernelSpec } from '@jupyterlab/services';
import type { NotebookController } from './NotebookPane';
import {
  CodeIcon,
  DownloadIcon,
  ForwardIcon,
  KeyboardIcon,
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
  specs?: KernelSpec.ISpecModels;
};

const TRUST_PROMPT =
  'Trust this notebook?\n\n' +
  'Its HTML and JavaScript outputs will render in full and can run code in ' +
  'this page. Only trust notebooks from people you trust.';

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

/** The unified titlebar and toolbar, as in a macOS document window. */
export function Toolbar({
  controller: c,
  sidebarOpen,
  onToggleSidebar,
  onShowShortcuts,
  specs,
}: Props) {
  const disabled = !c;
  const kernelDisplay = c?.missingKernel
    ? `${c.missingKernel} (not installed)`
    : (c?.kernelName && specs?.kernelspecs[c.kernelName]?.display_name) || c?.kernelName;

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
          <div className="title">
            {c ? c.name.replace(/\.ipynb$/, '') : 'Ganymede'}
            {c?.dirty && <span className="edited"> — Edited</span>}
          </div>
          {c && (
            <div className="subtitle">
              <span className={`status-dot s-${c.status}`} />
              {kernelDisplay ?? 'No kernel'} · {STATUS_LABEL[c.status] ?? c.status}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-trailing">
        <div className="segmented" role="group" aria-label="Run">
          <button
            className="tb-button"
            title="Run Cell (⇧↩)"
            disabled={disabled}
            onClick={() => void c?.run()}
          >
            <PlayIcon />
          </button>
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

        {c && !c.trusted && (
          <button
            className="tb-button"
            title="Trust Notebook"
            onClick={() => {
              if (window.confirm(TRUST_PROMPT)) void c.trust();
            }}
          >
            <ShieldIcon />
          </button>
        )}

        {specs && c && (
          <label className="popup-button" title="Kernel">
            <select value={c.kernelName ?? ''} onChange={e => void c.changeKernel(e.target.value)}>
              {!c.kernelName && (
                <option value="" disabled>
                  {c.missingKernel ? `${c.missingKernel} (not installed)` : 'Pick a kernel'}
                </option>
              )}
              {Object.values(specs.kernelspecs).map(s =>
                s ? (
                  <option key={s.name} value={s.name}>
                    {s.display_name}
                  </option>
                ) : null,
              )}
            </select>
          </label>
        )}

        <button className="tb-button" title="Keyboard Shortcuts" onClick={onShowShortcuts}>
          <KeyboardIcon />
        </button>

        <button
          className="tb-button"
          title="Download Notebook"
          disabled={disabled}
          onClick={() => c?.download()}
        >
          <DownloadIcon />
        </button>

        <button
          className="tb-button"
          title="Save (⌘S)"
          disabled={disabled || !c?.dirty}
          onClick={() => void c?.save()}
        >
          <SaveIcon />
        </button>
      </div>
    </header>
  );
}
