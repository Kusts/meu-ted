// ─────────────────────────────────────────────────────────────────────────────
// Webhook Dependencies Factory
// Creates webhook-related dependencies for the API server
// Supports both in-memory (dev/test) and Drizzle/persistent (production)
// ─────────────────────────────────────────────────────────────────────────────

import { createPiClient, getAgentRuntime, type PiClient } from '@pi-financeiro/whatsapp-bridge';
import { EvolutionClient, FakeEvolutionClient } from '@pi-financeiro/whatsapp-bridge';
import type { PendingOperationService, IPendingOperationRepository } from '@pi-financeiro/domain';
import { InMemoryPendingOperationRepository } from '@pi-financeiro/domain';

// Re-export for convenience
export { type PiClient, type SourceMessageStore, type UserRegistry, type ResponseSender } from '@pi-financeiro/whatsapp-bridge';

// ─────────────────────────────────────────────────────────────────────────────
// Interface matching webhook-handler.ts expectations
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceMessageStore {
  isProcessed(providerMessageId: string): boolean;
  markProcessed(msg: { providerMessageId: string; processed: boolean; errorReason?: string }): void;
  saveError(providerMessageId: string, error: string): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory implementations (for dev/test)
// ─────────────────────────────────────────────────────────────────────────────

export class InMemorySourceMessageStore implements SourceMessageStore {
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

// ─────────────────────────────────────────────────────────────────────────────
// Drizzle-based persistent implementations
// ─────────────────────────────────────────────────────────────────────────────

interface DrizzleRepos {
  pendingOperationRepository?: IPendingOperationRepository;
  sourceMessageStore?: SourceMessageStore;
}

let drizzleRepos: DrizzleRepos | null = null;

function resolveDepsMode(): 'memory' | 'drizzle' {
  const mode = process.env.API_DEP_MODE;
  if (mode === 'drizzle') return 'drizzle';
  return 'memory';
}

function loadDrizzleWebhookRepos(): DrizzleRepos | null {
  try {
    const {
      DrizzlePendingOperationRepository,
      DrizzleSourceMessageRepository,
    } = require('@pi-financeiro/db/repositories');

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return null;

    const { createDbClient } = require('@pi-financeiro/db/client');
    const dbClient = createDbClient(dbUrl);

    return {
      pendingOperationRepository: new DrizzlePendingOperationRepository(dbClient),
      sourceMessageStore: new DrizzleSourceMessageRepository(dbClient),
    };
  } catch {
    return null;
  }
}

function getDrizzleRepos(): DrizzleRepos {
  if (!drizzleRepos) {
    drizzleRepos = loadDrizzleWebhookRepos();
  }
  return drizzleRepos ?? {};
}

// ─────────────────────────────────────────────────────────────────────────────
// User registry (always env-based, no persistence needed)
// ─────────────────────────────────────────────────────────────────────────────

export class EnvBasedUserRegistry {
  private allowedGroups: Set<string>;
  private registeredPhones: Set<string>;
  private householdMapping: Map<string, string>;

  constructor() {
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
    this.allowedGroups.forEach(group => {
      this.householdMapping.set(group, householdId);
    });
  }

  isPhoneRegistered(phone: string): boolean {
    if (this.registeredPhones.size === 0) return true;
    return this.registeredPhones.has(phone);
  }

  isGroupAllowed(groupId: string): boolean {
    if (this.allowedGroups.size === 0) return true;
    return this.allowedGroups.has(groupId);
  }

  getHouseholdIdForGroup(groupId: string): string | null {
    return this.householdMapping.get(groupId) ?? null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Dependencies interface
// ─────────────────────────────────────────────────────────────────────────────

export interface WebhookDependencies {
  piClient: PiClient;
  responseSender: EvolutionClient | FakeEvolutionClient;
  sourceMessageStore: SourceMessageStore;
  userRegistry: EnvBasedUserRegistry;
  pendingOperationService?: PendingOperationService;
  agentRuntime: 'pi-native' | 'disabled';
}

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

export interface WebhookDepsOptions {
  piEnabled?: boolean;
  evolutionGoApiUrl?: string;
  evolutionGoInstanceToken?: string;
  householdId?: string;
  pendingOperationService?: PendingOperationService;
  /** Override mode (for testing); defaults to API_DEP_MODE env var */
  mode?: 'memory' | 'drizzle';
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create webhook dependencies based on environment.
 * Persistent (Drizzle) when API_DEP_MODE=drizzle AND DATABASE_URL is set.
 * In-memory otherwise (dev, tests).
 */
export function createWebhookDependencies(options: WebhookDepsOptions = {}): WebhookDependencies {
  const runtime = getAgentRuntime();
  const householdId = options.householdId || process.env.DEFAULT_HOUSEHOLD_ID || 'default';
  const mode = options.mode ?? resolveDepsMode();

  // Pi client (always from factory)
  const piClient = createPiClient(householdId);

  // Response sender (Evolution or fake)
  const responseSender = createResponseSender(options);

  // Source message store (persistent or in-memory)
  let sourceMessageStore: SourceMessageStore;
  let pendingOperationService: PendingOperationService | undefined;

  if (mode === 'drizzle') {
    const drizzle = getDrizzleRepos();
    if (drizzle.sourceMessageStore) {
      sourceMessageStore = drizzle.sourceMessageStore;
    } else {
      // Drizzle mode but repos unavailable — fall back to in-memory
      sourceMessageStore = new InMemorySourceMessageStore();
    }
    if (drizzle.pendingOperationRepository) {
      pendingOperationService = new PendingOperationService(drizzle.pendingOperationRepository);
    }
  } else {
    sourceMessageStore = new InMemorySourceMessageStore();
  }

  // User registry (always env-based)
  const userRegistry = new EnvBasedUserRegistry();

  return {
    piClient,
    responseSender,
    sourceMessageStore,
    userRegistry,
    pendingOperationService,
    agentRuntime: runtime,
  };
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
  return new FakeEvolutionClient();
}

/**
 * Get instance token for webhook validation
 */
export function getInstanceToken(): string {
  return process.env.EVOLUTION_GO_INSTANCE_TOKEN || '';
}

/**
 * Clear cached Drizzle repos (for testing / server restart)
 */
export function clearDrizzleRepos(): void {
  drizzleRepos = null;
}