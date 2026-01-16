
import { describe, it, expect } from 'vitest';
import { injectStdinIntoArgs } from './utils/args.js';

describe('injectStdinIntoArgs', () => {
  const node = '/path/to/node';
  const script = '/path/to/script.js';
  const stdin = 'some context';

  it('should add --prompt if no arguments provided', () => {
    const args = [node, script];
    const result = injectStdinIntoArgs(args, stdin);
    expect(result).toEqual([node, script, '--prompt', stdin]);
  });

  it('should prepend to --prompt value if present', () => {
    const args = [node, script, '--prompt', 'hello'];
    const result = injectStdinIntoArgs(args, stdin);
    expect(result).toEqual([node, script, '--prompt', `${stdin}\n\nhello`]);
  });

  it('should prepend to -p value if present', () => {
    const args = [node, script, '-p', 'hello'];
    const result = injectStdinIntoArgs(args, stdin);
    expect(result).toEqual([node, script, '-p', `${stdin}\n\nhello`]);
  });

  it('should prepend to first positional argument', () => {
    const args = [node, script, 'hello'];
    const result = injectStdinIntoArgs(args, stdin);
    expect(result).toEqual([node, script, `${stdin}\n\nhello`]);
  });

  it('should skip boolean flags', () => {
    const args = [node, script, '--debug', 'hello'];
    const result = injectStdinIntoArgs(args, stdin);
    expect(result).toEqual([node, script, '--debug', `${stdin}\n\nhello`]);
  });

  it('should skip flags with arguments', () => {
    const args = [node, script, '--model', 'gpt-4', 'hello'];
    const result = injectStdinIntoArgs(args, stdin);
    expect(result).toEqual([node, script, '--model', 'gpt-4', `${stdin}\n\nhello`]);
  });

  it('should handle mixed flags', () => {
    const args = [node, script, '--debug', '--model', 'gpt-4', 'hello'];
    const result = injectStdinIntoArgs(args, stdin);
    expect(result).toEqual([node, script, '--debug', '--model', 'gpt-4', `${stdin}\n\nhello`]);
  });

  it('should handle resume with value', () => {
     // resume takes arg (implicitly by logic, explicit in yargs)
     const args = [node, script, '--resume', '123', 'hello'];
     const result = injectStdinIntoArgs(args, stdin);
     expect(result).toEqual([node, script, '--resume', '123', `${stdin}\n\nhello`]);
  });

  it('should handle resume without value as boolean-ish (consuming next arg)', () => {
     // If user intended --resume to match latest, but provided a positional arg 'hello'
     // Logic assumes resume consumes 'hello' as value.
     // So 'hello' is NOT positional arg.
     // Result: no positional arg found, append --prompt.

     const args = [node, script, '--resume', 'hello'];
     const result = injectStdinIntoArgs(args, stdin);
     expect(result).toEqual([node, script, '--resume', 'hello', '--prompt', stdin]);
  });

  it('should handle aliases', () => {
    const args = [node, script, '-d', 'hello'];
    const result = injectStdinIntoArgs(args, stdin);
    expect(result).toEqual([node, script, '-d', `${stdin}\n\nhello`]);
  });

  it('should do nothing if stdin is empty', () => {
    const args = [node, script, 'hello'];
    const result = injectStdinIntoArgs(args, '');
    expect(result).toEqual(args);
  });
});
