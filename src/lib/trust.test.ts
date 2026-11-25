import { describe, expect, it } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import { sameOutputs } from './trust';

const html = (value: nbformat.MultilineString, extra: object = {}) =>
  ({
    output_type: 'display_data',
    data: { 'text/html': value },
    metadata: {},
    ...extra,
  }) as nbformat.IOutput;

describe('sameOutputs (#793)', () => {
  it('matches the same outputs, whatever the key order', () => {
    const saved = [
      { metadata: {}, data: { 'text/html': '<b>Io</b>' }, output_type: 'display_data' },
    ] as nbformat.IOutput[];
    expect(sameOutputs([html('<b>Io</b>')], saved)).toBe(true);
    expect(sameOutputs([], [])).toBe(true);
  });

  it('matches text a file splits into lines', () => {
    expect(sameOutputs([html('a\nb')], [html(['a\n', 'b'])])).toBe(true);
    const stream = (text: nbformat.MultilineString) =>
      ({ output_type: 'stream', name: 'stdout', text }) as nbformat.IOutput;
    expect(sameOutputs([stream('a\nb\n')], [stream(['a\n', 'b\n'])])).toBe(true);
    expect(sameOutputs([stream('a\nb\n')], [stream(['a\n', 'c\n'])])).toBe(false);
  });

  it('never joins a JSON value’s array', () => {
    const json = (value: unknown) =>
      ({
        output_type: 'display_data',
        data: { 'application/json': value },
        metadata: {},
      }) as nbformat.IOutput;
    expect(sameOutputs([json('ab')], [json(['a', 'b'])])).toBe(false);
    expect(sameOutputs([json(['a', 'b'])], [json(['a', 'b'])])).toBe(true);
  });

  it('ignores `transient`, which a file never holds', () => {
    expect(sameOutputs([html('x', { transient: { display_id: 'd' } })], [html('x')])).toBe(true);
  });

  it('reads undefined as JSON does: a key left out, null in an array', () => {
    expect(sameOutputs([html('x', { execution_count: undefined })], [html('x')])).toBe(true);
    const json = (value: unknown) =>
      ({
        output_type: 'display_data',
        data: { 'application/json': value },
        metadata: {},
      }) as nbformat.IOutput;
    expect(sameOutputs([json([undefined])], [json([null])])).toBe(true);
    expect(sameOutputs([json([undefined])], [json([])])).toBe(false);
  });

  it('tells apart any other difference', () => {
    expect(sameOutputs([html('<b>Io</b>')], [html('<b>Europa</b>')])).toBe(false);
    expect(sameOutputs([html('x', { metadata: { isolated: true } })], [html('x')])).toBe(false);
    expect(sameOutputs([html('x')], [html('x'), html('x')])).toBe(false);
    expect(sameOutputs([html('x'), html('y')], [html('y'), html('x')])).toBe(false);
    expect(
      sameOutputs(
        [{ output_type: 'execute_result', execution_count: 1, data: {}, metadata: {} }],
        [{ output_type: 'execute_result', execution_count: 2, data: {}, metadata: {} }],
      ),
    ).toBe(false);
  });
});
