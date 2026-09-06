import type {
  LlmModel,
  LlmProvider,
  PrivacyClass,
  Protocol,
  RuntimeConfig,
  RuntimeStatus,
} from './llm-config.js';

export type LlmConfigStore = {
  listProviders(): Promise<LlmProvider[]>;
  getProvider(id: string): Promise<LlmProvider | null>;
  upsertProvider(input: {
    id: string;
    kind: LlmProvider['kind'];
    transport: LlmProvider['transport'];
    authMode: LlmProvider['authMode'];
    secretAlias: LlmProvider['secretAlias'];
    enabled?: boolean;
    eligibility?: LlmProvider['eligibility'];
    runtimeStatus?: LlmProvider['runtimeStatus'];
  }): Promise<LlmProvider>;
  deleteProvider(id: string): Promise<void>;
  listModels(): Promise<LlmModel[]>;
  getModel(id: string): Promise<LlmModel | null>;
  getRuntime(): Promise<RuntimeConfig>;
  updateRuntime(input: {
    providerId: string | null;
    modelId: string | null;
    fallbackProviderId?: string | null;
    fallbackModelId?: string | null;
    rolloutMode?: RuntimeConfig['rolloutMode'];
    canaryAllowlist?: string[];
    expectedVersion: number;
    updatedBy: string;
  }): Promise<RuntimeConfig>;
  setProviderEnabled(id: string, enabled: boolean): Promise<LlmProvider>;
  setProviderRuntimeStatus(id: string, runtimeStatus: RuntimeStatus): Promise<LlmProvider>;
  setModelEnabled(id: string, enabled: boolean): Promise<LlmModel>;
  upsertModel(input: {
    id?: string;
    providerId: string;
    modelId: string;
    protocol: Protocol;
    privacyClass: PrivacyClass;
    retention?: string | null;
    enabled?: boolean;
  }): Promise<LlmModel>;
  deleteModel(id: string): Promise<void>;
  bumpSecurityEpoch(updatedBy?: string): Promise<RuntimeConfig>;
};

/** Shared store error shape for revalidation rejections (both backends). */
export const activationBlocked = (reason: string) =>
  Object.assign(new Error(reason), { statusCode: 422, code: 'agent.activation_blocked', reason });
