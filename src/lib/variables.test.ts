import { describe, expect, it } from 'vitest';
import { debugKernel } from '../test/debug-kernel';
import { canListVariables, childVariables, inspectVariables, readVariables } from './variables';

describe('variables', () => {
  it('reads the variables a body lists, skipping what isn’t one', () => {
    expect(
      readVariables({
        variables: [
          { name: 'x', value: '1', type: 'number', variablesReference: 0 },
          { name: 'moons', value: 'Array(4)', type: 'object', variablesReference: 7 },
          { name: 'n', value: 3, type: undefined, variablesReference: -1 },
          { value: 'nameless' },
          null,
        ],
      }),
    ).toEqual([
      { name: 'x', value: '1', type: 'number', variablesReference: 0 },
      { name: 'moons', value: 'Array(4)', type: 'object', variablesReference: 7 },
      { name: 'n', value: '3', type: '', variablesReference: 0 },
    ]);
    expect(readVariables({})).toEqual([]);
  });

  it('asks inspectVariables and sorts by name', async () => {
    const kernel = debugKernel({
      inspectVariables: {
        variables: [
          { name: 'b', value: '2', type: 'number', variablesReference: 0 },
          { name: 'a', value: '1', type: 'number', variablesReference: 0 },
        ],
      },
    });
    expect((await inspectVariables(kernel)).map(v => v.name)).toEqual(['a', 'b']);
    expect(kernel.requestDebug).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'request', command: 'inspectVariables', arguments: {} }),
    );
  });

  it('asks variables for an object’s members', async () => {
    const kernel = debugKernel({
      variables: (args: Record<string, unknown>) => ({
        variables: [
          { name: '0', value: `"Io" of ${String(args.variablesReference)}`, type: 'string' },
        ],
      }),
    });
    expect(await childVariables(kernel, 7)).toEqual([
      { name: '0', value: '"Io" of 7', type: 'string', variablesReference: 0 },
    ]);
  });

  it('throws what a failed request says', async () => {
    await expect(inspectVariables(debugKernel({}))).rejects.toThrow('no inspectVariables');
  });

  it('knows a kernel without the debugger', async () => {
    expect(await canListVariables(debugKernel({}))).toBe(true);
    expect(await canListVariables(debugKernel({}, { debugger: false }))).toBe(false);
    expect(await canListVariables(debugKernel({}, {}))).toBe(false);
  });
});
