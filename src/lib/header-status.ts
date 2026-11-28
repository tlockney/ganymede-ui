import type { BackendConfig } from './backends';
import { hostLabel } from './backend-host';

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
};

/** Where the notebook's file lives and where its kernels run, as words. */
export type Place = {
  /** "in this browser", "on <host>" */
  saved: string;
  /**
   * "here" (in this page), "on <host>", or none when the page can't tell:
   * with no kernel, where a server's and the page's kernels mix.
   * `pageKernel`: the kernel's spec is the page's ({@link isPageSpec}).
   */
  runs(kernelName: string | undefined, pageKernel?: boolean): string | undefined;
};

/** The host a Ganymede config names, as its backend's detail says it. */
export const hostOf = hostLabel;

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
    runs: (kernelName, pageKernel) => {
      if (config.kernels === 'page') return 'here';
      if (config.kernels === 'both') {
        if (kernelName === undefined) return undefined;
        return pageKernel ? 'here' : `on ${host}`;
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
  /** Another Ganymede server on this machine owns the notebook (#839). */
  readOnly?: boolean;
  /** Room save failed or a server recovery copy needs review (#831). */
  saveAttention?: boolean;
  /** The kernel's spec name, if one is chosen. */
  kernelName?: string;
  /** The kernel's display name, if known. */
  kernelDisplay?: string;
  /** The notebook's kernel, which isn't installed here. */
  missingKernel?: string;
  /** The kernel's connection status. */
  status: string;
  /** The kernel's spec runs in this page (`isPageSpec`). */
  pageKernel?: boolean;
};

/** The save part: Saved in this browser, Saved on <host>, Edited, Locked, Save needs attention, or Read-only. */
export function saveText({ place, dirty, locked, readOnly, saveAttention }: StatusInput): string {
  if (locked) return dirty ? 'Edited · Locked: changed on disk' : 'Locked: changed on disk';
  if (saveAttention) return dirty ? 'Edited · Save needs attention' : 'Save needs attention';
  if (readOnly) return 'Read-only';
  return dirty ? 'Edited' : `Saved ${place.saved}`;
}

/**
 * The phone's form: the save state as one word, then where it runs, with
 * no kernel (the dot shows its state; the full line is the button's name
 * and the menu has the kernel), so a long host doesn't push the runs part
 * out of the two rows the line has.
 */
export function shortStatusText(input: StatusInput): string {
  const save = input.locked
    ? input.dirty
      ? 'Edited · Locked'
      : 'Locked'
    : input.saveAttention
      ? input.dirty
        ? 'Edited · Attention'
        : 'Needs attention'
      : input.readOnly
        ? 'Read-only'
        : input.dirty
          ? 'Edited'
          : 'Saved';
  const runs = input.place.runs(
    input.missingKernel ? undefined : input.kernelName,
    input.pageKernel,
  );
  return [save, runs && `Runs ${runs}`].filter(Boolean).join(' · ');
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
  const runs = input.place.runs(
    input.missingKernel ? undefined : input.kernelName,
    input.pageKernel,
  );
  return [saveText(input), runs && `Runs ${runs}`, kernelText(input), stateText(input.status)]
    .filter(Boolean)
    .join(' · ');
}
