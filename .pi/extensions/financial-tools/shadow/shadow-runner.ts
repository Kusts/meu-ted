import { getShadowReadMode, isShadowEligible } from "./shadow-config.js";
import { createShadowLogger } from "./shadow-logger.js";
import { compareShadowRead, type ShadowEvent } from "./shadow-read.js";
import { getUnsupportedShadowFilters } from "./shadow-filters.js";
import { createPostgresLegacyReaders, type LegacyReadRequest, type LegacyReaders } from "./legacy-readers.js";

export type ShadowRunner = <T>(capability: string, request: LegacyReadRequest, apiValue: T) => Promise<T>;

export type RunnerOptions = {
  enabled: boolean;
  readers: LegacyReaders;
  log: (event: ShadowEvent) => void;
};

export const createShadowRunner = (options: RunnerOptions): ShadowRunner => async <T>(capability: string, request: LegacyReadRequest, apiValue: T): Promise<T> => {
  const legacyRead = options.readers[capability];
  if (!options.enabled || !isShadowEligible(capability) || !legacyRead || getUnsupportedShadowFilters(capability, request).length > 0) return apiValue;
  await compareShadowRead({
    enabled: true,
    capability,
    request,
    apiValue,
    legacyRead: () => legacyRead(request),
    log: options.log,
  });
  return apiValue;
};

const productionReaders = createPostgresLegacyReaders();
const productionLogger = createShadowLogger();
let testRuntime: RunnerOptions | undefined;

export const setShadowRuntimeForTest = (runtime: RunnerOptions | undefined): void => {
  testRuntime = runtime;
};

export const runShadowRead: ShadowRunner = async <T>(capability: string, request: LegacyReadRequest, apiValue: T): Promise<T> => {
  try {
    if (getShadowReadMode() === "off") return apiValue;
    const runtime = testRuntime ?? { enabled: true, readers: productionReaders, log: productionLogger };
    return createShadowRunner(runtime)(capability, request, apiValue);
  } catch {
    return apiValue;
  }
};
