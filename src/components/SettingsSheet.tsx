import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type AgentSettings,
  type BrowserCredentialStore,
  DEFAULT_SETTINGS,
  PROVIDERS,
  type ProviderId,
  credentials as pageCredentials,
  keyOnly,
  loadAgentSettings,
  providerInfo,
  saveAgentSettings,
} from '@ganymede-ui/agent/settings';

/** The agent's runtime: pi-ai and its providers, loaded only once the agent is on. */
export type AgentModels = typeof import('@ganymede-ui/agent/models');
const loadAgentModels = (): Promise<AgentModels> => import('@ganymede-ui/agent/models');

type Props = {
  onClose(): void;
  /** For tests: the key store and the runtime loader. */
  store?: BrowserCredentialStore;
  loadModels?: () => Promise<AgentModels>;
};

type Test = { state: 'running' } | { state: 'done'; ok: boolean; message: string };

/** App settings. For now only the optional agent (ganymede-ui#123): off, or a provider, model and key. */
export function SettingsSheet({
  onClose,
  store = pageCredentials,
  loadModels = loadAgentModels,
}: Props) {
  const [settings, setSettings] = useState<AgentSettings>(() => loadAgentSettings());
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [models, setModels] = useState<AgentModels>();
  const [test, setTest] = useState<Test>();
  const [error, setError] = useState<string>();
  const testAbort = useRef<AbortController>(undefined);
  const info = providerInfo(settings.provider);

  // The provider's saved key, when the sheet opens and when the provider changes.
  useEffect(() => {
    let cancelled = false;
    void store.read(settings.provider).then(c => {
      if (cancelled) return;
      setKey(c?.type === 'api_key' ? (c.key ?? '') : '');
      setRemember(store.remembered(settings.provider));
    });
    return () => {
      cancelled = true;
    };
  }, [store, settings.provider]);

  // The runtime, for the model list and the Test button, once the agent is on.
  useEffect(() => {
    if (!settings.enabled || models) return;
    let cancelled = false;
    loadModels().then(
      m => {
        if (cancelled) return;
        setError(undefined);
        setModels(m);
      },
      e => !cancelled && setError(`The agent didn't load: ${e instanceof Error ? e.message : e}`),
    );
    return () => {
      cancelled = true;
    };
  }, [settings.enabled, models, loadModels]);

  useEffect(() => () => testAbort.current?.abort(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const update = (patch: Partial<AgentSettings>) => {
    testAbort.current?.abort();
    setTest(undefined);
    setSettings(s => ({ ...s, ...patch }));
  };

  const pickProvider = (provider: ProviderId) =>
    update({ provider, model: providerInfo(provider).defaultModel });

  // The catalog depends on the provider alone, not on each keystroke.
  const { enabled, provider } = settings;
  const modelIds = useMemo(
    () =>
      models && enabled
        ? models.modelIds({ ...DEFAULT_SETTINGS, enabled, provider }, keyOnly(provider, ''))
        : [],
    [models, enabled, provider],
  );

  // Saved keys, offered for removal while the agent is off.
  const [savedKeys, setSavedKeys] = useState(0);
  useEffect(() => {
    if (enabled) return;
    let cancelled = false;
    void store.list().then(list => !cancelled && setSavedKeys(list.length));
    return () => {
      cancelled = true;
    };
  }, [store, enabled]);

  const forgetKeys = async () => {
    for (const { providerId } of await store.list()) await store.delete(providerId);
    setSavedKeys(0);
    setKey('');
    setRemember(false);
  };

  const trimmed = (): AgentSettings => ({
    ...settings,
    model: settings.model.trim(),
    baseUrl: settings.baseUrl.trim(),
  });

  const runTest = async () => {
    if (!models) return;
    testAbort.current?.abort();
    const abort = new AbortController();
    testAbort.current = abort;
    setTest({ state: 'running' });
    let result: { ok: boolean; message: string };
    try {
      result = await models.testModel(
        trimmed(),
        keyOnly(settings.provider, key.trim()),
        abort.signal,
      );
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    if (!abort.signal.aborted) setTest({ state: 'done', ...result });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    const next = trimmed();
    try {
      if (next.enabled) await store.setKey(next.provider, key.trim(), remember);
      saveAgentSettings(next);
      onClose();
    } catch (err) {
      setError(`The key wasn't saved: ${err instanceof Error ? err.message : err}`);
    }
  };

  return (
    // No close on a backdrop click, as in the connect sheet: a text
    // selection dragged out of a field would end there and drop the edits.
    <div className="sheet-backdrop">
      <form
        className="sheet settings-sheet"
        role="dialog"
        aria-labelledby="settings-title"
        onSubmit={save}
      >
        <h2 id="settings-title">Settings</h2>
        <section>
          <h3>Agent</h3>
          <div className="form-rows">
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={e => update({ enabled: e.target.checked })}
              />
              <span>Turn on the agent</span>
            </label>
            {!settings.enabled && (
              <p className="hint">
                An assistant that can edit and run this notebook, with a model you choose. Off until
                you turn it on; nothing of it loads until then.
                {savedKeys > 0 && (
                  <>
                    {' '}
                    Turning it off keeps your saved keys.{' '}
                    <button type="button" className="link-button" onClick={() => void forgetKeys()}>
                      Forget saved keys
                    </button>
                  </>
                )}
              </p>
            )}
            {settings.enabled && (
              <>
                <label>
                  <span>Provider</span>
                  <select
                    value={settings.provider}
                    onChange={e => pickProvider(e.target.value as ProviderId)}
                  >
                    {PROVIDERS.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Model</span>
                  <input
                    list="agent-models"
                    value={settings.model}
                    required
                    autoComplete="off"
                    spellCheck={false}
                    onChange={e => update({ model: e.target.value })}
                  />
                  <datalist id="agent-models">
                    {modelIds.map(id => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                </label>
                {settings.provider === 'local' && (
                  <label>
                    <span>Server</span>
                    <input
                      type="url"
                      value={settings.baseUrl}
                      required
                      onChange={e => update({ baseUrl: e.target.value })}
                    />
                  </label>
                )}
                <label>
                  <span>Key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={info.needsKey ? `${info.name} API key` : 'Optional'}
                    value={key}
                    onChange={e => {
                      setTest(undefined);
                      setKey(e.target.value);
                    }}
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                  />
                  <span>Remember the key on this device</span>
                </label>
                <p className="hint">
                  {settings.provider === 'local' ? (
                    <>
                      Ollama or LM Studio. Ollama answers this page only if it allows its origin:{' '}
                      <code>OLLAMA_ORIGINS={window.location.origin}</code>.
                    </>
                  ) : (
                    <>The key goes only to {info.name}, from this page.</>
                  )}{' '}
                  Without Remember, the key lasts until this tab closes. Remembered, any page on
                  this origin can read it.
                </p>
                <div className="settings-test">
                  <button
                    type="button"
                    className="push-button"
                    disabled={!models || test?.state === 'running'}
                    onClick={() => void runTest()}
                  >
                    {test?.state === 'running' ? 'Testing…' : 'Test'}
                  </button>
                  {test?.state === 'done' && (
                    <span className={test.ok ? 'test-ok' : 'test-failed'} role="status">
                      {test.message}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {error && <p className="sheet-error">{error}</p>}

        <div className="sheet-buttons">
          <button type="button" className="push-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="push-button primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
