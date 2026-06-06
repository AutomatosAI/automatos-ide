import { describe, it, expect } from 'vitest';
import { posixShellQuote, toShellCommandLine } from './launchShell';

describe('posixShellQuote', () => {
  it('wraps a plain token in single quotes', () => {
    expect(posixShellQuote('claude')).toBe(`'claude'`);
  });

  it('keeps spaces and newlines literal inside the quotes', () => {
    expect(posixShellQuote('build the\nthing')).toBe(`'build the\nthing'`);
  });

  it('neutralizes an embedded single quote without breaking out', () => {
    expect(posixShellQuote(`it's`)).toBe(`'it'\\''s'`);
  });
});

describe('toShellCommandLine — injection safety', () => {
  it('renders a command + argv as a single quoted line', () => {
    expect(toShellCommandLine('claude', ['-p', 'build PRD-1'])).toBe(`'claude' '-p' 'build PRD-1'`);
  });

  it('keeps shell metacharacters in a prompt inert (no expansion, no command run)', () => {
    const hostile = `'; rm -rf / #$(whoami)\`id\` && curl evil`;
    const line = toShellCommandLine('claude', [hostile]);
    // The only thing outside single quotes is the escaped-quote sequence; every
    // dangerous char ($,(,),`,;,&,#) stays wrapped, so a shell parses it as one literal arg.
    expect(line.startsWith(`'claude' '`)).toBe(true);
    expect(line).toContain(`'\\''`); // the embedded quote was escaped, not left open
    expect(line).not.toContain(`$( `);
  });
});
