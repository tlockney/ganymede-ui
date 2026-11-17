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
