import { z } from 'zod';

export const ALLOWLISTED_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'o1',
  'o1-mini',
  'o3-mini',
] as const;

export type AllowlistedModel = typeof ALLOWLISTED_MODELS[number];

export const ChatCompletionRequestSchema = z.object({
  model: z.enum(ALLOWLISTED_MODELS),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string().max(32000),
    }),
  ).min(1).max(100),
  stream: z.boolean().optional(),
  requestId: z.string().min(1).max(128),
  intentionId: z.string().min(1).max(128),
  workspaceId: z.string().min(1).max(128),
  actorId: z.string().min(1).max(128),
  temperature: z.number().min(0).max(2).optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export class CodexRuntimeAdapter {
  private readonly activeControllers = new Map<string, AbortController>();

  isModelAllowed(model: string): boolean {
    return ALLOWLISTED_MODELS.includes(model as AllowlistedModel);
  }

  cancelExecution(requestId: string): boolean {
    const controller = this.activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(requestId);
      return true;
    }
    return false;
  }

  async executeCompletion(
    req: ChatCompletionRequest,
    authStatus: { authenticated: boolean; reauthRequired: boolean },
  ): Promise<{
    id: string;
    model: string;
    choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }> {
    if (!authStatus.authenticated || authStatus.reauthRequired) {
      throw new Error('codex_reauth_required');
    }

    if (!this.isModelAllowed(req.model)) {
      throw new Error(`model_not_allowlisted: ${req.model}`);
    }

    const controller = new AbortController();
    this.activeControllers.set(req.requestId, controller);

    try {
      // In isolated container/mock adapter, process completion safely
      const userMessage = req.messages[req.messages.length - 1]?.content ?? '';
      const promptTokens = Math.ceil(userMessage.length / 4) + 20;
      const responseContent = `[Codex Broker response for ${req.model}]: Processado com segurança para workspace ${req.workspaceId}.`;
      const completionTokens = Math.ceil(responseContent.length / 4);

      return {
        id: `chatcmpl-${req.requestId}`,
        model: req.model,
        choices: [
          {
            message: {
              role: 'assistant',
              content: responseContent,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      };
    } finally {
      this.activeControllers.delete(req.requestId);
    }
  }
}
