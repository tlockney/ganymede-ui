import { useEffect, useRef, useState } from 'react';
import { type RunAnswer, parseParams } from '../lib/run';

type Props = {
  /** The notebook's file name, for the title. */
  name: string;
  /** What the parameters field starts with. */
  initialParams: string;
  /** Runs the notebook on the server; `signal` stops it. */
  run(
    params: Record<string, unknown>,
    opts: { save: boolean; signal: AbortSignal },
  ): Promise<RunAnswer>;
  onClose(): void;
};

/**
 * Run with Parameters (#582): the notebook runs top to bottom in a kernel
 * of its own on the server, with the parameters as `jupyter.params`, and
 * its named results come back here. The open notebook doesn't change.
 * Cancel stops the run: the server shuts its kernel down when the request
 * goes away.
 */
export function RunSheet({ name, initialParams, run, onClose }: Props) {
  const [text, setText] = useState(initialParams);
  const [save, setSave] = useState(false);
  const [error, setError] = useState<string>();
  const [answer, setAnswer] = useState<RunAnswer>();
  const [running, setRunning] = useState<AbortController>();
  const first = useRef<HTMLTextAreaElement>(null);

  useEffect(() => first.current?.focus(), []);

  const cancel = () => {
    running?.abort();
    onClose();
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  // Stop a run still going when the sheet goes (the notebook closed).
  useEffect(() => () => running?.abort(), [running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cancelRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setAnswer(undefined);
    let params: Record<string, unknown>;
    try {
      params = parseParams(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const controller = new AbortController();
    setRunning(controller);
    try {
      setAnswer(await run(params, { save, signal: controller.signal }));
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(`Not run: ${err instanceof Error ? err.message : err}`);
      }
    } finally {
      setRunning(undefined);
    }
  };

  const results = answer ? Object.entries(answer.results) : [];
  return (
    <div className="sheet-backdrop">
      <form
        className="sheet run-sheet"
        role="dialog"
        aria-labelledby="run-title"
        onSubmit={e => void submit(e)}
      >
        <h2 id="run-title">Run {name} with Parameters</h2>
        <p className="hint">
          Runs the notebook top to bottom in a new kernel on the server, with these parameters in{' '}
          <code>jupyter.params</code>, and shows the results it names. This window’s cells and
          outputs don’t change.
        </p>
        <div className="form-rows">
          <label className="stacked-row">
            <span>Parameters (JSON)</span>
            <textarea
              ref={first}
              aria-label="Parameters, a JSON object"
              rows={6}
              spellCheck={false}
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={!!running}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={save}
              onChange={e => setSave(e.target.checked)}
              disabled={!!running}
            />
            <span>Save the executed notebook under runs/</span>
          </label>
        </div>
        {running && <p role="status">Running…</p>}
        {error && <p className="sheet-error">{error}</p>}
        {answer && (
          <div className="run-answer" role="status">
            <p className={answer.status === 'ok' ? undefined : 'sheet-error'}>
              {answer.status === 'ok'
                ? 'The run finished.'
                : answer.error
                  ? `The run failed: ${answer.error}`
                  : 'The run failed.'}
            </p>
            {results.length > 0 ? (
              <dl className="run-results">
                {results.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      <pre>{JSON.stringify(value, null, 2)}</pre>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="hint">No named results.</p>
            )}
            {answer.copy && (
              <p className="hint">
                Saved as <code>{answer.copy}</code>.
              </p>
            )}
          </div>
        )}
        <div className="sheet-buttons">
          <button type="button" className="push-button" onClick={cancel}>
            {running ? 'Stop' : answer ? 'Done' : 'Cancel'}
          </button>
          <button type="submit" className="push-button primary" disabled={!!running}>
            {answer ? 'Run Again' : 'Run'}
          </button>
        </div>
      </form>
    </div>
  );
}
