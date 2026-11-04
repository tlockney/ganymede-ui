/**
 * The agent's settings for the iPad and iPhone apps' Settings screen
 * (#210). The settings stay the page's (`localStorage`, as the Settings
 * sheet keeps them); the app reads and saves them, lists models and runs
 * Test through `window.ganymede.call`. The API key isn't here: the app
 * keeps it in the Keychain itself, where the page reads it.
 */
import {
  type AgentSettings,
  DEFAULT_LOCAL_URL,
  DEFAULT_SETTINGS,
  PROVIDERS,
  type ProviderInfo,
  keyOnly,
  loadAgentSettings,
  providerInfo,
  saveAgentSettings,
} from '@ganymede-ui/agent/settings';

/** The agent's runtime, loaded only when asked for models or a test. */
type AgentModels = typeof import('@ganymede-ui/agent/models');
const loadAgentModels = (): Promise<AgentModels> => import('@ganymede-ui/agent/models');

/** What the app's Settings screen shows: the settings and the providers to pick from. */
export type AgentPanel = AgentSettings & { providers: readonly ProviderInfo[] };

/** Settings from the app's JSON, with the Settings sheet's defaults and trimming. */
export function agentSettingsFrom(json: string | undefined): AgentSettings {
  const settings = loadAgentSettings({ getItem: () => json ?? null } as unknown as Storage);
  // Blank after trimming takes the default too: a blank server URL would
  // send a local test's key to api.openai.com.
  return {
    ...settings,
    model: settings.model.trim() || providerInfo(settings.provider).defaultModel,
    baseUrl: settings.baseUrl.trim() || DEFAULT_LOCAL_URL,
  };
}

/**
 * Answers one call: `agent-settings` (an `AgentPanel`),
 * `save-agent-settings` (settings JSON; answers what was saved),
 * `agent-models` (a provider id; its model ids) or `test-agent` (settings
 * JSON with the `key` typed; `{ok, message}`). Throws for anything else,
 * so the app hears of it.
 */
export async function agentCall(
  id: string,
  arg: string | undefined,
  loadModels: () => Promise<AgentModels> = loadAgentModels,
): Promise<unknown> {
  switch (id) {
    case 'agent-settings':
      return { ...loadAgentSettings(), providers: PROVIDERS } satisfies AgentPanel;
    case 'save-agent-settings': {
      const settings = agentSettingsFrom(arg);
      saveAgentSettings(settings);
      return settings;
    }
    case 'agent-models': {
      const provider = PROVIDERS.find(p => p.id === arg)?.id;
      if (!provider) return [];
      const models = await loadModels();
      return models.modelIds(
        { ...DEFAULT_SETTINGS, enabled: true, provider },
        keyOnly(provider, ''),
      );
    }
    case 'test-agent': {
      // The settings and, beside them, the key typed (not yet saved).
      let key = '';
      try {
        const raw = JSON.parse(arg ?? '{}') as { key?: unknown };
        if (typeof raw.key === 'string') key = raw.key.trim();
      } catch {
        // agentSettingsFrom gives the defaults for this too.
      }
      const settings = agentSettingsFrom(arg);
      try {
        const models = await loadModels();
        return await models.testModel(settings, keyOnly(settings.provider, key));
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  throw new Error(`No page call ${id}`);
}
