declare module "agents/ai-chat-agent" {
  export class AIChatAgent<Env = unknown> {
    constructor(state: DurableObjectState, env: Env);
    state: DurableObjectState;
    env: Env;
    onConnect?(connection: unknown, ctx: unknown): Promise<void>;
    onChatMessage?(msg: unknown, ...args: unknown[]): Promise<unknown>;
    onMessage(connection: unknown, message: string): Promise<void>;
    static messageConcurrency?: string;
  }
}
declare module "agents" {
  export function routeAgentRequest(request: Request, env: Record<string, unknown>): Promise<Response | null>;
  export type AgentNamespace<T = unknown> = { idFromName(name: string): unknown; get(id: unknown): unknown };
}
declare module "ai" {
  export function streamText(...args: unknown[]): unknown;
  export function generateText(...args: unknown[]): Promise<{ text: string; usage?: unknown; finishReason?: string }>;
  export type LanguageModel = unknown;
}
declare module "@cloudflare/ai-chat" {
  export type UIMessage = unknown;
}
