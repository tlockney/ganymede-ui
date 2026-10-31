// Calls each provider from a page with a bogus key (ganymede-ui#124). An
// auth error means the browser let the request through; "Connection error"
// means CORS blocked it. Build with
// SPIKE_ENTRY=spike/cors.ts npx vite build -c packages/agent/vite.spike.config.ts
// and load the bundle in a page that awaits `probe()`.
import { createModels } from '@earendil-works/pi-ai/models';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';

export async function probe(apiKey = 'sk-bogus-key'): Promise<Record<string, string>> {
  const models = createModels();
  for (const provider of [
    anthropicProvider(),
    openaiProvider(),
    googleProvider(),
    openrouterProvider(),
  ]) {
    models.setProvider(provider);
  }
  const out: Record<string, string> = {};
  for (const provider of ['anthropic', 'openai', 'google', 'openrouter']) {
    const model = models.getModels(provider)[0];
    const reply = await models.complete(
      model,
      { messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }] },
      { apiKey },
    );
    out[`${provider} (${model.api})`] = `${reply.stopReason}: ${reply.errorMessage ?? ''}`.slice(
      0,
      160,
    );
  }
  return out;
}
