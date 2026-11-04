import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAgentSettings } from '@ganymede-ui/agent/settings';
import { agentCall, agentSettingsFrom } from './native-agent';

type Models = typeof import('@ganymede-ui/agent/models');

function fakeModels() {
  const models = {
    modelIds: vi.fn(() => ['claude-a', 'claude-b']),
    testModel: vi.fn(async () => ({ ok: true, message: 'OK' })),
  };
  return { models, load: async () => models as unknown as Models };
}

describe('the agent for the apps’ Settings (#210)', () => {
  beforeEach(() => localStorage.clear());

  it('reads the settings with the providers', async () => {
    const panel = (await agentCall('agent-settings', undefined)) as {
      enabled: boolean;
      provider: string;
      providers: { id: string }[];
    };
    expect(panel).toMatchObject({ enabled: false, provider: 'anthropic' });
    expect(panel.providers.map(p => p.id)).toEqual(['anthropic', 'openai', 'google', 'local']);
  });

  it('saves the settings the page reads, trimmed and with defaults', async () => {
    const saved = await agentCall(
      'save-agent-settings',
      JSON.stringify({ enabled: true, provider: 'local', model: ' llama ', baseUrl: '' }),
    );
    expect(saved).toEqual({
      enabled: true,
      provider: 'local',
      model: 'llama',
      baseUrl: 'http://localhost:11434/v1',
    });
    expect(loadAgentSettings()).toEqual(saved);
    // Nonsense becomes the defaults rather than a broken agent.
    expect(agentSettingsFrom('not json')).toMatchObject({ enabled: false, provider: 'anthropic' });
    expect(agentSettingsFrom('{"provider":"elsewhere"}').provider).toBe('anthropic');
    expect(agentSettingsFrom('{"provider":"local","model":"  ","baseUrl":"  "}')).toMatchObject({
      model: 'llama3.1',
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  it('lists a provider’s models, and none for an unknown one', async () => {
    const { models, load } = fakeModels();
    expect(await agentCall('agent-models', 'anthropic', load)).toEqual(['claude-a', 'claude-b']);
    expect(models.modelIds).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, provider: 'anthropic' }),
      expect.anything(),
    );
    expect(await agentCall('agent-models', 'elsewhere', load)).toEqual([]);
  });

  it('tests the settings with the key typed, without saving either', async () => {
    const { models, load } = fakeModels();
    const arg = JSON.stringify({ enabled: true, provider: 'openai', model: 'gpt', key: ' sk-1 ' });
    expect(await agentCall('test-agent', arg, load)).toEqual({ ok: true, message: 'OK' });
    const [settings, credentials] = models.testModel.mock.calls[0] as unknown as [
      { provider: string; model: string },
      { read(id: string): Promise<unknown> },
    ];
    expect(settings).toMatchObject({ provider: 'openai', model: 'gpt' });
    expect(await credentials.read('openai')).toEqual({ type: 'api_key', key: 'sk-1' });
    expect(loadAgentSettings().enabled).toBe(false);
  });

  it('answers a failed test, or a runtime that didn’t load, as not OK', async () => {
    const failing = async () => {
      throw new Error('offline');
    };
    expect(await agentCall('test-agent', '{}', failing)).toEqual({ ok: false, message: 'offline' });
  });

  it('refuses an unknown call', async () => {
    await expect(agentCall('format-disk', undefined)).rejects.toThrow('No page call format-disk');
  });
});
