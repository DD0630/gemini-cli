/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const BOOLEAN_FLAGS = new Set([
  '--debug',
  '-d',
  '--sandbox',
  '-s',
  '--yolo',
  '-y',
  '--experimental-acp',
  '--list-extensions',
  '-l',
  '--list-sessions',
  '--screen-reader',
  '--help',
  '-h',
  '--version',
  '-v',
]);

// This function is moved here to decouple sandbox.ts from the CLI's argument structure.
export const injectStdinIntoArgs = (
  args: string[],
  stdinData?: string,
): string[] => {
  const finalArgs = [...args];
  if (!stdinData) {
    return finalArgs;
  }

  // Iterate over args starting from index 2 to find a suitable place to inject stdin
  // skipping node executable and script path
  for (let i = 2; i < finalArgs.length; i++) {
    const arg = finalArgs[i];
    if (arg.startsWith('-')) {
      if (arg === '--prompt' || arg === '-p') {
        // If there's a prompt argument, prepend stdin to it
        if (i + 1 < finalArgs.length) {
          finalArgs[i + 1] = `${stdinData}\n\n${finalArgs[i + 1]}`;
          return finalArgs;
        }
      }

      if (BOOLEAN_FLAGS.has(arg)) {
        continue;
      } else {
        // Takes argument, skip next
        i++;
      }
    } else {
      // Positional argument found!
      finalArgs[i] = `${stdinData}\n\n${finalArgs[i]}`;
      return finalArgs;
    }
  }

  // If no suitable place found (no positional args and no --prompt flag),
  // add stdin as a new --prompt argument
  finalArgs.push('--prompt', stdinData);
  return finalArgs;
};
