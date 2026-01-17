/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
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
export class CommandService {
  /**
   * Private constructor to enforce the use of the async factory.
   * @param commands A readonly array of the fully loaded and de-duplicated commands.
   * @param rootCommandMap A pre-computed lookup map for top-level commands.
   */
  private constructor(
    private readonly commands: readonly SlashCommand[],
    private readonly rootCommandMap: Map<string, SlashCommand>,
  ) {}

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
    const results = await Promise.allSettled(
      loaders.map((loader) => loader.loadCommands(signal)),
    );

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

    const commandsForProcessing = Array.from(commandMap.values());
    const rootMap = this.buildLookupMap(commandsForProcessing);

    const finalCommands = Object.freeze(commandsForProcessing);
    return new CommandService(finalCommands, rootMap);
  }

  /**
   * Recursively builds a lookup map for commands and their subcommands.
   * Modifies the commands (specifically creates copies of subcommands) to attach `commandMap`.
   *
   * @param commands The list of commands to process.
   * @returns A map keyed by command name and aliases.
   */
  private static buildLookupMap(
    commands: SlashCommand[],
  ): Map<string, SlashCommand> {
    const map = new Map<string, SlashCommand>();

    for (const cmd of commands) {
      // Handle subCommands recursively.
      if (cmd.subCommands) {
        // Clone the subCommands array and objects to avoid mutating shared state
        // from the loaders.
        const newSubCommands = cmd.subCommands.map((sc) => ({ ...sc }));
        cmd.subCommands = newSubCommands;

        // Recursively build map for subcommands
        cmd.commandMap = this.buildLookupMap(newSubCommands);
      }

      map.set(cmd.name, cmd);
      if (cmd.altNames) {
        for (const alias of cmd.altNames) {
          map.set(alias, cmd);
        }
      }
    }

    return map;
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

  /**
   * Retrieves the pre-computed lookup map for top-level slash commands.
   * The map includes entries for both primary names and aliases.
   *
   * @returns A map of command names/aliases to SlashCommand objects.
   */
  getCommandMap(): Map<string, SlashCommand> {
    return this.rootCommandMap;
  }
}
