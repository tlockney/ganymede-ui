import { useEffect, useSyncExternalStore } from 'react';
import { megabytes } from '../lib/data-read';
import {
  duckdbFilesState,
  loadDuckdbFiles,
  onDuckdbFilesState,
  readCachedDuckdbFiles,
} from '../lib/duckdb-files';

/**
 * Settings' Offline SQL (#794): downloads DuckDB's wasm and worker into
 * this browser now, with progress and another try after a failure,
 * instead of on the first use of SQL, the DuckDB console or a Parquet
 * file. Hidden where the page has no Cache Storage to keep them in.
 */
export function OfflineSqlSection() {
  const state = useSyncExternalStore(onDuckdbFilesState, duckdbFilesState);

  // Whether an earlier visit has them; fetches nothing.
  useEffect(() => void readCachedDuckdbFiles(), []);

  if (typeof caches === 'undefined') return null;

  return (
    <section>
      <h3>Offline SQL</h3>
      <div className="form-rows">
        <p className="hint">
          SQL in notebooks, the DuckDB console and Parquet files run on DuckDB, which this browser
          downloads from jsDelivr (36 MB) the first time one of them is used, and then keeps.
          Download it now to use them offline. Kernels started after the download run SQL offline.
        </p>
        <div className="settings-test">
          {state.state !== 'ready' && (
            <button
              type="button"
              className="push-button"
              disabled={state.state === 'loading'}
              onClick={() => void loadDuckdbFiles({ asked: true })}
            >
              {state.state === 'failed' ? 'Try Again' : 'Download DuckDB'}
            </button>
          )}
          {state.state === 'loading' && (
            <>
              <progress
                aria-label="DuckDB download"
                max={state.total ?? undefined}
                value={state.total ? state.received : undefined}
              />
              <span role="status">
                {state.received === 0
                  ? 'Downloading…'
                  : state.total
                    ? `${megabytes(state.received)} of ${megabytes(state.total)}`
                    : megabytes(state.received)}
              </span>
            </>
          )}
          {state.state === 'ready' && (
            <span role="status" className="test-ok">
              Downloaded. SQL works offline in this browser.
            </span>
          )}
          {state.state === 'failed' && (
            <span role="status" className="test-failed">
              DuckDB didn&rsquo;t download: {state.message}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
