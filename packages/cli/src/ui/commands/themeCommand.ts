/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OpenDialogActionReturn, SlashCommand } from './types.js';
import { CommandKind } from './types.js';

export const themeCommand: SlashCommand = {
  name: 'theme',
  description: 'Change the theme',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (_context): OpenDialogActionReturn  => ({
    type: 'dialog',
    dialog: 'theme',
  }),
};
