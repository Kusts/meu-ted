// ─────────────────────────────────────────────────────────────────────────────
// Webhook Dependencies Factory
// Creates webhook-related dependencies for the API server
// ─────────────────────────────────────────────────────────────────────────────

import { createPiClient, getPiCommand, getPiArgs, getPiTimeoutMs, type PiClient } from '@pi-financeiro/whatsapp-bridge';
import { EvolutionClient, FakeEvolutionClient } from '@pi-financeiro/whatsapp-bridge';

// Re-export for convenience
export { type PiClient, type SourceMessageStore, type UserRegistry, type ResponseSender } from '@pi-financeiro/whatsapp-bridge';

export interface WebhookDependencies {
  piClient: PiClient;
  responseSender: EvolutionClient | FakeEvolutionClient;
  sourceMessageStore: InMemorySourceMessageStore;
  userRegistry: EnvBasedUserRegistry;
}

export interface WebhookDepsOptions {
  piEnabled?: boolean;
  evolutionGoApiUrl?: string;
  evolutionGoInstanceToken?: string;
}

/**
 * Create webhook dependencies based on environment
 */
export function createWebhookDependencies(options: WebhookDepsOptions = {}): WebhookDependencies {
  // Create Pi client (real or fake based on env)
  const piClient = createPiClient({
    enabled: options.piEnabled ?? isPiRpcEnabled(),
    command: getPiCommand(),
    args: getPiArgs(),
    timeoutMs: getPiTimeoutMs(),
  });

  // Create response sender (Evolution API or fake)
  const responseSender = createResponseSender(options);

  // In-memory source message store
  const sourceMessageStore = new InMemorySourceMessageStore();

  // Environment-based user registry
  const userRegistry = new EnvBasedUserRegistry();

  return {
    piClient,
    responseSender,
    sourceMessageStore,
    userRegistry,
  };
}

/**
 * Check if Pi RPC is enabled via environment
 */
function isPiRpcEnabled(): boolean {
  return process.env.PI_RPC_ENABLED === 'true';
}

/**
 * Create response sender based on environment
 */
function createResponseSender(options: WebhookDepsOptions): EvolutionClient | FakeEvolutionClient {
  const evolutionGoApiUrl = options.evolutionGoApiUrl || process.env.EVOLUTION_GO_API_URL;
  const evolutionGoInstanceToken = options.evolutionGoInstanceToken || process.env.EVOLUTION_GO_INSTANCE_TOKEN;

  if (evolutionGoApiUrl && evolutionGoInstanceToken) {
    return new EvolutionClient({
      baseUrl: evolutionGoApiUrl,
      instanceToken: evolutionGoInstanceToken,
    });
  }

  // Return fake client for dev/test
  return new FakeEvolutionClient();
}

/**
 * In-memory source message store
 */
export class InMemorySourceMessageStore {
  private messages = new Map<string, { processed: boolean; errorReason?: string }>();

  isProcessed(providerMessageId: string): boolean {
    return this.messages.get(providerMessageId)?.processed ?? false;
  }

  markProcessed(msg: { providerMessageId: string; processed: boolean; errorReason?: string }): void {
    this.messages.set(msg.providerMessageId, {
      processed: true,
      errorReason: msg.errorReason,
    });
  }

  saveError(providerMessageId: string, error: string): void {
    this.messages.set(providerMessageId, {
      processed: false,
      errorReason: error,
    });
  }

  clear(): void {
    this.messages.clear();
  }
}

/**
 * Environment-based user registry
 */
export class EnvBasedUserRegistry {
  private allowedGroups: Set<string>;
  private registeredPhones: Set<string>;
  private householdMapping: Map<string, string>;

  constructor() {
    // Load from environment
    const allowedGroupIds = process.env.ALLOWED_GROUP_IDS || '';
    const registeredPhones = process.env.REGISTERED_PHONES || '';
    const householdId = process.env.DEFAULT_HOUSEHOLD_ID || 'default';

    this.allowedGroups = new Set(
      allowedGroupIds ? allowedGroupIds.split(',').map(s => s.trim()) : []
    );

    this.registeredPhones = new Set(
      registeredPhones ? registeredPhones.split(',').map(s => s.trim()) : []
    );

    this.householdMapping = new Map();
    // Map each allowed group to the default household
    this.allowedGroups.forEach(group => {
      this.householdMapping.set(group, householdId);
    });
  }

  isPhoneRegistered(phone: string): boolean {
    // In dev mode, allow all phones
    if (this.registeredPhones.size === 0) {
      return true;
    }
    return this.registeredPhones.has(phone);
  }

  isGroupAllowed(groupId: string): boolean {
    // In dev mode, allow all groups
    if (this.allowedGroups.size === 0) {
      return true;
    }
    return this.allowedGroups.has(groupId);
  }

  getHouseholdIdForGroup(groupId: string): string | null {
    return this.householdMapping.get(groupId) ?? null;
  }
}

/**
 * Get instance token for webhook validation
 * In Evolution GO, webhooks include instanceToken in the payload
 */
export function getInstanceToken(): string {
  return process.env.EVOLUTION_GO_INSTANCE_TOKEN || '';
}