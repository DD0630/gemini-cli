/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CustomCommandManager } from '@google/gemini-cli-core';

export class CommandRefresher implements CustomCommandManager {
  private listeners: Set<() => void> = new Set();

  refreshCommands(): void {
    this.listeners.forEach((listener) => listener());
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}
