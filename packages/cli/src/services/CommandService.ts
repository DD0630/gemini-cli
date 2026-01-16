/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import type { CommandRegistry } from '@google/gemini-cli-core';
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
export class CommandService implements CommandRegistry {
  private commands: readonly SlashCommand[] = [];
  private listeners: Set<() => void> = new Set();
  private currentAbortController: AbortController | null = null;

  /**
   * @param loaders An array of objects that conform to the `ICommandLoader`
   *   interface. Built-in commands should come first, followed by FileCommandLoader.
   */
  constructor(private readonly loaders: ICommandLoader[]) {}

  /**
   * Asynchronously creates and initializes a new CommandService instance.
   *
   * This factory method orchestrates the entire command loading process. It
   * runs all provided loaders in parallel, aggregates their results, handles
   * name conflicts for extension commands by renaming them, and then returns a
   * fully constructed `CommandService` instance.
   *
   * Conflict resolution:
   * - Extension commands that conflict with existing commands are renamed to
   *   `extensionName.commandName`
   * - Non-extension commands (built-in, user, project) override earlier commands
   *   with the same name based on loader order
   *
   * @param loaders An array of objects that conform to the `ICommandLoader`
   *   interface. Built-in commands should come first, followed by FileCommandLoader.
   * @param signal An AbortSignal to cancel the loading process.
   * @returns A promise that resolves to a new, fully initialized `CommandService` instance.
   */
  static async create(
    loaders: ICommandLoader[],
    signal: AbortSignal,
  ): Promise<CommandService> {
    const service = new CommandService(loaders);
    await service.reloadCommands(signal);
    return service;
  }

  /**
   * Reloads all commands from the loaders.
   *
   * @param externalSignal An optional AbortSignal. If provided, it will be used
   *   to cancel the loading process. If not provided, a new AbortController
   *   will be created and managed internally, cancelling any previous
   *   loading attempts.
   */
  async reloadCommands(externalSignal?: AbortSignal): Promise<void> {
    if (!externalSignal) {
      if (this.currentAbortController) {
        this.currentAbortController.abort();
      }
      this.currentAbortController = new AbortController();
    }
    const signal = externalSignal ?? this.currentAbortController!.signal;

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
          // If the failure was due to abort, we can ignore it.
          if (
            result.reason instanceof Error &&
            result.reason.name === 'AbortError'
          ) {
             continue;
          }
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
    } catch (e) {
      if (signal.aborted) {
        return;
      }
      throw e;
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
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
