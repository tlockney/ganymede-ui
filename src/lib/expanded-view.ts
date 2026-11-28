/**
 * Shared target descriptors and builders (#822) for opening a cell's source
 * or a table output inside `ExpandedView`.
 */
import type * as nbformat from '@jupyterlab/nbformat';
import type { CodeEditor } from '@jupyterlab/codeeditor';
import type { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import {
  type KernelSource,
  type RenderedTable,
  TABLE_MIME,
  type TableResource,
  type TableViewState,
} from './table-output';

export type ExpandedSourceTarget = {
  kind: 'source';
  /** Leading label shown in the dialog header (e.g. `In [3]` or `Source`). */
  title: string;
  mimeType?: string;
  readOnly?: boolean;
  source: string;
  /** Shared Yjs text model backing a notebook cell so edits stay in sync. */
  sharedModel?: CodeEditor.Model.IOptions['sharedModel'];
};

export type ExpandedTableTarget =
  | {
      kind: 'table';
      title: string;
      format: 'dataresource';
      resource: TableResource;
      trusted: boolean;
      kernel?: KernelSource;
      initialViewState?: TableViewState;
      onViewStateChange?: (state: TableViewState) => void;
    }
  | {
      kind: 'table';
      title: string;
      format: 'html';
      html: string;
      trusted: boolean;
      rendermime: IRenderMimeRegistry;
    };

export type ExpandedTarget = ExpandedSourceTarget | ExpandedTableTarget;

/** Builds an `ExpandedTableTarget` from a `TableResource` and optional live `RenderedTable` widget. */
export function dataTableTarget({
  resource,
  widget,
  trusted,
  kernel,
  onViewStateChange,
}: {
  resource: TableResource;
  widget?: RenderedTable;
  trusted?: boolean;
  kernel?: KernelSource;
  onViewStateChange?: (state: TableViewState) => void;
}): ExpandedTableTarget {
  const shown = Array.isArray(resource.data) ? resource.data.length : 0;
  const rows = resource.ganymede?.rows;
  const total = widget?.total ?? (typeof rows === 'number' && rows > shown ? rows : shown);
  const heading =
    widget?.tableTitle ??
    (typeof resource.ganymede?.title === 'string' && resource.ganymede.title.trim()
      ? resource.ganymede.title.trim()
      : undefined);
  const rowText = `${total.toLocaleString('en-US')} ${total === 1 ? 'row' : 'rows'}`;
  const title = heading
    ? total > 0
      ? `${heading} · ${rowText}`
      : heading
    : total > 0
      ? `Table, ${rowText}`
      : 'Table';
  return {
    kind: 'table',
    title,
    format: 'dataresource',
    resource: widget?.resource ?? resource,
    trusted: widget?.trusted ?? Boolean(trusted),
    kernel: widget?.kernel ?? kernel,
    initialViewState: widget?.viewState,
    onViewStateChange:
      onViewStateChange ??
      (widget
        ? state => {
            if (!widget.isDisposed) widget.restoreViewState(state);
          }
        : undefined),
  };
}

/** Builds an `ExpandedTableTarget` from a notebook output (`DataResource` or HTML `<table>`). */
export function tableTargetFromOutput({
  output,
  widget,
  trusted,
  rendermime,
  kernel,
}: {
  output: nbformat.IOutput;
  widget?: RenderedTable;
  trusted: boolean;
  rendermime: IRenderMimeRegistry;
  kernel?: KernelSource;
}): ExpandedTableTarget | undefined {
  const data = (output as nbformat.IDisplayData | undefined)?.data;
  if (widget || data?.[TABLE_MIME] !== undefined) {
    const resource = widget?.resource ?? ((data?.[TABLE_MIME] ?? {}) as TableResource);
    return dataTableTarget({ resource, widget, trusted, kernel });
  }
  const rawHtml = data?.['text/html'];
  const html = Array.isArray(rawHtml) ? rawHtml.join('') : rawHtml;
  if (typeof html === 'string') {
    return {
      kind: 'table',
      title: 'Table',
      format: 'html',
      html,
      trusted,
      rendermime,
    };
  }
  return undefined;
}
