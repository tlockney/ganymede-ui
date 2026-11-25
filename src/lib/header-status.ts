import type { BackendConfig } from './backends';
import { CDP_KERNEL_NAME } from './kernel-device';

/** What the kernel is doing, as the status line says it; idle and "none" say nothing. */
export const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  busy: 'Running',
  starting: 'Starting',
  restarting: 'Restarting',
  autorestarting: 'Restarting',
  connecting: 'Connecting',
  dead: 'Stopped',
  unknown: 'Unknown',
  terminating: 'Stopping',
  none: 'Starts when you run a cell',
};

/** Where the notebook's file lives and where its kernels run, as words. */
export type Place = {
  /** "in this browser", "on <host>" */
  saved: string;
  /** "here" (in this page), "on <host>", or none when the page can't tell. */
  runs(kernelName: string | undefined): string | undefined;
};

/**
 * The host a Ganymede config names, as `connect` words its backend's
 * detail: a machine's name, the server's host, or "local server" for the
 * page's own.
 */
export function hostOf(config: BackendConfig): string {
  if (config.kind !== 'ganymede') return '';
  if (config.machine) return config.machineName || 'connected machine';
  if (!config.url) return 'local server';
  try {
    return new URL(config.url).host || config.url;
  } catch {
    return config.url;
  }
}

/**
 * Where the backend keeps notebooks and runs kernels (#801). With
 * `kernels: 'both'` a kernel runs in the page when it is the page's own
 * (cdp-kernel's browser kernel), else on the server.
 */
export function placeOf(config: BackendConfig): Place {
  if (config.kind !== 'ganymede') {
    return { saved: 'in this browser', runs: () => 'here' };
  }
  const host = hostOf(config);
  return {
    saved: `on ${host}`,
    runs: kernelName => {
      if (config.kernels === 'page') return 'here';
      if (config.kernels === 'both') {
        if (kernelName === undefined) return undefined;
        return kernelName === CDP_KERNEL_NAME ? 'here' : `on ${host}`;
      }
      return `on ${host}`;
    },
  };
}

export type StatusInput = {
  place: Place;
  /** Unsaved edits. */
  dirty: boolean;
  /** Saving is locked: the file changed on disk (#367). */
  locked: boolean;
  /** The kernel's spec name, if one is chosen. */
  kernelName?: string;
  /** The kernel's display name, if known. */
  kernelDisplay?: string;
  /** The notebook's kernel, which isn't installed here. */
  missingKernel?: string;
  /** The kernel's connection status. */
  status: string;
};

/** The save part: Saved in this browser, Saved on <host>, Edited, or Locked. */
export function saveText({ place, dirty, locked }: StatusInput): string {
  if (locked) return 'Locked: changed on disk';
  return dirty ? 'Edited' : `Saved ${place.saved}`;
}

/** The kernel part: its name, or "<name> (not installed) · Choose kernel". */
export function kernelText({ kernelDisplay, kernelName, missingKernel }: StatusInput): string {
  if (missingKernel) return `${missingKernel} (not installed) · Choose kernel`;
  return kernelDisplay ?? kernelName ?? 'No kernel';
}

/** The state part, only while the kernel is doing something other than waiting. */
export function stateText(status: string): string | undefined {
  return status === 'idle' || status === 'none' ? undefined : (STATUS_LABEL[status] ?? status);
}

/**
 * The line under the title (#801): `<save> · <runs> · <kernel>[ · <state>]`,
 * for example "Saved in this browser · Runs here · TypeScript".
 */
export function statusText(input: StatusInput): string {
  const runs = input.place.runs(input.missingKernel ? undefined : input.kernelName);
  return [saveText(input), runs && `Runs ${runs}`, kernelText(input), stateText(input.status)]
    .filter(Boolean)
    .join(' · ');
}
