import { PageConfig } from '@jupyterlab/coreutils';
import { describe, expect, it } from 'vitest';
import { untrackRequestStatuses } from './kernel-status';

describe('untrackRequestStatuses', () => {
  it("leaves debug and interrupt statuses out of the kernel's status", () => {
    untrackRequestStatuses();
    const types = JSON.parse(PageConfig.getOption('untracked_message_types')) as string[];
    expect(types).toContain('debug_request');
    expect(types).toContain('interrupt_request');
    expect(types).toContain('usage_request');
    // Executions still set it, and so does kernel_info while a kernel starts.
    expect(types).not.toContain('execute_request');
    expect(types).not.toContain('kernel_info_request');
  });
});
