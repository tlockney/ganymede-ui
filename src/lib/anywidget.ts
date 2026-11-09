/**
 * anywidget models (#417): what cdp-kernel's `jupyter.widget` opens. The
 * model's state carries the view as an ES module (`_esm`) and its styles
 * (`_css`).
 *
 * The module runs in a sandboxed frame, as trusted HTML outputs do
 * (`output-frames.ts`), never in the app's page: it can't read the page's
 * storage or the server's cookie, or reach the Apple apps' message
 * handlers. The frame gets a copy of the model's state and a
 * `MessageChannel` to this view, and its model stand-in turns `get`,
 * `set`, `save_changes`, `on`, `off` and `send` into messages on it. The
 * view applies them to the real model, which syncs with the kernel and
 * every other view as ipywidgets' models do.
 */
import { DOMWidgetModel, DOMWidgetView } from '@jupyter-widgets/base';
import type { JSONValue } from '@lumino/coreutils';
import { ANYWIDGET_MODULE, ownKeys } from './anywidget-module';
import { forgetFrame, renderFrame } from './output-frames';

/** Keys the frame doesn't get: the view's code goes in once, at the start. */
const CODE_KEYS = new Set(['_esm', '_css']);

export class AnyModel extends DOMWidgetModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: 'AnyModel',
      _model_module: ANYWIDGET_MODULE,
      _model_module_version: '*',
      _view_name: 'AnyView',
      _view_module: ANYWIDGET_MODULE,
      _view_module_version: '*',
    };
  }
}

/** Messages from the frame. */
type FromFrame =
  | { op: 'set'; changes: Record<string, unknown> }
  | { op: 'save' }
  | { op: 'send'; content: unknown; buffers?: ArrayBuffer[] }
  | { op: 'error'; message: string };

/**
 * The frame's side, as a script in its document: it waits for the view's
 * port, imports the module from a Blob, and calls its `initialize` and
 * `render` with a model stand-in.
 */
export const FRAME_SCRIPT = `
(function () {
  var listen = function (event) {
    if (event.source !== parent || !event.data || event.data.ganymedeWidget !== 'init') return;
    removeEventListener('message', listen);
    start(event.data, event.ports[0]);
  };
  addEventListener('message', listen);
  parent.postMessage({ ganymedeWidget: 'ready' }, '*');

  function start(init, port) {
    var state = init.state;
    var listeners = new Map();
    var emit = function (name, args) {
      (listeners.get(name) || []).slice().forEach(function (fn) {
        try { fn.apply(null, args); } catch (e) { console.error(e); }
      });
    };
    var changed = function (changes) {
      Object.keys(changes).forEach(function (key) {
        state[key] = changes[key];
        emit('change:' + key, [model, changes[key]]);
      });
      emit('change', [model]);
    };
    var model = {
      get: function (key) { return state[key]; },
      set: function (key, value) {
        var changes = {};
        if (typeof key === 'object' && key !== null) changes = key; else changes[key] = value;
        port.postMessage({ op: 'set', changes: changes });
        changed(changes);
      },
      save_changes: function () { port.postMessage({ op: 'save' }); },
      on: function (name, fn) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(fn);
      },
      off: function (name, fn) {
        if (!name) { listeners.clear(); return; }
        if (!fn) { listeners.delete(name); return; }
        var list = listeners.get(name) || [];
        var i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      send: function (content, callbacks, buffers) {
        port.postMessage({ op: 'send', content: content, buffers: buffers || [] });
      },
      widget_manager: {
        get_model: function () { return Promise.reject(new Error('Not available in Ganymede.')); },
      },
    };
    port.onmessage = function (event) {
      var m = event.data;
      if (m.op === 'change') changed(m.changes);
      else if (m.op === 'msg') emit('msg:custom', [m.content, m.buffers || []]);
    };
    if (init.css) {
      var style = document.createElement('style');
      style.textContent = init.css;
      document.head.appendChild(style);
    }
    var el = document.getElementById('widget');
    var fail = function (e) {
      port.postMessage({ op: 'error', message: String(e && e.stack || e) });
      var pre = document.createElement('pre');
      pre.textContent = String(e && e.message || e);
      pre.style.color = '#c33';
      el.replaceChildren(pre);
    };
    var url = URL.createObjectURL(new Blob([init.esm], { type: 'text/javascript' }));
    import(url).then(function (mod) {
      URL.revokeObjectURL(url);
      var widget = mod.default;
      return Promise.resolve(typeof widget === 'function' ? widget() : widget || mod).then(function (w) {
        return Promise.resolve(w.initialize && w.initialize({ model: model })).then(function () {
          return w.render && w.render({ model: model, el: el, experimental: {} });
        });
      });
    }).catch(fail);
  }
})();
`;

/** The frame's body: an element to render into, then the script. */
const FRAME_BODY = `<div id="widget"></div><script>${FRAME_SCRIPT}</script>`;

export class AnyView extends DOMWidgetView {
  private _frame?: HTMLIFrameElement;
  private _port?: MessagePort;
  private _onWindowMessage?: (event: MessageEvent) => void;

  render(): void {
    this.el.classList.add('gn-AnyWidget');
    const frame = renderFrame(this.el, FRAME_BODY);
    this._frame = frame;
    this._onWindowMessage = event => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { ganymedeWidget?: unknown } | null;
      if (data?.ganymedeWidget !== 'ready' || this._port) return;
      this._connect(frame);
    };
    window.addEventListener('message', this._onWindowMessage);
  }

  /** Hands the frame the module, the state and a port. */
  private _connect(frame: HTMLIFrameElement): void {
    const channel = new MessageChannel();
    this._port = channel.port1;
    this._port.onmessage = event => this._fromFrame(event.data as FromFrame);
    const state: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.model.attributes)) {
      if (!CODE_KEYS.has(key) && isCloneable(value)) state[key] = value;
    }
    frame.contentWindow?.postMessage(
      {
        ganymedeWidget: 'init',
        esm: String(this.model.get('_esm') ?? ''),
        css: String(this.model.get('_css') ?? ''),
        state,
      },
      '*',
      [channel.port2],
    );
    this.listenTo(this.model, 'change', this._toFrame);
    this.listenTo(this.model, 'msg:custom', (content: unknown, buffers?: unknown[]) =>
      this._port?.postMessage({ op: 'msg', content, buffers: buffers ?? [] }),
    );
  }

  private _toFrame(model: AnyModel, options?: { fromView?: AnyView }): void {
    // Not back to the frame that made the change: it has it already.
    if (options?.fromView === this) return;
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(model.changedAttributes() || {})) {
      if (!CODE_KEYS.has(key) && isCloneable(value)) changes[key] = value;
    }
    if (Object.keys(changes).length) this._port?.postMessage({ op: 'change', changes });
  }

  private _fromFrame(message: FromFrame): void {
    switch (message.op) {
      case 'set':
        if (message.changes && typeof message.changes === 'object') {
          this.model.set(ownKeys(message.changes), { fromView: this });
        }
        break;
      case 'save':
        this.touch();
        break;
      case 'send':
        this.model.send(message.content as JSONValue, {}, message.buffers);
        break;
      case 'error':
        console.error('anywidget view:', message.message);
        break;
    }
  }

  remove(): void {
    if (this._onWindowMessage) window.removeEventListener('message', this._onWindowMessage);
    this._port?.close();
    forgetFrame(this._frame);
    return super.remove();
  }
}

/** Whether `value` crosses to the frame by structured clone. */
function isCloneable(value: unknown): boolean {
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}
