/**
 * Whether a kernel message says an interrupt reset the kernel's state
 * (#796). cdp-kernel can't stop a busy cell in place on some runtimes (the
 * browser Worker of the in-page and in-app kernel, Bun, workerd, celld),
 * so an interrupt ends the runtime and a new one starts on the next cell,
 * without the earlier cells' variables. Since cdp-kernel#538 the stderr
 * note it prints then carries metadata saying so:
 *
 * ```json
 * { "cdp_kernel": { "state_reset": true, "reason": "interrupt", "runtime": "browser" } }
 * ```
 *
 * A kernel without that metadata (cdp-kernel 0.15.0 and earlier, any other
 * kernel) never matches, and neither does a runtime that ended for another
 * reason (`"exit"`: a crash or `process.exit()`), whose note says so in
 * the cell's output.
 */
export function interruptResetState(msg: {
  header: { msg_type: string };
  metadata?: unknown;
}): boolean {
  if (msg.header.msg_type !== 'stream') return false;
  const meta = msg.metadata;
  if (typeof meta !== 'object' || meta === null) return false;
  const ours = (meta as { cdp_kernel?: unknown }).cdp_kernel;
  if (typeof ours !== 'object' || ours === null) return false;
  const { state_reset, reason } = ours as { state_reset?: unknown; reason?: unknown };
  return state_reset === true && reason === 'interrupt';
}

/**
 * Whether an iopub `status` message says the system ended the kernel
 * (`reason: "lost"`), either while the server restarts it (`"restarting"`)
 * or after the restart limit leaves it stopped (`"dead"`, ganymede#266,
 * #469).
 */
export function lostKernelState(msg: {
  header: { msg_type: string };
  content?: unknown;
}): 'restarting' | 'dead' | undefined {
  if (msg.header.msg_type !== 'status') return undefined;
  const content = msg.content;
  if (typeof content !== 'object' || content === null) return undefined;
  const { execution_state, reason } = content as {
    execution_state?: unknown;
    reason?: unknown;
  };
  if (reason !== 'lost') return undefined;
  if (execution_state === 'restarting' || execution_state === 'dead') return execution_state;
  return undefined;
}
