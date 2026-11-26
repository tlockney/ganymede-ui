import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { KernelSpec } from '@jupyterlab/services';
import type { PartialJSONObject } from '@lumino/coreutils';
import { ProblemNotice } from './ProblemNotice';

const spec = (name: string, display_name: string, metadata?: PartialJSONObject) => ({
  name,
  display_name,
  language: 'x',
  argv: [],
  resources: {},
  ...(metadata ? { metadata } : {}),
});

const SPECS: KernelSpec.ISpecModels = {
  default: 'python3',
  kernelspecs: {
    python3: spec('python3', 'Python 3'),
    'cdp-browser': spec('cdp-browser', 'TypeScript (in app)', {
      capabilities: { device: true },
    }),
  },
};

describe('ProblemNotice kernel picker (#648)', () => {
  it('marks a kernel that offers the device API', () => {
    render(
      <ProblemNotice
        problem={{ kind: 'missing-kernel', message: 'No kernel.', actions: ['pick-kernel'] }}
        specs={SPECS}
        onAction={vi.fn()}
        onPickKernel={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Pick a Kernel' }) as HTMLSelectElement;
    expect([...select.options].map(o => o.text)).toEqual([
      'Pick a Kernel…',
      'Python 3',
      'TypeScript (in app) ◆',
    ]);
    expect(
      screen.getByRole('option', { name: 'TypeScript (in app), offers the device API' }),
    ).toHaveAttribute('title', 'offers the device API');
    expect(screen.getByRole('option', { name: 'Python 3' })).not.toHaveAttribute('title');
  });
});

describe('ProblemNotice kernel picker where kernels run (#832)', () => {
  const down = { name: 'workmbp', reachable: false, error: 'gateway: error sending request' };

  it('marks a kernel that runs on a remote, and says when it isn’t answering', () => {
    render(
      <ProblemNotice
        problem={{ kind: 'missing-kernel', message: 'No kernel.', actions: ['pick-kernel'] }}
        specs={SPECS}
        places={{ remote: down, gateway: ['cdp-browser'] }}
        onAction={vi.fn()}
        onPickKernel={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Pick a Kernel' }) as HTMLSelectElement;
    expect([...select.options].map(o => o.text)).toEqual([
      'Pick a Kernel…',
      'Python 3',
      'TypeScript (in app) · workmbp ◆',
      'workmbp isn’t answering: gateway: error sending request',
    ]);
    expect(
      screen.getByRole('option', {
        name: 'workmbp isn’t answering: gateway: error sending request',
      }),
    ).toBeDisabled();
  });

  it("names the machine a remote runs kernels for, in a machine's window", () => {
    render(
      <ProblemNotice
        problem={{ kind: 'missing-kernel', message: 'No kernel.', actions: ['pick-kernel'] }}
        specs={SPECS}
        places={{ remote: down, gateway: ['cdp-browser'] }}
        machine="m5air"
        onAction={vi.fn()}
        onPickKernel={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Pick a Kernel' }) as HTMLSelectElement;
    expect([...select.options].map(o => o.text)).toContain(
      'm5air runs kernels on workmbp, which isn’t answering',
    );
  });

  it('shows no line while the remote answers', () => {
    render(
      <ProblemNotice
        problem={{ kind: 'missing-kernel', message: 'No kernel.', actions: ['pick-kernel'] }}
        specs={SPECS}
        places={{ remote: { ...down, reachable: true, error: null }, gateway: ['cdp-browser'] }}
        onAction={vi.fn()}
        onPickKernel={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Pick a Kernel' }) as HTMLSelectElement;
    expect([...select.options].map(o => o.text)).toEqual([
      'Pick a Kernel…',
      'Python 3',
      'TypeScript (in app) · workmbp ◆',
    ]);
  });
});
