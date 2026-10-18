import type { KernelSpec } from '@jupyterlab/services';
import type { NotebookController } from './NotebookPane';
import {
  CodeIcon,
  ForwardIcon,
  PlayIcon,
  RestartIcon,
  SaveIcon,
  SidebarIcon,
  StopIcon,
  TextIcon,
} from './Icons';

type Props = {
  controller?: NotebookController;
  sidebarOpen: boolean;
  onToggleSidebar(): void;
  specs?: KernelSpec.ISpecModels;
};

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
};

/** The unified titlebar and toolbar, as in a macOS document window. */
export function Toolbar({ controller: c, sidebarOpen, onToggleSidebar, specs }: Props) {
  const disabled = !c;
  const kernelDisplay =
    (c?.kernelName && specs?.kernelspecs[c.kernelName]?.display_name) || c?.kernelName;

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
            disabled={disabled}
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

        {specs && c && (
          <label className="popup-button" title="Kernel">
            <select
              value={c.kernelName ?? ''}
              onChange={e => void c.changeKernel(e.target.value)}
            >
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
