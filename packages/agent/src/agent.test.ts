// @vitest-environment node
import 'fake-indexeddb/auto';
import { YNotebook } from '@jupyter/ydoc';
import type { Kernel, KernelMessage } from '@jupyterlab/services';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import { MemoryStorage, ToolResultEntry } from '@earendil-works/pi-durable';
import { IndexedDbStorage } from '@earendil-works/pi-durable/storage/indexeddb';
import { describe, expect, it } from 'vitest';
import { openAgent, type NotebookTarget } from './index';

/** A kernel connection that answers execute requests with `print` output, or never. */
function fakeKernel(options: { hang?: boolean } = {}) {
  const ran: string[] = [];
  const kernel = {
    requestExecute(content: { code: string }) {
      ran.push(content.code);
      const future: {
        onIOPub?: (msg: KernelMessage.IIOPubMessage) => void;
        done: Promise<unknown>;
      } = {
        done: options.hang
          ? new Promise(() => {})
          : Promise.resolve().then(() => {
              future.onIOPub?.({
                header: { msg_type: 'stream' },
                content: { name: 'stdout', text: `ran: ${content.code}\n` },
              } as unknown as KernelMessage.IIOPubMessage);
              return { content: { status: 'ok' } };
            }),
      };
      return future;
    },
  };
  return { kernel: kernel as unknown as Kernel.IKernelConnection, ran };
}

/** A model turn that calls one tool. */
function call(name: string, args: Parameters<typeof fauxToolCall>[1]) {
  return fauxAssistantMessage(fauxToolCall(name, args), { stopReason: 'toolUse' });
}

function setup() {
  const notebook = YNotebook.create();
  notebook.insertCell(0, { cell_type: 'code', source: 'const x = 1;' });
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel();
  return { notebook, faux, models, model: { provider: model.provider, modelId: model.id } };
}

async function toolResults(root: Awaited<ReturnType<typeof openAgent>>['root'], context: never) {
  const page = await root.entries({ order: 'ascending' }, 100, undefined, context);
  return page.items
    .filter(entry => ToolResultEntry.is(entry))
    .map(entry => {
      const message = entry.model?.[0] as {
        toolName: string;
        isError: boolean;
        content: { text: string }[];
      };
      return { tool: message.toolName, error: message.isError, text: message.content[0]?.text };
    });
}

describe('notebook agent', () => {
  it('reads and edits the notebook and runs code in its kernel', async () => {
    const { notebook, faux, models, model } = setup();
    const { kernel, ran } = fakeKernel();
    const target: NotebookTarget = { notebook: () => notebook, kernel: () => kernel };
    const asked: string[] = [];
    faux.setResponses([
      call('notebook_read', {}),
      call('notebook_edit', { op: 'insert', index: 1, source: 'console.log(x)' }),
      call('kernel_execute', { code: 'console.log(x)' }),
      fauxAssistantMessage(fauxText('Added a cell that prints x.')),
    ]);
    const { harness, root, context } = await openAgent({
      storage: new MemoryStorage(),
      models,
      model,
      target,
      approve: async call => {
        asked.push(call.name);
        return true;
      },
    });

    const submission = await root.submit({ type: 'input', content: 'Print x' }, context);
    const settled = await submission.wait(context);

    expect(settled.status).toBe('done');
    expect(notebook.cells.map(cell => cell.getSource())).toEqual([
      'const x = 1;',
      'console.log(x)',
    ]);
    expect(ran).toEqual(['console.log(x)']);
    expect(asked).toEqual(['kernel_execute']);
    const results = await toolResults(root, context as never);
    expect(results[0]).toMatchObject({ tool: 'notebook_read', error: false });
    expect(results[0].text).toContain('const x = 1;');
    expect(results[2]).toMatchObject({ tool: 'kernel_execute', text: 'ran: console.log(x)\n' });
    await harness.close(context);
  });

  it('does not run code the person declines', async () => {
    const { notebook, faux, models, model } = setup();
    const { kernel, ran } = fakeKernel();
    faux.setResponses([
      call('kernel_execute', { code: 'rm()' }),
      fauxAssistantMessage(fauxText('Understood.')),
    ]);
    const { harness, root, context } = await openAgent({
      storage: new MemoryStorage(),
      models,
      model,
      target: { notebook: () => notebook, kernel: () => kernel },
      approve: async () => false,
    });

    const settled = await (
      await root.submit({ type: 'input', content: 'go' }, context)
    ).wait(context);

    expect(settled.status).toBe('done');
    expect(ran).toEqual([]);
    const results = await toolResults(root, context as never);
    expect(results[0]).toMatchObject({ tool: 'kernel_execute', error: true });
    expect(results[0].text).toContain('declined');
    await harness.close(context);
  });

  it('resumes from IndexedDB after the page dies mid-run', async () => {
    const name = `agent-${Math.random()}`;
    const { notebook, faux, models, model } = setup();
    const stuck = fakeKernel({ hang: true });
    faux.setResponses([
      call('notebook_edit', { op: 'insert', index: 1, source: 'slow()' }),
      call('kernel_execute', { code: 'slow()' }),
    ]);
    const first = await openAgent({
      storage: await IndexedDbStorage.open(name),
      models,
      model,
      target: { notebook: () => notebook, kernel: () => stuck.kernel },
      approve: async () => true,
    });
    const submission = await first.root.submit(
      { type: 'input', content: 'run slow', requestId: 'r1' },
      first.context,
    );
    // Wait until the kernel call is in flight, then drop the first page without closing.
    await expect.poll(() => stuck.ran.length).toBe(1);

    // A new page: same database, fresh objects, a kernel that answers.
    const again = setup();
    again.faux.setResponses([fauxAssistantMessage(fauxText('The kernel call was interrupted.'))]);
    const fresh = fakeKernel();
    const second = await openAgent({
      storage: await IndexedDbStorage.open(name),
      models: again.models,
      model: again.model,
      target: { notebook: () => notebook, kernel: () => fresh.kernel },
      approve: async () => true,
    });
    const resumed = await second.harness.submission(submission.id, second.context);
    const settled = await resumed!.wait(second.context);

    expect(settled.status).toBe('done');
    // Running code is not replay-safe: the call is reported interrupted, not run twice.
    expect(fresh.ran).toEqual([]);
    const results = await toolResults(second.root, second.context as never);
    expect(results.map(r => [r.tool, r.error])).toEqual([
      ['notebook_edit', false],
      ['kernel_execute', true],
    ]);
    expect(results[1].text).toMatch(/interrupt/i);
    await second.harness.close(second.context);
  });
});
