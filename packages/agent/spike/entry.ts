// What the app would load when the agent is turned on: the harness, browser
// storage, and the providers offered in Settings. Built by vite.spike.config.ts
// only to measure its size.
import { createModels } from '@earendil-works/pi-ai/models';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { IndexedDbStorage } from '@earendil-works/pi-durable/storage/indexeddb';
import { openAgent } from '../src/index';

export async function start(target: Parameters<typeof openAgent>[0]['target']) {
  const models = createModels();
  models.setProvider(anthropicProvider());
  models.setProvider(openaiProvider());
  models.setProvider(googleProvider());
  return openAgent({
    storage: await IndexedDbStorage.open('ganymede-agent'),
    models,
    model: { provider: 'anthropic', modelId: 'claude-sonnet-5-5' },
    target,
    approve: async () => window.confirm('Run this code?'),
  });
}
