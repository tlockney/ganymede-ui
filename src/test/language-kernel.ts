import { Signal } from '@lumino/signaling';

/** What a fake kernel's language comm records and how it answers. */
export type LanguageComm = {
  sent: Record<string, unknown>[];
  opened: boolean;
  closed: boolean;
  isDisposed: boolean;
  onMsg: (msg: unknown) => void;
  onClose: (msg: unknown) => void;
};

export type FakeOptions = {
  language?: string;
  /** Closes the comm at once, as a kernel without the language service does. */
  refuse?: boolean;
  subshells?: boolean;
  deferSubshell?: boolean;
  /** Answers each request automatically with these fields (plus its `request`); none: the test answers. */
  answer?: (request: Record<string, unknown>) => Record<string, unknown> | undefined;
};

/** A kernel with the language comm, for `createLanguageService` and the editor. */
export function fakeLanguageKernel(target: string, options: FakeOptions = {}) {
  const comms: LanguageComm[] = [];
  let settleSubshell!: () => void;
  const subshellStarted = options.deferSubshell
    ? new Promise<void>(res => (settleSubshell = res))
    : Promise.resolve();
  const kernel = {
    status: 'idle',
    supportsSubshells: options.subshells ?? false,
    statusChanged: undefined as unknown as Signal<object, string>,
    disposed: undefined as unknown as Signal<object, void>,
    info: Promise.resolve({ language_info: { name: options.language ?? 'typescript' } }),
    createComm(name: string) {
      if (name !== target) throw new Error(`unexpected target ${name}`);
      const comm = {
        sent: [] as Record<string, unknown>[],
        opened: false,
        closed: false,
        isDisposed: false,
        subshellStarted,
        onMsg: (_msg: unknown) => {},
        onClose: (_msg: unknown) => {},
        open() {
          comm.opened = true;
          if (options.refuse) queueMicrotask(() => comm.onClose({}));
        },
        send(data: Record<string, unknown>) {
          comm.sent.push(data);
          const reply = options.answer?.(data);
          if (reply)
            queueMicrotask(() =>
              comm.onMsg({ content: { data: { request: data.request, ...reply } } }),
            );
        },
        close() {
          comm.closed = true;
          comm.isDisposed = true;
        },
      };
      comms.push(comm);
      return comm;
    },
  };
  kernel.statusChanged = new Signal(kernel);
  kernel.disposed = new Signal(kernel);
  return {
    kernel,
    comms,
    settleSubshell: () => settleSubshell(),
    setStatus(next: string) {
      kernel.status = next;
      kernel.statusChanged.emit(next);
    },
    /** The kernel's answer to a request on the newest comm. */
    reply(fields: Record<string, unknown>, request?: number) {
      const comm = comms.at(-1)!;
      comm.onMsg({
        content: { data: { request: request ?? comm.sent.at(-1)!.request, ...fields } },
      });
    },
  };
}
