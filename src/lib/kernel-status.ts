import { PageConfig } from '@jupyterlab/coreutils';

/**
 * Requests whose busy/idle statuses don't change a kernel's status (#485).
 *
 * cdp-kernel, like ipykernel, wraps every control request in busy and idle
 * statuses. JupyterLab's kernel connection takes each status as the
 * kernel's own unless its parent's type is in PageConfig's
 * `untracked_message_types`, which Jupyter Server and Ganymede's lab page
 * set and nothing here did. So the Variables view's `debug_request`, sent
 * when the kernel went idle, made it busy and idle again, and the view read
 * the variables again: the status flapped without end and Interrupt, shown
 * only while busy, flickered out of reach.
 *
 * Jupyter Server's list, less `kernel_info_request`: a frontend probes with
 * it while a kernel starts, and an in-page kernel's first idle may be for
 * it. The iopub types in Jupyter Server's list are never a status's parent.
 */
export const UNTRACKED_MESSAGE_TYPES = [
  'comm_info_request',
  'comm_info_reply',
  'shutdown_request',
  'shutdown_reply',
  'interrupt_request',
  'interrupt_reply',
  'debug_request',
  'debug_reply',
  'history_request',
  'history_reply',
  'usage_request',
  'usage_reply',
] as const;

/** Sets `untracked_message_types`, before any kernel connects. */
export function untrackRequestStatuses(): void {
  PageConfig.setOption('untracked_message_types', JSON.stringify(UNTRACKED_MESSAGE_TYPES));
}
