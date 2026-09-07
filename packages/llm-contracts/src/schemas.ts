import { z } from 'zod';
import {
  AUTH_MODES,
  PRIVACY_CLASSES,
  PROTOCOLS,
  PROVIDER_ELIGIBILITIES,
  PROVIDER_KINDS,
  ROLLOUT_MODES,
  SECRET_ALIASES,
  TRANSPORTS,
} from './types.js';

export const providerKindSchema = z.enum(PROVIDER_KINDS);
export const secretAliasSchema = z.enum(SECRET_ALIASES);
export const transportSchema = z.enum(TRANSPORTS);
export const authModeSchema = z.enum(AUTH_MODES);
export const protocolSchema = z.enum(PROTOCOLS);
export const privacyClassSchema = z.enum(PRIVACY_CLASSES);
export const rolloutModeSchema = z.enum(ROLLOUT_MODES);
export const providerEligibilitySchema = z.enum(PROVIDER_ELIGIBILITIES);

export const providerIdSchema = z
  .string()
  .trim()
  .min(1, 'provider id is required')
  .max(64, 'provider id must be at most 64 characters')
  .regex(/^[a-z0-9-]+$/, 'provider id must match ^[a-z0-9-]+$');

export const modelIdSchema = z
  .string()
  .trim()
  .min(1, 'model id is required')
  .max(120, 'model id must be at most 120 characters')
  .regex(/^[A-Za-z0-9._/-]+$/, 'model id contains disallowed characters')
  .refine((v) => !v.split('/').some((seg) => seg === '' || seg === '..'), {
    message: 'model id contains disallowed characters',
  });

export const toggleEnabledSchema = z
  .object({ enabled: z.boolean({ invalid_type_error: 'enabled must be boolean' }) })
  .strict();

export const testConnectionSchema = z
  .object({ providerId: providerIdSchema.optional(), dryRun: z.boolean().optional() })
  .strict();

export const retentionSchema = z.string().trim().max(120, 'retention must be at most 120 characters');

export const createProviderSchema = z.object({
  id: providerIdSchema,
  kind: providerKindSchema,
  transport: transportSchema,
  authMode: authModeSchema,
  secretAlias: secretAliasSchema.nullable(),
  name: z.string().trim().min(1).max(120).optional(),
  eligibility: providerEligibilitySchema.optional(),
  enabled: z.boolean().optional(),
});

export const createModelSchema = z.object({
  providerId: providerIdSchema,
  modelId: modelIdSchema,
  protocol: protocolSchema,
  privacyClass: privacyClassSchema,
  retention: retentionSchema.nullable().optional(),
  enabled: z.boolean().optional(),
});

export const syncCatalogItemSchema = z.object({
  providerId: providerIdSchema,
  modelId: modelIdSchema,
  protocol: protocolSchema.optional(),
  privacyClass: privacyClassSchema.optional(),
  retention: retentionSchema.optional(),
});

export const syncCatalogSchema = z.object({
  items: z.array(syncCatalogItemSchema).max(100, 'at most 100 items per sync').default([]),
});

export const expectedVersionSchema = z
  .number({ invalid_type_error: 'expectedVersion must be a number' })
  .int('expectedVersion must be an integer')
  .min(1, 'expectedVersion must be at least 1');

export const canaryAllowlistSchema = z
  .array(z.string().trim().min(1, 'canary entry must not be empty').max(64, 'canary entry too long'))
  .max(32, 'at most 32 canary entries');

/** Composite `provider:model` ids travel through activate/fallback lookups. */
export const modelRefSchema = z.string().trim().min(1, 'model id is required').max(185, 'model id too long');

export const activateSchema = z.object({
  providerId: providerIdSchema,
  modelId: modelRefSchema,
  rolloutMode: rolloutModeSchema.optional(),
  expectedVersion: expectedVersionSchema,
});

export const rolloutSchema = z.object({
  rolloutMode: rolloutModeSchema.optional(),
  canaryAllowlist: canaryAllowlistSchema.optional(),
  expectedVersion: expectedVersionSchema,
});

export const fallbackSchema = z
  .object({
    providerId: providerIdSchema.nullable(),
    modelId: modelRefSchema.nullable(),
    expectedVersion: expectedVersionSchema,
  })
  .refine((v) => (v.providerId === null) === (v.modelId === null), {
    message: 'providerId and modelId must both be null or both be set',
  });

export const patchProviderSchema = z
  .object({
    enabled: z.boolean().optional(),
    eligibility: providerEligibilitySchema.optional(),
    secretAlias: secretAliasSchema.nullable().optional(),
  })
  .strict();

export const securityEpochSchema = z.object({}).strict();

/**
 * Credential CRUD (item 2). The key travels ONLY on write (POST credential);
 * reads always return the masked status. `dryRun` performs validation +
 * masking without persisting — used by tests and connection checks so no
 * real key is ever required in CI.
 */
export const apiKeyValueSchema = z
  .string()
  .trim()
  .min(8, 'api key is too short')
  .max(256, 'api key is too long');

export const setCredentialSchema = z
  .object({
    apiKey: apiKeyValueSchema,
    dryRun: z.boolean().optional(),
  })
  .strict();

export const credentialStatusSchema = z.object({
  providerId: providerIdSchema,
  configured: z.boolean(),
  masked: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const remoteModelItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  ownedBy: z.string().trim().max(120).nullable().optional(),
});

export const remoteModelsResponseSchema = z.object({
  providerId: providerIdSchema,
  models: z.array(remoteModelItemSchema).max(500),
  cached: z.boolean(),
  manualEntryAllowed: z.boolean(),
});

/** Codex browser-login flow (item 6): callback carries an opaque code, the
 * broker exchanges it server-side and persists via atomic 0600 write. */
export const codexLoginBeginSchema = z
  .object({ callbackUrl: z.string().trim().url().max(500).optional() })
  .strict();

export const codexLoginCallbackSchema = z
  .object({
    code: z.string().trim().min(4).max(500),
    state: z.string().trim().max(128).optional(),
  })
  .strict();

export const llmProviderSlotSchema = z.object({
  id: z.string(),
  kind: providerKindSchema,
  transport: transportSchema,
  authMode: authModeSchema,
  secretAlias: secretAliasSchema.nullable(),
  serviceAlias: z.string().nullable(),
  eligibility: providerEligibilitySchema,
});

export const llmModelSlotSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  protocol: protocolSchema,
  privacyClass: privacyClassSchema,
});

export const internalRuntimeDtoSchema = z.object({
  singleton: z.literal('active'),
  version: z.number(),
  securityEpoch: z.number(),
  activeProviderId: z.string().nullable(),
  activeModelId: z.string().nullable(),
  activeProtocol: protocolSchema.nullable(),
  activeRolloutPercentage: z.number(),
  activeRolloutMode: rolloutModeSchema,
  canaryAllowlist: z.array(z.string()).optional(),
  fallbackProviderId: z.string().nullable(),
  fallbackModelId: z.string().nullable(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().optional(),
});

/**
 * Internal snapshot boundary schema: unknown keys are ignored (forward compat),
 * known keys are strict. Fase 1b-FIX item 9: flags and ids must agree — a
 * disabled pair carries null ids, so a producer cannot smuggle usable ids
 * past a fail-closed flag.
 */
export const internalSnapshotSchema = z
  .object({
    runtime: internalRuntimeDtoSchema,
    activeProvider: llmProviderSlotSchema.nullable(),
    activeModel: llmModelSlotSchema.nullable(),
    fallbackProvider: llmProviderSlotSchema.nullable(),
    fallbackModel: llmModelSlotSchema.nullable(),
    activeDisabled: z.boolean(),
    fallbackDisabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (
      v.activeDisabled &&
      (v.runtime.activeProviderId !== null || v.runtime.activeModelId !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'activeDisabled requires null active ids',
        path: ['runtime', 'activeProviderId'],
      });
    }
    if (
      v.fallbackDisabled &&
      (v.runtime.fallbackProviderId !== null || v.runtime.fallbackModelId !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fallbackDisabled requires null fallback ids',
        path: ['runtime', 'fallbackProviderId'],
      });
    }
    // Fase 2 item 3: when a pair is enabled, its ids must agree — a present
    // provider id requires a present model id and vice versa, so a
    // structurally valid but half-filled pair cannot become configuration.
    if (
      !v.activeDisabled &&
      (v.runtime.activeProviderId === null) !== (v.runtime.activeModelId === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'active pair requires both activeProviderId and activeModelId',
        path: ['runtime', 'activeProviderId'],
      });
    }
    if (
      !v.fallbackDisabled &&
      (v.runtime.fallbackProviderId === null) !== (v.runtime.fallbackModelId === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fallback pair requires both fallbackProviderId and fallbackModelId',
        path: ['runtime', 'fallbackProviderId'],
      });
    }
  });
