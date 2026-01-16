/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomCommandManager {
  /**
   * Refreshes the list of custom commands.
   * Should be called when extensions are loaded or unloaded.
   */
  refreshCommands(): void;

  /**
   * Subscribes to changes in custom commands.
   * @param callback The function to call when commands are refreshed.
   * @returns A function to unsubscribe.
   */
  subscribe(callback: () => void): () => void;
}
