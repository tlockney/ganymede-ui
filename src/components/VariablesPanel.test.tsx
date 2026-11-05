import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VariablesPanel } from './VariablesPanel';
import { debugKernel } from '../test/debug-kernel';

const cells = (rows: HTMLElement[]) =>
  rows.slice(1).map(r => [...r.querySelectorAll('td')].map(td => td.textContent));

describe('VariablesPanel', () => {
  it('lists the variables, expands an object one level, and reads them again after a run', async () => {
    let x = '1';
    const kernel = debugKernel({
      inspectVariables: () => ({
        variables: [
          { name: 'x', value: x, type: 'number', variablesReference: 0 },
          { name: 'moon', value: '{name, radius}', type: 'object', variablesReference: 5 },
        ],
      }),
      variables: (args: Record<string, unknown>) =>
        args.variablesReference === 5
          ? {
              variables: [
                { name: 'name', value: '"Io"', type: 'string', variablesReference: 0 },
                { name: 'orbit', value: '{…}', type: 'object', variablesReference: 6 },
              ],
            }
          : { variables: [{ name: 'days', value: '1.77', type: 'number' }] },
    });
    const { rerender } = render(
      <VariablesPanel kernel={kernel} status="idle" onClose={() => {}} />,
    );
    await waitFor(() =>
      expect(cells(screen.getAllByRole('row'))).toEqual([
        ['▸moon', 'object', '{name, radius}'],
        ['x', 'number', '1'],
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Expand moon' }));
    await waitFor(() =>
      expect(cells(screen.getAllByRole('row'))).toEqual([
        ['▾moon', 'object', '{name, radius}'],
        ['name', 'string', '"Io"'],
        ['▸orbit', 'object', '{…}'],
        ['x', 'number', '1'],
      ]),
    );
    // One level at a time.
    expect(screen.queryByText('days')).not.toBeInTheDocument();

    // A run: busy, then idle. The list is read again, moon still open.
    x = '2';
    rerender(<VariablesPanel kernel={kernel} status="busy" onClose={() => {}} />);
    rerender(<VariablesPanel kernel={kernel} status="idle" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(screen.getByText('"Io"')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Collapse moon' }));
    expect(screen.queryByText('"Io"')).not.toBeInTheDocument();
  });

  it('says when there is no kernel yet, or it can’t list variables', async () => {
    const { rerender } = render(<VariablesPanel onClose={() => {}} />);
    expect(screen.getByText('Run a cell to see its variables.')).toBeInTheDocument();
    rerender(
      <VariablesPanel
        kernel={debugKernel({}, { debugger: false })}
        status="idle"
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText('This kernel can’t list variables.')).toBeInTheDocument();
  });

  it('says why the variables couldn’t be read', async () => {
    render(<VariablesPanel kernel={debugKernel({})} status="idle" onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t read the variables: no inspectVariables',
    );
  });

  it('waits for the kernel to be idle, and closes', async () => {
    const kernel = debugKernel({ inspectVariables: { variables: [] } });
    const onClose = vi.fn();
    render(<VariablesPanel kernel={kernel} status="busy" onClose={onClose} />);
    await act(() => new Promise(r => setTimeout(r, 300)));
    expect(kernel.requestDebug).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTitle('Close Variables'));
    expect(onClose).toHaveBeenCalled();
  });
});
