import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { IYText } from '@jupyter/ydoc';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { CodeMirrorEditor, EditorExtensionRegistry, ybinding } from '@jupyterlab/codemirror';
import { MimeModel } from '@jupyterlab/rendermime';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { Widget } from '@lumino/widgets';
import { createEditorExtensions, editorLanguages } from '../lib/editor-setup';
import type { ExpandedTarget } from '../lib/expanded-view';
import { useModalFocus } from '../lib/modal-focus';
import { forgetFrame, renderFrame } from '../lib/output-frames';
import { countSourceLines } from '../lib/source-expand';
import { RenderedTable, TABLE_MIME } from '../lib/table-output';
import { setWrapCodeEnabled, subscribeWrapCode, wrapCode, wrapCodeEnabled } from '../lib/wrap-code';

type Props = {
  target: ExpandedTarget;
  onClose(): void;
};

/**
 * Full-window modal view (#822) for reading/editing a long code cell's source
 * or inspecting a wide/tall table output without fighting narrow page cards or
 * a `32em` scroll box. Rendered outside JupyterLab's `contain: strict` notebook
 * container so `position: fixed; inset: 0;` fills the viewport reliably.
 */
export function ExpandedView({ target, onClose }: Props) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const tableHostRef = useRef<HTMLDivElement>(null);

  const [wrapped, setWrapped] = useState(wrapCodeEnabled);
  const [lineCount, setLineCount] = useState(() =>
    target.kind === 'source'
      ? countSourceLines(target.sharedModel?.getSource() ?? target.source)
      : 0,
  );

  useEffect(() => subscribeWrapCode(setWrapped), []);

  useEffect(() => {
    setLineCount(
      target.kind === 'source'
        ? countSourceLines(target.sharedModel?.getSource() ?? target.source)
        : 0,
    );
  }, [target]);

  // Mount CodeMirror in layout phase so `.cm-content` exists before `useModalFocus` focuses it.
  useLayoutEffect(() => {
    if (target.kind !== 'source') return;
    const host = editorHostRef.current;
    if (!host) return;
    host.textContent = '';

    const extensionsRegistry = createEditorExtensions(registry => {
      registry.addExtension({
        name: 'wrap-code',
        factory: () => EditorExtensionRegistry.createImmutableExtension(wrapCode()),
      });
    });

    const model = new CodeEditor.Model({
      mimeType: target.mimeType,
      sharedModel: target.sharedModel,
    });
    if (!target.sharedModel) {
      model.sharedModel.setSource(target.source);
    }

    const yShared = target.sharedModel as IYText | undefined;
    const extra: Extension[] = [
      EditorView.contentAttributes.of({
        'aria-label': target.readOnly ? 'Cell source (read-only)' : 'Cell source',
        tabindex: '0',
      }),
    ];
    if (yShared?.ysource) {
      extra.push(
        ybinding({
          ytext: yShared.ysource,
          undoManager: target.readOnly ? undefined : (yShared.undoManager ?? undefined),
        }),
      );
    }

    const editor = new CodeMirrorEditor({
      host,
      model,
      extensionsRegistry,
      languages: editorLanguages,
      config: {
        lineWrap: false,
        lineNumbers: true,
        readOnly: Boolean(target.readOnly),
      },
      extensions: extra,
    });

    const onSourceChanged = () => {
      setLineCount(countSourceLines(model.sharedModel.getSource()));
    };
    model.sharedModel.changed.connect(onSourceChanged);

    return () => {
      model.sharedModel.changed.disconnect(onSourceChanged);
      editor.dispose();
      model.dispose();
      host.textContent = '';
    };
  }, [target]);

  // Mount table renderer in layout phase so Lumino detaches cleanly before React removes the host.
  useLayoutEffect(() => {
    if (target.kind !== 'table') return;
    const host = tableHostRef.current;
    if (!host) return;
    host.textContent = '';

    if (target.format === 'dataresource') {
      const widget = new RenderedTable(TABLE_MIME, target.kernel);
      void widget.renderModel({
        trusted: target.trusted,
        data: { [TABLE_MIME]: target.resource as never },
        metadata: {},
        setData() {},
      });
      if (target.initialViewState) widget.restoreViewState(target.initialViewState);
      Widget.attach(widget, host);
      return () => {
        target.onViewStateChange?.(widget.viewState);
        widget.dispose();
        host.textContent = '';
      };
    }

    if (target.trusted) {
      const frame = renderFrame(host, target.html, { overflowX: 'auto' });
      return () => {
        forgetFrame(frame);
        host.textContent = '';
      };
    }

    const renderer = target.rendermime.createRenderer('text/html');
    void renderer.renderModel(
      new MimeModel({ data: { 'text/html': target.html }, trusted: false }),
    );
    Widget.attach(renderer, host);
    return () => {
      renderer.dispose();
      host.textContent = '';
    };
  }, [target]);

  useModalFocus(rootRef, () => {
    if (target.kind === 'source') {
      return editorHostRef.current?.querySelector<HTMLElement>('.cm-content') ?? closeRef.current;
    }
    return closeRef.current;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
      if (document.querySelector('.sheet-backdrop, .popup-menu-backdrop')) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const heading =
    target.kind === 'source'
      ? `${target.title} · ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`
      : target.title;

  return (
    <div
      ref={rootRef}
      className="expanded-view"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-kind={target.kind}
    >
      <header className="expanded-header">
        <h2 id={titleId} className="expanded-title">
          {heading}
        </h2>
        <div className="expanded-actions">
          {target.kind === 'source' && (
            <button
              type="button"
              className="push-button expanded-wrap"
              aria-pressed={wrapped}
              onClick={() => setWrapCodeEnabled(!wrapped)}
            >
              Wrap Code
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            className="push-button primary expanded-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </header>
      <div className="expanded-body">
        {target.kind === 'source' ? (
          <div ref={editorHostRef} className="expanded-editor" />
        ) : (
          <div
            ref={tableHostRef}
            className={
              target.format === 'dataresource' ? 'expanded-table-host' : 'expanded-html-host'
            }
          />
        )}
      </div>
    </div>
  );
}
