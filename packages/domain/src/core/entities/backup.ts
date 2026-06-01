import { z } from 'zod';

export const Backup = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  path: z.string().min(1),
  checksum: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().nullable(),
  restoreVerifiedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Backup = z.infer<typeof Backup>;