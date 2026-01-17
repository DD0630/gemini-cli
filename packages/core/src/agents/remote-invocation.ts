/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseToolInvocation,
  type ToolResult,
  type ToolCallConfirmationDetails,
} from '../tools/tools.js';
import type { AgentInputs, RemoteAgentDefinition } from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { A2AClientManager } from './a2a-client-manager.js';
import { ToolErrorType } from '../tools/tool-error.js';

/**
 * A tool invocation that proxies to a remote A2A agent.
 *
 * This implementation bypasses the local `LocalAgentExecutor` loop and directly
 * invokes the configured A2A tool.
 */
export class RemoteAgentInvocation extends BaseToolInvocation<
  AgentInputs,
  ToolResult
> {
  constructor(
    private readonly definition: RemoteAgentDefinition,
    params: AgentInputs,
    messageBus?: MessageBus,
  ) {
    super(params, messageBus, definition.name, definition.displayName);
  }

  getDescription(): string {
    return `Calling remote agent ${this.definition.displayName ?? this.definition.name}`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // TODO: Implement confirmation logic for remote agents.
    return false;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = A2AClientManager.getInstance();

    try {
      // Ensure the agent is loaded.
      if (!manager.getClient(this.definition.name)) {
        await manager.loadAgent(
          this.definition.name,
          this.definition.agentCardUrl,
        );
      }

      // Serialize the parameters to pass as the initial message.
      // This assumes the remote agent expects a JSON string of arguments
      // or a natural language instruction that these arguments represent.
      const messageContent = JSON.stringify(this.params);

      const response = await manager.sendMessage(
        this.definition.name,
        messageContent,
      );

      if (response.kind === 'message') {
        const text = response.parts
          .filter((p) => p.kind === 'text')
          .map((p) => (p as { text: string }).text)
          .join('\n');

        return {
          llmContent: [{ text }],
          returnDisplay: text,
        };
      } else if (response.kind === 'task') {
        const text = `Remote agent started task: ${response.taskId}`;
        return {
          llmContent: [{ text }],
          returnDisplay: text,
        };
      }

      throw new Error(
        `Received unknown response kind: ${(response as any).kind}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        llmContent: `Remote agent invocation failed: ${errorMessage}`,
        returnDisplay: `Remote Agent Failed: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}
