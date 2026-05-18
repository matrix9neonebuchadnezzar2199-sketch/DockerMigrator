import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DockerAdapter } from './DockerAdapter.js';

describe('DockerAdapter（DOCKER_HOST 分岐）', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('DOCKER_HOST 未設定 → modem.socketPath が OS 別既定パス', () => {
    vi.stubEnv('DOCKER_HOST', '');
    const adapter = new DockerAdapter();
    const modem = (adapter as unknown as { docker: { modem: { socketPath?: string } } }).docker.modem;
    if (process.platform === 'win32') {
      expect(modem.socketPath).toBe('//./pipe/docker_engine');
    } else {
      expect(modem.socketPath).toBe('/var/run/docker.sock');
    }
  });

  it('DOCKER_HOST=unix:///tmp/foo.sock → modem.socketPath がそのパス', () => {
    vi.stubEnv('DOCKER_HOST', 'unix:///tmp/foo.sock');
    const adapter = new DockerAdapter();
    const modem = (adapter as unknown as { docker: { modem: { socketPath?: string } } }).docker.modem;
    expect(modem.socketPath).toBe('/tmp/foo.sock');
  });

  it('DOCKER_HOST=tcp://localhost:2375 → modem.host と modem.port が解釈される', () => {
    vi.stubEnv('DOCKER_HOST', 'tcp://localhost:2375');
    const adapter = new DockerAdapter();
    const modem = (adapter as unknown as { docker: { modem: { host?: string; port?: string | number } } }).docker
      .modem;
    expect(modem.host).toBe('localhost');
    expect(String(modem.port)).toBe('2375');
  });
});
