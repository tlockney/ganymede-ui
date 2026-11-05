import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DebugKernel,
  type Variable,
  canListVariables,
  childVariables,
  inspectVariables,
} from './variables';
import { messageOf } from './problems';

/** A row of the tree: a variable, where it is (its names from the top), and its members once asked for. */
export type VariableNode = Variable & { path: string[]; children?: VariableNode[] };

export type VariablesState =
  | { kind: 'no-kernel' }
  | { kind: 'unsupported' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; variables: VariableNode[] };

const key = (path: string[]) => path.join('\u0000');

/**
 * The kernel's variables while `active`, read again each time the kernel
 * goes idle (after a run). Objects expand one level at a time; what was
 * expanded stays expanded after a refresh, read again by name.
 */
export function useVariables(
  kernel: DebugKernel | undefined,
  status: string | undefined,
  active: boolean,
) {
  const [state, setState] = useState<VariablesState>({ kind: 'no-kernel' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  // Results for an older kernel or refresh are dropped.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    if (!kernel) return setState({ kind: 'no-kernel' });
    // Rows already shown stay until the new ones come.
    setState(s => (s.kind === 'ready' ? s : { kind: 'loading' }));
    try {
      if (!(await canListVariables(kernel))) {
        if (mine === generation.current) setState({ kind: 'unsupported' });
        return;
      }
      const top = await inspectVariables(kernel);
      const nodes: VariableNode[] = top.map(v => ({ ...v, path: [v.name] }));
      // Expanded rows, top-down, by name: references change with each run.
      const fill = async (list: VariableNode[]) => {
        for (const node of list) {
          if (!node.variablesReference || !expandedRef.current.has(key(node.path))) continue;
          const kids = await childVariables(kernel, node.variablesReference);
          node.children = kids.map(k => ({ ...k, path: [...node.path, k.name] }));
          await fill(node.children);
        }
      };
      await fill(nodes);
      if (mine === generation.current) setState({ kind: 'ready', variables: nodes });
    } catch (e) {
      if (mine === generation.current) setState({ kind: 'error', message: messageOf(e) });
    }
  }, [kernel]);

  // On showing, on a new kernel, and when a run ends (the kernel goes idle).
  useEffect(() => {
    if (!active) return;
    if (!kernel) {
      generation.current++;
      setState({ kind: 'no-kernel' });
      return;
    }
    if (status && status !== 'idle') return;
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [active, kernel, status, load]);

  const toggle = useCallback(
    async (node: VariableNode) => {
      const k = key(node.path);
      const next = new Set(expandedRef.current);
      if (next.has(k)) {
        next.delete(k);
        setExpanded(next);
        return;
      }
      next.add(k);
      setExpanded(next);
      if (node.children || !kernel || !node.variablesReference) return;
      const mine = generation.current;
      try {
        const kids = await childVariables(kernel, node.variablesReference);
        if (mine !== generation.current) return;
        const children = kids.map(c => ({ ...c, path: [...node.path, c.name] }));
        setState(s =>
          s.kind === 'ready'
            ? { kind: 'ready', variables: withChildren(s.variables, node.path, children) }
            : s,
        );
      } catch (e) {
        if (mine === generation.current) setState({ kind: 'error', message: messageOf(e) });
      }
    },
    [kernel],
  );

  return {
    state,
    expanded: (node: VariableNode) => expanded.has(key(node.path)),
    toggle,
    refresh: load,
  };
}

/** The node at `path` in `nodes`, or undefined. Pure. */
export function nodeAt(nodes: VariableNode[], path: string[]): VariableNode | undefined {
  const node = nodes.find(n => n.name === path[0]);
  if (!node || path.length === 1) return node;
  return nodeAt(node.children ?? [], path.slice(1));
}

/** `nodes` with the node at `path` given `children`. Pure. */
export function withChildren(
  nodes: VariableNode[],
  path: string[],
  children: VariableNode[],
): VariableNode[] {
  return nodes.map(n => {
    if (n.name !== path[0]) return n;
    if (path.length === 1) return { ...n, children };
    return { ...n, children: withChildren(n.children ?? [], path.slice(1), children) };
  });
}
