import { describe, it, expect } from 'vitest';
import { buildLaunchCommand, engineBinary, knownEngines } from './engineAdapter';
import { ENGINES } from '../config/config';

describe('buildLaunchCommand', () => {
  it('launches claude in print mode, skipping permissions by default', () => {
    expect(buildLaunchCommand('claude', 'build PRD-1')).toEqual({
      command: 'claude',
      args: ['-p', 'build PRD-1', '--dangerously-skip-permissions'],
    });
  });

  it('launches codex via exec with the prompt as the trailing positional', () => {
    expect(buildLaunchCommand('codex', 'build PRD-1')).toEqual({
      command: 'codex',
      args: ['exec', '--dangerously-bypass-approvals-and-sandbox', 'build PRD-1'],
    });
  });

  it('launches gemini in prompt mode with --yolo', () => {
    expect(buildLaunchCommand('gemini', 'build PRD-1')).toEqual({
      command: 'gemini',
      args: ['-p', 'build PRD-1', '--yolo'],
    });
  });

  it('omits the skip-permission flag when asked to keep the gate', () => {
    expect(buildLaunchCommand('claude', 'p', { skipPermissions: false }).args).toEqual(['-p', 'p']);
    expect(buildLaunchCommand('codex', 'p', { skipPermissions: false }).args).toEqual(['exec', 'p']);
  });

  it('throws on an unknown engine', () => {
    expect(() => buildLaunchCommand('cursor', 'p')).toThrow(/unknown engine "cursor"/);
  });
});

describe('engine table integrity', () => {
  it('has a launch adapter for every engine the config accepts', () => {
    expect([...knownEngines()].sort()).toEqual([...ENGINES].sort());
  });

  it('maps each engine to its binary name', () => {
    expect(engineBinary('claude')).toBe('claude');
    expect(engineBinary('gemini')).toBe('gemini');
  });
});
