// Tools that let a Pi Durable agent work on the notebook a person has open.
//
// They go through the same objects the app already uses: the notebook's
// shared model (so edits show in the open notebook at once and the app's
// saver stays the only writer) and the notebook's kernel connection from
// @jupyterlab/services. Nothing here knows which backend is behind them, so
// the tools work the same against Ganymede, the in-page kernels or any
// Jupyter server.

import type { Kernel, KernelMessage } from '@jupyterlab/services';
import type { ISharedNotebook } from '@jupyter/ydoc';
import { Type } from '@earendil-works/pi-ai';
import {
  defineExtension,
  defineTool,
  hook,
  section,
  ToolTask,
  type Extension,
} from '@earendil-works/pi-durable';

/** What the tools act on. Getters, so they follow the notebook the person has open now. */
export interface NotebookTarget {
  notebook(): ISharedNotebook | undefined;
  kernel(): Kernel.IKernelConnection | null | undefined;
}

/**
 * Asked before a tool that runs code. Resolves true to run it. Runs before the
 * call's intent is stored, so after a crash the question is asked again.
 */
export type Approve = (call: {
  name: string;
  arguments: Record<string, unknown>;
}) => Promise<boolean>;

/** Tools that run code and so need approval. */
export const RUNS_CODE: ReadonlySet<string> = new Set(['kernel_execute']);

const MAX_TEXT = 4000;

function clip(text: string): string {
  return text.length > MAX_TEXT
    ? `${text.slice(0, MAX_TEXT)}\n[... ${text.length - MAX_TEXT} more characters]`
    : text;
}

function text(value: string) {
  return { output: [{ type: 'text' as const, text: value }] };
}

function fail(message: string) {
  return { ...text(message), isError: true };
}

/** One output, as text the model can read. Rich outputs are named, not inlined. */
export function outputText(output: Record<string, unknown>): string {
  switch (output.output_type) {
    case 'stream':
      return joinSource(output.text);
    case 'error':
      return `${String(output.ename)}: ${String(output.evalue)}`;
    case 'execute_result':
    case 'display_data': {
      const data = (output.data ?? {}) as Record<string, unknown>;
      if ('text/plain' in data) return joinSource(data['text/plain']);
      return `[${Object.keys(data).join(', ')}]`;
    }
    default:
      return '';
  }
}

function joinSource(value: unknown): string {
  return Array.isArray(value) ? value.join('') : String(value ?? '');
}

function describeNotebook(notebook: ISharedNotebook): string {
  if (notebook.cells.length === 0) return 'The notebook has no cells.';
  return notebook.cells
    .map((cell, index) => {
      const head = `--- cell ${index} (${cell.cell_type}) ---`;
      const outputs =
        cell.cell_type === 'code'
          ? (cell.toJSON().outputs as Record<string, unknown>[] | undefined)
              ?.map(outputText)
              .filter(Boolean)
              .join('')
          : '';
      return [head, cell.getSource(), outputs ? `[output]\n${outputs}` : '']
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}

/** Runs `code` and collects what the kernel prints, as a person would see it. */
export async function execute(
  kernel: Kernel.IKernelConnection,
  code: string,
): Promise<{ ok: boolean; text: string }> {
  const parts: string[] = [];
  const future = kernel.requestExecute({ code, store_history: false, stop_on_error: true });
  future.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
    const type = msg.header.msg_type;
    if (
      type === 'stream' ||
      type === 'error' ||
      type === 'execute_result' ||
      type === 'display_data'
    ) {
      parts.push(outputText({ output_type: type, ...(msg.content as Record<string, unknown>) }));
    }
  };
  const reply = await future.done;
  return { ok: reply.content.status === 'ok', text: parts.join('') };
}

export function createNotebookExtension(target: NotebookTarget, approve: Approve): Extension {
  const read = defineTool({
    name: 'notebook_read',
    description:
      'Read the open notebook: every cell with its index, type, source and text outputs.',
    parameters: Type.Object({}),
    replay: 'safe',
    execute: async () => {
      const notebook = target.notebook();
      if (!notebook) return fail('No notebook is open.');
      return text(clip(describeNotebook(notebook)));
    },
  });

  const edit = defineTool({
    name: 'notebook_edit',
    description:
      'Change the open notebook. "insert" adds a cell before `index` (use the cell count to append), ' +
      '"replace" sets the source of the cell at `index`, "delete" removes it.',
    parameters: Type.Object({
      op: Type.Union([Type.Literal('insert'), Type.Literal('replace'), Type.Literal('delete')]),
      index: Type.Integer({ minimum: 0 }),
      cell_type: Type.Optional(Type.Union([Type.Literal('code'), Type.Literal('markdown')])),
      source: Type.Optional(Type.String()),
    }),
    execute: async args => {
      const notebook = target.notebook();
      if (!notebook) return fail('No notebook is open.');
      const count = notebook.cells.length;
      if (args.op === 'insert') {
        if (args.index > count)
          return fail(`index ${args.index} is past the end (${count} cells).`);
        notebook.insertCell(args.index, {
          cell_type: args.cell_type ?? 'code',
          source: args.source ?? '',
        });
        return text(`Inserted a ${args.cell_type ?? 'code'} cell at ${args.index}.`);
      }
      if (args.index >= count) return fail(`No cell ${args.index} (${count} cells).`);
      if (args.op === 'replace') {
        notebook.cells[args.index].setSource(args.source ?? '');
        return text(`Replaced the source of cell ${args.index}.`);
      }
      notebook.deleteCell(args.index);
      return text(`Deleted cell ${args.index}.`);
    },
  });

  const run = defineTool({
    name: 'kernel_execute',
    description:
      "Run code in the open notebook's kernel and return what it printed. " +
      'State persists between calls, as in the notebook.',
    parameters: Type.Object({ code: Type.String() }),
    executionMode: 'sequential',
    execute: async args => {
      const kernel = target.kernel();
      if (!kernel) return fail('The notebook has no running kernel.');
      const result = await execute(kernel, args.code);
      return result.ok ? text(clip(result.text) || '(no output)') : fail(clip(result.text));
    },
  });

  return defineExtension({
    name: 'ganymede-notebook',
    tools: [read, edit, run],
    sections: [
      section(
        'preamble',
        () =>
          'You help with the Jupyter notebook the person has open in Ganymede. ' +
          'Read it before changing it, keep edits small, and say what you changed.',
        { tag: false },
      ),
    ],
    hooks: [
      hook(ToolTask, {
        beforeTool: async call => {
          if (!RUNS_CODE.has(call.name)) return undefined;
          const allowed = await approve({ name: call.name, arguments: call.arguments });
          return allowed ? undefined : { block: 'The person declined to run this code.' };
        },
      }),
    ],
  });
}
