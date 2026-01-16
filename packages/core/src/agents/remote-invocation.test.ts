/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToolCallConfirmationDetails } from '../tools/tools.js';
import { RemoteAgentInvocation } from './remote-invocation.js';
import type { RemoteAgentDefinition } from './types.js';
import { A2AClientManager } from './a2a-client-manager.js';
import { ToolErrorType } from '../tools/tool-error.js';

class TestableRemoteAgentInvocation extends RemoteAgentInvocation {
  override async getConfirmationDetails(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return super.getConfirmationDetails(abortSignal);
  }
}

describe('RemoteAgentInvocation', () => {
  const mockDefinition: RemoteAgentDefinition = {
    kind: 'remote',
    name: 'test-remote-agent',
    description: 'A test remote agent',
    displayName: 'Test Remote Agent',
    agentCardUrl: 'https://example.com/agent-card',
    inputConfig: {
      inputs: {},
    },
  };

  beforeEach(() => {
    A2AClientManager.resetInstanceForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be instantiated with correct params', () => {
    const invocation = new RemoteAgentInvocation(mockDefinition, {});
    expect(invocation).toBeDefined();
    expect(invocation.getDescription()).toBe(
      'Calling remote agent Test Remote Agent',
    );
  });

  it('should return false for confirmation details (not yet implemented)', async () => {
    const invocation = new TestableRemoteAgentInvocation(mockDefinition, {});
    const details = await invocation.getConfirmationDetails(
      new AbortController().signal,
    );
    expect(details).toBe(false);
  });

  describe('execute', () => {
    it('should successfully invoke the remote agent and return text response', async () => {
      const mockSendMessage = vi.fn().mockResolvedValue({
        kind: 'message',
        parts: [{ kind: 'text', text: 'Hello from remote agent' }],
      });
      const mockLoadAgent = vi.fn().mockResolvedValue({});
      const mockGetClient = vi.fn().mockReturnValue(undefined); // First time not loaded

      // Mock the singleton instance
      const mockManager = {
        getClient: mockGetClient,
        loadAgent: mockLoadAgent,
        sendMessage: mockSendMessage,
      };

      vi.spyOn(A2AClientManager, 'getInstance').mockReturnValue(
        mockManager as unknown as A2AClientManager,
      );

      const invocation = new RemoteAgentInvocation(mockDefinition, {
        someParam: 'value',
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(mockGetClient).toHaveBeenCalledWith('test-remote-agent');
      expect(mockLoadAgent).toHaveBeenCalledWith(
        'test-remote-agent',
        'https://example.com/agent-card',
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        'test-remote-agent',
        JSON.stringify({ someParam: 'value' }),
      );

      expect(result.error).toBeUndefined();
      expect(result.returnDisplay).toBe('Hello from remote agent');
      expect(result.llmContent).toEqual([
        { text: 'Hello from remote agent' },
      ]);
    });

    it('should not load agent if already loaded', async () => {
      const mockSendMessage = vi.fn().mockResolvedValue({
        kind: 'message',
        parts: [{ kind: 'text', text: 'Response' }],
      });
      const mockLoadAgent = vi.fn();
      const mockGetClient = vi.fn().mockReturnValue({}); // Already loaded

      const mockManager = {
        getClient: mockGetClient,
        loadAgent: mockLoadAgent,
        sendMessage: mockSendMessage,
      };

      vi.spyOn(A2AClientManager, 'getInstance').mockReturnValue(
        mockManager as unknown as A2AClientManager,
      );

      const invocation = new RemoteAgentInvocation(mockDefinition, {});
      await invocation.execute(new AbortController().signal);

      expect(mockGetClient).toHaveBeenCalledWith('test-remote-agent');
      expect(mockLoadAgent).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('should handle task response', async () => {
      const mockSendMessage = vi.fn().mockResolvedValue({
        kind: 'task',
        taskId: '12345',
      });
      const mockGetClient = vi.fn().mockReturnValue({});

      const mockManager = {
        getClient: mockGetClient,
        loadAgent: vi.fn(),
        sendMessage: mockSendMessage,
      };

      vi.spyOn(A2AClientManager, 'getInstance').mockReturnValue(
        mockManager as unknown as A2AClientManager,
      );

      const invocation = new RemoteAgentInvocation(mockDefinition, {});
      const result = await invocation.execute(new AbortController().signal);

      expect(result.returnDisplay).toBe('Remote agent started task: 12345');
    });

    it('should handle errors gracefully', async () => {
      const mockSendMessage = vi.fn().mockRejectedValue(new Error('Network error'));
      const mockGetClient = vi.fn().mockReturnValue({});

      const mockManager = {
        getClient: mockGetClient,
        loadAgent: vi.fn(),
        sendMessage: mockSendMessage,
      };

      vi.spyOn(A2AClientManager, 'getInstance').mockReturnValue(
        mockManager as unknown as A2AClientManager,
      );

      const invocation = new RemoteAgentInvocation(mockDefinition, {});
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Network error');
      expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    });
  });
});
