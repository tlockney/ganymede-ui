import type { KernelSpec } from '@jupyterlab/services';
import { ACTION_LABEL, type Problem, type ProblemAction } from '../lib/problems';

type Props = {
  problem: Problem;
  /** Run a button's next step. */
  onAction(action: Exclude<ProblemAction, 'pick-kernel'>): void;
  /** The kernel picked in the notice's own picker. */
  onPickKernel(name: string): void;
  onDismiss(): void;
  /** The kernels to pick from, for `pick-kernel`. */
  specs?: KernelSpec.ISpecModels | null;
};

/**
 * The pane's notice (#213): what went wrong, what the next step does, and
 * a button for it (Restart, Retry, Save, or a kernel picker).
 */
export function ProblemNotice({ problem, onAction, onPickKernel, onDismiss, specs }: Props) {
  const kernels = Object.values(specs?.kernelspecs ?? {}).filter(s => !!s);
  return (
    <div className={`pane-notice problem-${problem.kind}`} role="alert">
      <div className="pane-notice-text">
        <span className="pane-notice-message">{problem.message}</span>
        {problem.hint && <span className="pane-notice-hint">{problem.hint}</span>}
      </div>
      <div className="pane-notice-actions">
        {problem.actions.map(action =>
          action === 'pick-kernel' ? (
            kernels.length > 0 && (
              <label key={action} className="pane-notice-picker">
                <select
                  aria-label={ACTION_LABEL[action]}
                  value=""
                  onChange={e => e.target.value && onPickKernel(e.target.value)}
                >
                  <option value="" disabled>
                    {ACTION_LABEL[action]}…
                  </option>
                  {kernels.map(s => (
                    <option key={s.name} value={s.name}>
                      {s.display_name}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : (
            <button
              key={action}
              type="button"
              className="pane-notice-action"
              onClick={() => onAction(action)}
            >
              {ACTION_LABEL[action]}
            </button>
          ),
        )}
        <button type="button" className="pane-notice-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
