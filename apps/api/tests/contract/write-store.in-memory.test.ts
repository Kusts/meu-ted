import { runWriteStoreContract } from './write-store.contract.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';

runWriteStoreContract({
  name: 'in-memory',
  create: async () => {
    const { writes } = createInMemoryStores();
    return { writes, cleanup: async () => {} };
  },
});
