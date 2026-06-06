import { describe, it, expect } from 'vitest';
import {
  buildLaunchCommand,
  buildInteractiveLaunchCommand,
  engineBinary,
  knownEngines,
} from './engineAdapter';
import { ENGINES } from '../config/config';

describe('buildLaunchCommand', () => {
  it('keeps the permission gate by default (no bypass flag without an explicit opt-in)', () => {
    expect(buildLaunchCommand('claude', 'build PRD-1').args).toEqual(['-p', 'build PRD-1']);
    expect(buildLaunchCommand('codex', 'build PRD-1').args).toEqual(['exec', '--', 'build PRD-1']);
    expect(buildLaunchCommand('gemini', 'build PRD-1').args).toEqual(['-p', 'build PRD-1']);
  });

  it('adds the per-engine bypass flag only on explicit skipPermissions', () => {
    expect(buildLaunchCommand('claude', 'p', { skipPermissions: true })).toEqual({
      command: 'claude',
      args: ['-p', 'p', '--dangerously-skip-permissions'],
    });
    expect(buildLaunchCommand('codex', 'p', { skipPermissions: true })).toEqual({
      command: 'codex',
      args: ['exec', '--dangerously-bypass-approvals-and-sandbox', '--', 'p'],
    });
    expect(buildLaunchCommand('gemini', 'p', { skipPermissions: true })).toEqual({
      command: 'gemini',
      args: ['-p', 'p', '--yolo'],
    });
  });

  it('keeps a leading-dash prompt from smuggling a flag into codex (-- separator)', () => {
    expect(buildLaunchCommand('codex', '--help me', { skipPermissions: true }).args).toEqual([
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--',
      '--help me',
    ]);
  });

  it('throws on an unknown engine', () => {
    expect(() => buildLaunchCommand('cursor', 'p')).toThrow(/unknown engine "cursor"/);
  });
});

describe('buildInteractiveLaunchCommand', () => {
  it('seeds an interactive session with the prompt and never bypasses permissions', () => {
    expect(buildInteractiveLaunchCommand('claude', 'build PRD-1')).toEqual({
      command: 'claude',
      args: ['build PRD-1'],
    });
    expect(buildInteractiveLaunchCommand('codex', 'build PRD-1')).toEqual({
      command: 'codex',
      args: ['--', 'build PRD-1'],
    });
    expect(buildInteractiveLaunchCommand('gemini', 'build PRD-1')).toEqual({
      command: 'gemini',
      args: ['-i', 'build PRD-1'],
    });
  });

  it('throws on an unknown engine', () => {
    expect(() => buildInteractiveLaunchCommand('cursor', 'p')).toThrow(/unknown engine "cursor"/);
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
