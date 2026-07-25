import { runReadModelStoreContract, defaultContractSeed } from './read-model-store.contract.js';
import { createInMemoryReadModelStore } from '../../src/read-models/store.js';

const seed = defaultContractSeed();

runReadModelStoreContract({
  name: 'in-memory',
  seed,
  create: async () => ({
    store: createInMemoryReadModelStore(seed),
    cleanup: async () => {
      // no-op
    },
  }),
});

