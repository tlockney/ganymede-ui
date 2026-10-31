// Opens a durable agent session for ganymede-ui.
//
// Spike for tlockney/ganymede-ui#124. The storage is the caller's choice:
// IndexedDbStorage in the app, MemoryStorage in tests.

import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Models } from '@earendil-works/pi-ai/models';
import { createRegistry, Harness, type Storage } from '@earendil-works/pi-durable';
import { createNotebookExtension, type Approve, type NotebookTarget } from './tools';

export { createNotebookExtension, execute, outputText, RUNS_CODE } from './tools';
export type { Approve, NotebookTarget } from './tools';

export interface AgentOptions {
  storage: Storage;
  models: Models;
  model: { provider: string; modelId: string };
  target: NotebookTarget;
  approve: Approve;
}

export async function openAgent(options: AgentOptions) {
  const context = BACKGROUND_CONTEXT;
  const registry = createRegistry();
  registry.install(createNotebookExtension(options.target, options.approve));
  const harness = await Harness.open(
    options.storage,
    {
      models: options.models,
      registry,
      identity: { attribution: { name: 'Ganymede', url: 'https://ganymede-server.com' } },
    },
    context,
  );
  const root = await harness.root(context, { agent: { model: options.model } });
  // Continue a run an earlier page left unfinished.
  harness.resume();
  return { harness, root, context };
}
