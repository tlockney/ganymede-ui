import type { DebugKernel } from '../lib/variables';
import { type VariableNode, useVariables } from '../lib/useVariables';

type Props = {
  /** The notebook's running kernel; none before the first run. */
  kernel?: DebugKernel;
  /** The kernel's state: the list is read again when it goes idle. */
  status?: string;
  onClose(): void;
};

/**
 * The Variables view (#242): name, type and a short value for each
 * variable the cells defined, read again after each run. Objects expand
 * one level at a time.
 */
export function VariablesPanel({ kernel, status, onClose }: Props) {
  const { state, expanded, toggle } = useVariables(kernel, status, true);

  const rows = (nodes: VariableNode[], depth: number): React.ReactNode[] =>
    nodes.flatMap(node => {
      const open = expanded(node);
      const row = (
        <tr key={node.path.join('\u0000')} className="variable-row">
          <td className="variable-name" style={{ paddingLeft: `${8 + depth * 14}px` }}>
            {node.variablesReference ? (
              <button
                className="variable-toggle"
                aria-expanded={open}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${node.name}`}
                onClick={() => void toggle(node)}
              >
                {open ? '▾' : '▸'}
              </button>
            ) : (
              <span className="variable-toggle" />
            )}
            <span title={node.name}>{node.name}</span>
          </td>
          <td className="variable-type" title={node.type}>
            {node.type}
          </td>
          <td className="variable-value" title={node.value}>
            {node.value}
          </td>
        </tr>
      );
      return open && node.children ? [row, ...rows(node.children, depth + 1)] : [row];
    });

  let body: React.ReactNode;
  switch (state.kind) {
    case 'no-kernel':
      body = <p className="inspector-empty">Run a cell to see its variables.</p>;
      break;
    case 'unsupported':
      body = <p className="inspector-empty">This kernel can’t list variables.</p>;
      break;
    case 'loading':
      body = <p className="inspector-empty">Reading variables…</p>;
      break;
    case 'error':
      body = (
        <p className="inspector-empty" role="alert">
          Couldn’t read the variables: {state.message}
        </p>
      );
      break;
    case 'ready':
      body = state.variables.length ? (
        <table className="variables-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>{rows(state.variables, 0)}</tbody>
        </table>
      ) : (
        <p className="inspector-empty">No variables yet.</p>
      );
  }

  return (
    <aside className="inspector" aria-label="Variables">
      <header className="inspector-header">
        <h2>Variables</h2>
        <button className="icon-button" title="Close Variables" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="inspector-body">{body}</div>
    </aside>
  );
}
