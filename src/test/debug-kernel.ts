import { vi } from 'vitest';
import type { DebugKernel } from '../lib/variables';

/** A kernel that answers debug requests from `bodies`, by command. */
export function debugKernel(
  bodies: Record<string, unknown | ((args: Record<string, unknown>) => unknown)>,
  info: Record<string, unknown> = { debugger: true },
) {
  const requestDebug = vi.fn(
    (content: { command: string; arguments?: Record<string, unknown> }) => {
      const answer = bodies[content.command];
      const body = typeof answer === 'function' ? answer(content.arguments ?? {}) : answer;
      return {
        done: Promise.resolve({
          content:
            body === undefined
              ? { success: false, message: `no ${content.command}` }
              : { success: true, body },
        }),
      };
    },
  );
  return { requestDebug, info: Promise.resolve(info) } as unknown as DebugKernel & {
    requestDebug: typeof requestDebug;
  };
}
