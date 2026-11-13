/**
 * Opt-in error reports to Sentry (#319, tlockney/ganymede#384).
 *
 * Off by default. In the Mac and iPad apps the app owns the setting: it
 * sets `window.ganymedeCrashReports` to true or false before the page
 * loads. In a browser the Settings sheet keeps it in `localStorage`. While
 * it is off the Sentry SDK isn't loaded and nothing is sent.
 *
 * What is sent: the error's type, message and stack, the release, and the
 * browser and OS. What isn't: breadcrumbs (clicks, console, requests),
 * URLs, hostnames, user data, notebook content. `scrubEvent` enforces this
 * in the page, before anything leaves it. Errors whose innermost frame
 * isn't the page's own code (a notebook's JavaScript output, an extension
 * evaluated at run time) are user code, not crashes, and are dropped.
 * So are `@jupyterlab/services`' own unhandled "Canceled future" rejections
 * (`isCanceledFuture`), which a restart or dispose causes and nothing waits on.
 */
import type { ErrorEvent, Event, StackFrame } from '@sentry/browser';

/** The ganymede-web project's DSN. It only lets a client send events. */
export const DSN =
  'https://b584b172fbd072b8b34dd2f25dbc1650@o4512380800598016.ingest.us.sentry.io/4512380976103424';

const KEY = 'ganymede-ui:crash-reports';

declare global {
  interface Window {
    /** Set by the Apple apps before the page loads: the user's choice in the app. */
    ganymedeCrashReports?: boolean;
  }
}

export type CrashReportsSetting = {
  enabled: boolean;
  /** Who keeps the setting: the Apple app, or this page. */
  owner: 'app' | 'page';
};

export function crashReportsSetting(
  win: Pick<Window, 'ganymedeCrashReports'> = window,
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): CrashReportsSetting {
  if (typeof win.ganymedeCrashReports === 'boolean') {
    return { enabled: win.ganymedeCrashReports, owner: 'app' };
  }
  let stored: string | null = null;
  try {
    stored = storage?.getItem(KEY) ?? null;
  } catch {
    // Storage blocked: off.
  }
  return { enabled: stored === 'on', owner: 'page' };
}

/** Saves the browser's choice; takes effect on the next load. */
export function saveCrashReports(
  enabled: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage(),
): void {
  try {
    if (enabled) storage?.setItem(KEY, 'on');
    else storage?.removeItem(KEY);
  } catch {
    // Storage blocked: stays off.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Longest message sent; a long one is more likely to quote content. */
const MAX_MESSAGE = 300;

/**
 * A message or value with what could identify the user taken out: home
 * directories become `~`, URLs keep only their path (no origin, query or
 * fragment), and it is cut to `MAX_MESSAGE` characters.
 */
export function scrubText(text: string): string {
  const out = text
    // http(s), ws(s), file and blob URLs: drop the origin and anything after the path.
    .replace(/\b(?:https?|wss?|file|blob):\/\/[^\s/'"`)]*([^\s?#'"`)]*)(?:[?#][^\s'"`)]*)?/g, '$1')
    .replace(/(?:\/Users|\/home|\/var\/mobile)\/[^/\s'"`)]+/g, '~')
    .replace(/[A-Za-z]:\\Users\\[^\\\s'"`)]+/g, '~');
  return out.length > MAX_MESSAGE ? out.slice(0, MAX_MESSAGE) + '…' : out;
}

/**
 * A frame's file as the page's own code, `app:///assets/x.js`, or null
 * when it isn't the page's: another origin, evaluated code, the browser's
 * own.
 */
export function appFile(filename: string | undefined, origin: string): string | null {
  if (!filename) return null;
  let url: URL;
  try {
    url = new URL(filename);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return `app://${url.pathname}`;
}

/**
 * Whether the error is a request `@jupyterlab/services` dropped when its
 * kernel restarted or was disposed, rejected with nothing waiting on it
 * (#555). A restart clears the pending requests, among them the
 * `kernel_info_request` the connection sends whenever its socket
 * connects, whose rejection that library leaves unhandled (7.6 and 7.7).
 * The restart goes on and asks for the kernel's info again, so it isn't a
 * crash. JupyterLab ignores the same errors in its own message handling.
 */
export function isCanceledFuture(type: string | undefined, value: string | undefined): boolean {
  return type === 'Error' && !!value?.startsWith('Canceled future for ');
}

/**
 * The event as it may leave the page, or null to drop it. Pure: `origin`
 * is the page's.
 */
export function scrubEvent<T extends Event>(event: T, origin: string): T | null {
  const exceptions = event.exception?.values ?? [];
  // A message with no exception (captureMessage) isn't sent: the page
  // never captures one, so anything else would be someone else's.
  if (!exceptions.length) return null;
  // The innermost frame of the outermost error: Sentry lists frames
  // oldest first, so it is the last.
  const top = exceptions[exceptions.length - 1];
  const frames = top.stacktrace?.frames ?? [];
  if (!frames.length || !appFile(frames[frames.length - 1].filename, origin)) return null;
  if (exceptions.some(e => isCanceledFuture(e.type, e.value))) return null;

  const scrubFrame = (f: StackFrame): StackFrame => {
    const file = appFile(f.filename, origin);
    return {
      filename: file ?? '<other>',
      abs_path: file ?? '<other>',
      function: f.function,
      lineno: f.lineno,
      colno: f.colno,
      in_app: !!file,
    };
  };

  const ua = event.request?.headers?.['User-Agent'];
  return {
    ...event,
    exception: {
      values: exceptions.map(e => ({
        type: e.type,
        value: e.value === undefined ? undefined : scrubText(e.value),
        mechanism: e.mechanism && { type: e.mechanism.type, handled: e.mechanism.handled },
        stacktrace: e.stacktrace && { frames: (e.stacktrace.frames ?? []).map(scrubFrame) },
      })),
    },
    message: undefined,
    breadcrumbs: undefined,
    extra: undefined,
    user: undefined,
    server_name: undefined,
    transaction: undefined,
    // Only the browser's user agent, for its name and OS: no URL, no other headers.
    request: ua ? { headers: { 'User-Agent': ua } } : undefined,
    contexts: undefined,
    tags: undefined,
    fingerprint: event.fingerprint,
  };
}

let started: Promise<boolean> | undefined;

/**
 * Starts reporting when the setting is on; true when it did. Loads the SDK
 * only then. Call once, early.
 */
export function startCrashReports(
  setting: CrashReportsSetting = crashReportsSetting(),
): Promise<boolean> {
  if (!setting.enabled) return Promise.resolve(false);
  started ??= import('@sentry/browser').then(
    Sentry => {
      const origin = window.location.origin;
      Sentry.init({
        dsn: DSN,
        release: import.meta.env.VITE_RELEASE || undefined,
        environment: import.meta.env.DEV ? 'development' : 'production',
        // No user, cookies, query parameters or bodies; of the headers, the user agent alone.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: { request: { allow: ['User-Agent'] }, response: false },
          httpBodies: [],
          urlQueryParams: false,
        },
        // Only error capture: no breadcrumbs, sessions, tracing or replay.
        defaultIntegrations: false,
        integrations: [
          Sentry.globalHandlersIntegration(),
          Sentry.browserApiErrorsIntegration(),
          Sentry.linkedErrorsIntegration(),
          Sentry.dedupeIntegration(),
          Sentry.httpContextIntegration(),
        ],
        maxBreadcrumbs: 0,
        beforeBreadcrumb: () => null,
        beforeSend: (event: ErrorEvent) => scrubEvent(event, origin),
        beforeSendTransaction: () => null,
      });
      return true;
    },
    () => false,
  );
  return started;
}

/**
 * Throws an error outside any handler, so the report goes the way a real
 * one would: for checking that reports arrive. Only while reporting is on.
 */
export async function sendTestReport(
  setting: CrashReportsSetting = crashReportsSetting(),
): Promise<boolean> {
  if (!(await startCrashReports(setting))) return false;
  setTimeout(() => {
    throw new Error('Ganymede test report: the web UI sent this on request');
  });
  return true;
}
