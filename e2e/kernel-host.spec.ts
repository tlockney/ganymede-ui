// The Apple apps' kernel web view (ganymede#266): kernel.html runs the
// app's kernels, which the app registered with its server. The test plays
// Swift and the server: it starts a kernel with a run number, sends Jupyter
// messages as JSON strings through `deliver`, and reads what the page posts
// to the fake `webkit.messageHandlers.kernelHost`. Cells run in the page's
// Worker and reach a stand-in `device` bridge.
import { expect, type Page, test } from '@playwright/test';
import { GANYMEDE_URL } from './env';

/** A stand-in for the Swift DeviceBridge: answers `hello` and the clipboard. */
const fakeBridge = `
  window.webkit = { messageHandlers: {
    kernelHost: { postMessage: m => window.toSwift(JSON.parse(JSON.stringify(m))) },
    device: { postMessage: async ({ method }) =>
      method === 'hello'
        ? { result: { platform: 'macos', appVersion: 'e2e', capabilities: ['clipboard.readText'] } }
        : method === 'clipboard.readText'
          ? { result: 'Europa' }
          : { error: { code: 'unsupported', message: method } } },
  } };`;

type Posted = { op: string; kernel?: string; run?: number; channel?: string; json?: string };
type Message = {
  header: { msg_type: string };
  parent_header: { msg_id?: string };
  content: Record<string, unknown>;
};

function request(type: string, content: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const msg = {
    header: {
      msg_id: id,
      msg_type: type,
      session: 'e2e',
      username: '',
      date: new Date().toISOString(),
      version: '5.3',
    },
    parent_header: {},
    metadata: {},
    content,
    buffers: [],
  };
  return { id, json: JSON.stringify(msg) };
}

const deliver = (page: Page, m: unknown) =>
  page.evaluate(
    msg =>
      (
        window as unknown as { ganymedeKernelHost: { deliver(m: unknown): void } }
      ).ganymedeKernelHost.deliver(msg),
    m,
  );

test('runs the app kernels in the kernel web view', async ({ page }) => {
  const posted: Posted[] = [];
  let ready!: () => void;
  const isReady = new Promise<void>(r => (ready = r));
  await page.exposeFunction('toSwift', (m: Posted) =>
    m.op === 'ready' ? ready() : posted.push(m),
  );
  await page.addInitScript(fakeBridge);
  await page.goto(`${GANYMEDE_URL}/kernel.html`);
  await isReady;

  /** What kernel `k1` sent on run `run` in reply to request `id`. */
  const replies = (id: string, run: number) =>
    posted
      .filter(m => m.op === 'message' && m.kernel === 'k1' && m.run === run)
      .map(m => JSON.parse(m.json!) as Message)
      .filter(m => m.parent_header.msg_id === id);
  const execute = async (code: string, run: number) => {
    const { id, json } = request('execute_request', {
      code,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: false,
      stop_on_error: true,
    });
    await deliver(page, { kernel: 'k1', op: 'send', channel: 'shell', json });
    await expect
      .poll(() => replies(id, run).find(m => m.header.msg_type === 'execute_result'), {
        timeout: 60_000,
      })
      .toBeTruthy();
    const result = replies(id, run).find(m => m.header.msg_type === 'execute_result')!;
    return (result.content.data as Record<string, string>)['text/plain'];
  };

  await deliver(page, { kernel: 'k1', op: 'start', run: 1 });
  const info = request('kernel_info_request', {});
  await deliver(page, { kernel: 'k1', op: 'send', channel: 'shell', json: info.json });
  await expect
    .poll(() => replies(info.id, 1).find(m => m.header.msg_type === 'kernel_info_reply'), {
      timeout: 60_000,
    })
    .toBeTruthy();
  const reply = replies(info.id, 1).find(m => m.header.msg_type === 'kernel_info_reply')!;
  expect(reply.content.capabilities).toMatchObject({ device: true });

  expect(await execute('const moon: string = "Callisto";\nmoon.toUpperCase()', 1)).toContain(
    'CALLISTO',
  );
  // The device preload ran in the kernel's Worker and reaches the bridge.
  expect(await execute('(await device.clipboard.readText()).toUpperCase()', 1)).toContain('EUROPA');
  expect(page.workers().length).toBeGreaterThan(0);

  // A restart under the same id is a new run, with fresh state.
  await deliver(page, { kernel: 'k1', op: 'start', run: 2 });
  expect(await execute('typeof moon', 2)).toContain('undefined');
  // A stop ends it without saying it closed: the server asked.
  await deliver(page, { kernel: 'k1', op: 'stop' });
  await page.waitForTimeout(500);
  expect(posted.some(m => m.op === 'closed')).toBe(false);
});
