// Pi's models for the agent's settings (ganymede-ui#165). The app loads this
// module, and with it pi-ai's providers, only once the agent is on.

import type { CredentialStore, Model, Models } from '@earendil-works/pi-ai';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import type { AgentSettings } from './settings';

/** A local OpenAI-compatible server, with the one model the settings name. */
function localProvider(settings: AgentSettings) {
  const model: Model<'openai-completions'> = {
    id: settings.model,
    name: settings.model,
    api: 'openai-completions',
    provider: 'local',
    baseUrl: settings.baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16000,
    // Ollama, LM Studio and the like take neither the `developer` role nor
    // `reasoning_effort`.
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
  };
  return createProvider({
    id: 'local',
    name: 'Local server',
    baseUrl: settings.baseUrl,
    // A key is optional. pi-ai's OpenAI client won't send a request without
    // one, so a server that takes none gets a placeholder, which Ollama and
    // LM Studio ignore.
    auth: {
      apiKey: {
        name: 'Local server key',
        resolve: async ({ credential }) => ({
          auth: { apiKey: credential?.key || 'none' },
          source: credential?.key ? 'stored credential' : 'none',
        }),
      },
    },
    models: [model],
    api: openAICompletionsApi(),
  });
}

/** Pi's models for the settings' provider, reading keys from `credentials`. */
export function modelsFor(settings: AgentSettings, credentials: CredentialStore): Models {
  const models = createModels({ credentials });
  switch (settings.provider) {
    case 'anthropic':
      models.setProvider(anthropicProvider());
      break;
    case 'openai':
      models.setProvider(openaiProvider());
      break;
    case 'google':
      models.setProvider(googleProvider());
      break;
    case 'local':
      models.setProvider(localProvider(settings));
      break;
  }
  return models;
}

/** The chat models a provider offers, for the Settings sheet's list. Empty for a local server. */
export function modelIds(settings: AgentSettings, credentials: CredentialStore): string[] {
  if (settings.provider === 'local') return [];
  return modelsFor(settings, credentials)
    .getModels(settings.provider)
    .filter(m => m.type === undefined || m.type === 'chat')
    .map(m => m.id);
}

export interface TestResult {
  ok: boolean;
  message: string;
}

/** The browser's bare "Connection error." says nothing about why. */
function explain(message: string, baseUrl: string): string {
  if (!/^connection error\.?$/i.test(message.trim())) return message;
  return `Couldn't reach ${new URL(baseUrl).host}: it isn't running, or it doesn't let this page call it (CORS).`;
}

/**
 * Sends one short request to the settings' model: checks the key, the model
 * name, and that the browser lets the page reach the provider (CORS).
 */
export async function testModel(
  settings: AgentSettings,
  credentials: CredentialStore,
  signal?: AbortSignal,
): Promise<TestResult> {
  try {
    const models = modelsFor(settings, credentials);
    const model = models.getModel(settings.provider, settings.model);
    if (!model) {
      return { ok: false, message: `${settings.provider} has no model ${settings.model}.` };
    }
    const reply = await models.complete(
      model,
      { messages: [{ role: 'user', content: 'Reply with the word OK.', timestamp: Date.now() }] },
      { maxTokens: 16, signal },
    );
    if (reply.stopReason === 'error' || reply.stopReason === 'aborted') {
      return { ok: false, message: explain(reply.errorMessage ?? reply.stopReason, model.baseUrl) };
    }
    return { ok: true, message: `${model.name} answered.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
