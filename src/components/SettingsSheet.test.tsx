import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserCredentialStore,
  loadAgentSettings,
  saveAgentSettings,
  DEFAULT_SETTINGS,
} from '@ganymede-ui/agent/settings';
import { SettingsSheet, type AgentModels } from './SettingsSheet';

function fakeModels() {
  return {
    modelIds: vi.fn(() => ['claude-sonnet-5-5', 'claude-haiku-5-5']),
    testModel: vi.fn(async () => ({ ok: true, message: 'Claude Sonnet 5.5 answered.' })),
    modelsFor: vi.fn(),
  } as unknown as AgentModels & { testModel: ReturnType<typeof vi.fn> };
}

function renderSheet() {
  const store = new BrowserCredentialStore(sessionStorage, localStorage);
  const models = fakeModels();
  const loadModels = vi.fn(async () => models);
  const onClose = vi.fn();
  render(<SettingsSheet onClose={onClose} store={store} loadModels={loadModels} />);
  return { store, models, loadModels, onClose };
}

const toggle = () => screen.getByRole('checkbox', { name: 'Turn on the agent' });
const save = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('SettingsSheet', () => {
  it('starts with the agent off and loads nothing', () => {
    const { loadModels } = renderSheet();
    expect(toggle()).not.toBeChecked();
    expect(screen.queryByRole('combobox', { name: 'Provider' })).not.toBeInTheDocument();
    expect(loadModels).not.toHaveBeenCalled();
  });

  it('turns the agent on with a session key', async () => {
    const { store, loadModels, onClose } = renderSheet();
    await userEvent.click(toggle());
    expect(loadModels).toHaveBeenCalledOnce();
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue('anthropic');
    await userEvent.type(screen.getByPlaceholderText('Anthropic API key'), ' sk-ant ');
    await userEvent.click(save());

    expect(onClose).toHaveBeenCalled();
    expect(loadAgentSettings()).toEqual({ ...DEFAULT_SETTINGS, enabled: true });
    expect(await store.read('anthropic')).toEqual({ type: 'api_key', key: 'sk-ant' });
    expect(store.remembered('anthropic')).toBe(false);
    expect(JSON.stringify({ ...localStorage })).not.toContain('sk-ant');
  });

  it('remembers the key when asked', async () => {
    const { store } = renderSheet();
    await userEvent.click(toggle());
    await userEvent.type(screen.getByPlaceholderText('Anthropic API key'), 'sk-ant');
    await userEvent.click(screen.getByRole('checkbox', { name: /Remember the key/ }));
    await userEvent.click(save());
    expect(store.remembered('anthropic')).toBe(true);
  });

  it('shows the saved settings and key', async () => {
    saveAgentSettings({ ...DEFAULT_SETTINGS, enabled: true, provider: 'openai', model: 'gpt-5' });
    const seed = new BrowserCredentialStore(sessionStorage, localStorage);
    await seed.setKey('openai', 'sk-openai', true);
    renderSheet();
    expect(toggle()).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue('openai');
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('gpt-5');
    await waitFor(() =>
      expect(screen.getByPlaceholderText('OpenAI API key')).toHaveValue('sk-openai'),
    );
    expect(screen.getByRole('checkbox', { name: /Remember the key/ })).toBeChecked();
  });

  it('sets up a local server', async () => {
    renderSheet();
    await userEvent.click(toggle());
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Provider' }), 'local');
    const model = screen.getByRole('combobox', { name: 'Model' });
    expect(model).toHaveValue('llama3.1');
    await userEvent.clear(model);
    await userEvent.type(model, 'qwen3');
    const server = screen.getByRole('textbox', { name: 'Server' });
    await userEvent.clear(server);
    await userEvent.type(server, 'http://localhost:1234/v1');
    expect(screen.getByPlaceholderText('Optional')).toBeInTheDocument();
    expect(screen.getByText(/OLLAMA_ORIGINS=/)).toBeInTheDocument();
    await userEvent.click(save());
    expect(loadAgentSettings()).toEqual({
      enabled: true,
      provider: 'local',
      model: 'qwen3',
      baseUrl: 'http://localhost:1234/v1',
    });
  });

  it('tests the unsaved settings and key', async () => {
    const { models, store } = renderSheet();
    await userEvent.click(toggle());
    await userEvent.type(screen.getByPlaceholderText('Anthropic API key'), 'sk-try');
    await userEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Claude Sonnet 5.5 answered.');
    const [settings, keys] = models.testModel.mock.calls[0]!;
    expect(settings).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(await keys.read('anthropic')).toEqual({ type: 'api_key', key: 'sk-try' });
    // Testing saves nothing.
    expect(await store.read('anthropic')).toBeUndefined();
  });

  it('lists the provider’s models', async () => {
    renderSheet();
    await userEvent.click(toggle());
    await waitFor(() => expect(document.querySelectorAll('#agent-models option')).toHaveLength(2));
  });

  it('closes on Cancel and Escape without saving', async () => {
    const { onClose } = renderSheet();
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(loadAgentSettings().enabled).toBe(false);
  });

  it('says when the agent fails to load', async () => {
    const store = new BrowserCredentialStore(sessionStorage, localStorage);
    render(
      <SettingsSheet
        onClose={vi.fn()}
        store={store}
        loadModels={() => Promise.reject(new Error('offline'))}
      />,
    );
    await userEvent.click(toggle());
    expect(await screen.findByText("The agent didn't load: offline")).toBeInTheDocument();
  });

  it('tests with trimmed values and reports a throw', async () => {
    const { models } = renderSheet();
    models.testModel.mockRejectedValueOnce(new Error('boom'));
    await userEvent.click(toggle());
    const model = screen.getByRole('combobox', { name: 'Model' });
    await userEvent.type(model, '  ');
    await userEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByRole('status')).toHaveTextContent('boom');
    expect(models.testModel.mock.calls[0]![0]).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
  });

  it('offers to forget saved keys while off', async () => {
    const seed = new BrowserCredentialStore(sessionStorage, localStorage);
    await seed.setKey('anthropic', 'sk-a', true);
    await seed.setKey('google', 'sk-g', false);
    renderSheet();
    await userEvent.click(await screen.findByRole('button', { name: 'Forget saved keys' }));
    await waitFor(() => expect(localStorage.length + sessionStorage.length).toBe(0));
    expect(screen.queryByRole('button', { name: 'Forget saved keys' })).not.toBeInTheDocument();
  });

  it('stays open on a backdrop click', async () => {
    const { onClose } = renderSheet();
    await userEvent.click(document.querySelector('.sheet-backdrop')!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("doesn't test a blank server URL", async () => {
    const { models } = renderSheet();
    await userEvent.click(toggle());
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Provider' }), 'local');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Server' }));
    await userEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(models.testModel).not.toHaveBeenCalled();
  });

  it("doesn't test or save a blank model", async () => {
    const { models, onClose } = renderSheet();
    await userEvent.click(toggle());
    const model = screen.getByRole('combobox', { name: 'Model' });
    await userEvent.clear(model);
    await userEvent.type(model, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Test' }));
    await userEvent.click(save());
    expect(models.testModel).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('drops a running test when the key changes', async () => {
    const { models } = renderSheet();
    let finish!: (r: { ok: boolean; message: string }) => void;
    models.testModel.mockImplementationOnce(() => new Promise(r => (finish = r)));
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole('button', { name: 'Test' }));
    await userEvent.type(screen.getByPlaceholderText('Anthropic API key'), 'sk-new');
    finish({ ok: true, message: 'stale answer' });
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const signal = models.testModel.mock.calls[0]![2] as AbortSignal;
    expect(signal.aborted).toBe(true);
  });

  it('keeps the Remember tick for a provider with no key yet', async () => {
    renderSheet();
    await userEvent.click(toggle());
    const remember = screen.getByRole('checkbox', { name: /Remember the key/ });
    await userEvent.click(remember);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Provider' }), 'google');
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByRole('checkbox', { name: /Remember the key/ })).toBeChecked();
  });

  it('asks browsers not to save the key as a password', async () => {
    renderSheet();
    await userEvent.click(toggle());
    expect(screen.getByPlaceholderText('Anthropic API key')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });
});
