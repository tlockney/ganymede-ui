import type { Kernel } from '@jupyterlab/services';

/**
 * The Variables view (#242): what the cells defined, read with the Jupyter
 * debugger protocol's `inspectVariables` and, for an object's members,
 * `variables`. cdp-kernel (src/debugger.ts) and ipykernel answer both
 * without a debug session running. A kernel whose `kernel_info_reply`
 * doesn't set `debugger: true` can't list them.
 */
export type Variable = {
  name: string;
  /** The value as the kernel writes it, short. */
  value: string;
  type: string;
  /** Above 0 when it has members, to ask `variables` for. */
  variablesReference: number;
};

/** The subset of a kernel connection this needs; a fake in tests. */
export type DebugKernel = Pick<Kernel.IKernelConnection, 'requestDebug' | 'info'>;

let seq = 0;

/** One debug request's response body; throws when the kernel says it failed. */
async function debugRequest(
  kernel: DebugKernel,
  command: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const future = kernel.requestDebug({ type: 'request', seq: ++seq, command, arguments: args });
  const reply = await future.done;
  const content = reply.content as {
    success?: boolean;
    message?: string;
    body?: Record<string, unknown>;
  };
  if (content.success === false) throw new Error(content.message || `${command} failed`);
  return content.body ?? {};
}

/** Whether the kernel says it speaks the debugger protocol. */
export async function canListVariables(kernel: DebugKernel): Promise<boolean> {
  const info = (await kernel.info) as { debugger?: boolean };
  return info.debugger === true;
}

/** The variables a body lists, cleaned up: names, values and types as strings. Pure. */
export function readVariables(body: Record<string, unknown>): Variable[] {
  const list = Array.isArray(body.variables) ? body.variables : [];
  return list.flatMap(v => {
    if (!v || typeof v !== 'object') return [];
    const { name, value, type, variablesReference } = v as Record<string, unknown>;
    if (typeof name !== 'string' || !name) return [];
    return [
      {
        name,
        value: typeof value === 'string' ? value : value === undefined ? '' : String(value),
        type: typeof type === 'string' ? type : '',
        variablesReference:
          typeof variablesReference === 'number' && variablesReference > 0 ? variablesReference : 0,
      },
    ];
  });
}

/** The cells' variables, sorted by name. */
export async function inspectVariables(kernel: DebugKernel): Promise<Variable[]> {
  const body = await debugRequest(kernel, 'inspectVariables');
  return readVariables(body).sort((a, b) => a.name.localeCompare(b.name));
}

/** An object's members, as the kernel orders them. */
export async function childVariables(kernel: DebugKernel, reference: number): Promise<Variable[]> {
  const body = await debugRequest(kernel, 'variables', { variablesReference: reference });
  return readVariables(body);
}
