/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import type { CustomCommandManager } from '@google/gemini-cli-core';
import type { SlashCommand } from '../ui/commands/types.js';
import type { ICommandLoader } from './types.js';

/**
 * Orchestrates the discovery and loading of all slash commands for the CLI.
 *
 * This service operates on a provider-based loader pattern. It is initialized
 * with an array of `ICommandLoader` instances, each responsible for fetching
 * commands from a specific source (e.g., built-in code, local files).
 *
 * The CommandService is responsible for invoking these loaders, aggregating their
 * results, and resolving any name conflicts. This architecture allows the command
 * system to be extended with new sources without modifying the service itself.
 */
export class CommandService implements CustomCommandManager {
  private commands: readonly SlashCommand[] = [];
  private listeners: (() => void)[] = [];
  private currentAbortController: AbortController | null = null;

  /**
   * @param loaders An array of objects that conform to the `ICommandLoader`
   *   interface. Built-in commands should come first, followed by FileCommandLoader.
   */
  constructor(private readonly loaders: ICommandLoader[]) {}

  /**
   * Reloads all commands from the configured loaders.
   */
  async reloadCommands(): Promise<void> {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    try {
      const results = await Promise.allSettled(
        this.loaders.map((loader) => loader.loadCommands(signal)),
      );

      if (signal.aborted) {
        return;
      }

      const allCommands: SlashCommand[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allCommands.push(...result.value);
        } else {
          debugLogger.debug('A command loader failed:', result.reason);
        }
      }

      const commandMap = new Map<string, SlashCommand>();
      for (const cmd of allCommands) {
        let finalName = cmd.name;

        // Extension commands get renamed if they conflict with existing commands
        if (cmd.extensionName && commandMap.has(cmd.name)) {
          let renamedName = `${cmd.extensionName}.${cmd.name}`;
          let suffix = 1;

          // Keep trying until we find a name that doesn't conflict
          while (commandMap.has(renamedName)) {
            renamedName = `${cmd.extensionName}.${cmd.name}${suffix}`;
            suffix++;
          }

          finalName = renamedName;
        }

        commandMap.set(finalName, {
          ...cmd,
          name: finalName,
        });
      }

      this.commands = Object.freeze(Array.from(commandMap.values()));
      this.notifyListeners();
    } finally {
      if (this.currentAbortController?.signal === signal) {
        this.currentAbortController = null;
      }
    }
  }

  /**
   * Retrieves the currently loaded and de-duplicated list of slash commands.
   *
   * This method is a safe accessor for the service's state. It returns a
   * readonly array, preventing consumers from modifying the service's internal state.
   *
   * @returns A readonly, unified array of available `SlashCommand` objects.
   */
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
