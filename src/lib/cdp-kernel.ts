import type { KernelMessage } from '@jupyterlab/services';
import type { IKernel } from '@jupyterlite/services';
import { Signal } from '@lumino/signaling';
import { startBrowserKernel, type BrowserKernel } from '@tlockney/cdp-kernel/browser';
import workerUrl from '@tlockney/cdp-kernel/browser/worker?worker&url';

/** The kernelspec name, as cdp-kernel names its kernelspecs (`cdp-node`, …). */
export const CDP_KERNEL_NAME = 'cdp-browser';

export const CDP_KERNEL_SPEC = {
  name: CDP_KERNEL_NAME,
  display_name: 'TypeScript (cdp-kernel)',
  language: 'typescript',
  argv: [],
  resources: {},
};

/**
 * cdp-kernel's browser kernel as a JupyterLite kernel: the kernel's own
 * message handling runs on this page and cells in a module Worker. Unlike
 * JupyterLite's kernels, it answers every request itself, so messages pass
 * straight through in Jupyter's JSON shape both ways.
 */
export class CdpBrowserKernel implements IKernel {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly ready = Promise.resolve();
  readonly disposed = new Signal<this, void>(this);
  private _kernel: BrowserKernel;
  private _stop: () => void;
  private _isDisposed = false;
  private _lastSession = '';

  constructor(options: IKernel.IOptions) {
    this.id = options.id;
    this.name = options.name;
    this.location = options.location;
    this._kernel = startBrowserKernel({
      createWorker: () => new Worker(workerUrl, { type: 'module' }),
    });
    this._stop = this._kernel.onMessage((channel, msg) => {
      // LiteKernelClient routes a message to the client whose session is
      // in its header, as JupyterLite's kernels copy the parent's there.
      // cdp-kernel keeps its own session id, so put the parent's in, or
      // the last client's for messages with no parent.
      const parent = msg.parent_header as { session?: string };
      const session = parent.session || this._lastSession;
      const header = { ...msg.header, session };
      options.sendMessage({ ...msg, header, channel } as unknown as KernelMessage.IMessage);
    });
  }

  async handleMessage(msg: KernelMessage.IMessage): Promise<void> {
    if (msg.channel === 'iopub') return;
    this._lastSession = msg.header.session;
    this._kernel.send(msg.channel, msg as unknown as Parameters<BrowserKernel['send']>[1]);
  }

  /** JupyterLite interrupts by cancelling its queue; this kernel has its own. */
  interrupt(): void {
    this._kernel.send('control', controlRequest('interrupt_request', {}));
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    this._stop();
    // Ends the kernel and terminates its Worker.
    this._kernel.send('control', controlRequest('shutdown_request', { restart: false }));
    this.disposed.emit();
    Signal.clearData(this);
  }
}

function controlRequest(msgType: string, content: Record<string, unknown>) {
  return {
    header: {
      msg_id: crypto.randomUUID(),
      msg_type: msgType,
      session: 'ganymede-ui',
      username: '',
      date: new Date().toISOString(),
      version: '5.3',
    },
    parent_header: {},
    metadata: {},
    content,
  } as unknown as Parameters<BrowserKernel['send']>[1];
}
