import { useEffect, useMemo, useRef, useState } from 'react';
import { Notebook } from '@datalayer/jupyter-react';
import type { INotebookContent } from '@jupyterlab/nbformat';
import type { INotebookModel } from '@jupyterlab/notebook';
import type { Kernel, Session } from '@jupyterlab/services';
import type { Backend } from '../lib/backends';

export type KernelState = Kernel.Status | 'connecting';

/** What the toolbar needs from the open notebook. */
export type NotebookController = {
  id: string;
  path: string;
  name: string;
  status: KernelState;
  kernelName?: string;
  dirty: boolean;
  save(): Promise<void>;
  interrupt(): Promise<void>;
  restart(): Promise<void>;
  changeKernel(name: string): Promise<void>;
};

type Props = {
  backend: Backend;
  path: string;
  onController(c: NotebookController | undefined): void;
};

const basename = (p: string) => p.split('/').pop() ?? p;

/**
 * One notebook file: loads it, starts (or rejoins) its session, and renders
 * jupyter-react's `Notebook` in nbformat mode. Saving goes through the
 * contents API here rather than through the component, so the same code
 * saves to a Ganymede server or to the browser's own storage.
 */
export function NotebookPane({ backend, path, onController }: Props) {
  const { services } = backend;
  const id = useMemo(() => `nb-${backend.config.kind}-${path}`, [backend, path]);
  const [content, setContent] = useState<INotebookContent>();
  const [kernelId, setKernelId] = useState<string>();
  const [error, setError] = useState<string>();
  const [session, setSession] = useState<Session.ISessionConnection>();
  const [status, setStatus] = useState<KernelState>('connecting');
  const [dirty, setDirty] = useState(false);
  const model = useRef<INotebookModel | null>(null);

  // Load the file, then start a session for it with the kernel it names.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = await services.contents.get(path, { type: 'notebook', content: true });
      const nb = file.content as INotebookContent;
      if (cancelled) return;
      setContent(nb);
      // Rejoin the notebook's session if it has one, else start its kernel.
      // The Notebook component then connects a session to that kernel.
      const existing = await services.sessions.findByPath(path);
      let kid = existing?.kernel?.id;
      if (!kid) {
        await services.kernelspecs.ready;
        const specs = services.kernelspecs.specs;
        const wanted = nb.metadata?.kernelspec?.name;
        const name = wanted && specs?.kernelspecs[wanted] ? wanted : specs?.default;
        const k = await services.kernels.startNew(name ? { name } : {});
        kid = k.id;
        k.dispose();
      }
      if (!cancelled) setKernelId(kid);
    })().catch(e => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [services, path]);

  // Track the kernel status of the session the component connected.
  useEffect(() => {
    if (!session) return;
    const update = () => setStatus(session.kernel?.connectionStatus === 'connected'
      ? session.kernel.status
      : 'connecting');
    update();
    session.statusChanged.connect(update);
    session.connectionStatusChanged.connect(update);
    session.kernelChanged.connect(update);
    return () => {
      session.statusChanged.disconnect(update);
      session.connectionStatusChanged.disconnect(update);
      session.kernelChanged.disconnect(update);
    };
  }, [session]);

  useEffect(() => {
    const save = async () => {
      const m = model.current;
      if (!m) return;
      await services.contents.save(path, {
        type: 'notebook',
        format: 'json',
        content: m.toJSON(),
      });
      m.dirty = false;
      setDirty(false);
    };
    onController({
      id,
      path,
      name: basename(path),
      status,
      kernelName: session?.kernel?.name,
      dirty,
      save,
      interrupt: async () => void (await session?.kernel?.interrupt()),
      restart: async () => void (await session?.kernel?.restart()),
      changeKernel: async name => {
        await session?.changeKernel({ name });
        const m = model.current;
        const spec = services.kernelspecs.specs?.kernelspecs[name];
        if (m && spec) {
          m.setMetadata('kernelspec', {
            name,
            display_name: spec.display_name,
            language: spec.language,
          });
        }
      },
    });
  }, [id, path, status, session, dirty, services, onController]);

  useEffect(() => () => onController(undefined), [onController]);

  const onModel = useMemo(
    () => (m: INotebookModel | null) => {
      model.current = m;
      if (m) {
        // Loading marks the model dirty; clear that once it settles.
        setTimeout(() => (m.dirty = false), 0);
        m.stateChanged.connect((_, change) => {
          if (change.name === 'dirty') setDirty(change.newValue as boolean);
        });
      }
    },
    [],
  );

  if (error) {
    return (
      <div className="pane-message">
        <h2>Couldn’t open {basename(path)}</h2>
        <p>{error}</p>
      </div>
    );
  }
  if (!content || !kernelId) {
    return <div className="pane-message subtle">Opening {basename(path)}…</div>;
  }
  return (
    <div className="notebook-page">
      <Notebook
        id={id}
        nbformat={content}
        kernelId={kernelId}
        serviceManager={services}
        height="100%"
        maxHeight="100%"
        cellSidebarMargin={0}
        onNotebookModelChanged={onModel}
        onSessionConnection={s => {
          // The component names its session after its id; give it the file.
          if (s && s.path !== path) {
            void s.setPath(path).then(() => s.setName(basename(path)));
          }
          setSession(s);
        }}
      />
    </div>
  );
}
