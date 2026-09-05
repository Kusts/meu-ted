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
  .regex(/^[A-Za-z0-9._-]+$/, 'model id contains disallowed characters');

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
