export type EntityCandidate = { id: string; name: string; [key: string]: unknown };
export class EntityResolutionError extends Error { constructor(readonly code: string, message: string, readonly candidates: EntityCandidate[] = []) { super(message); } }
type Request = (method: string, path: string, options?: { query?: Record<string, string>; headers?: Record<string, string> }) => Promise<unknown>;

export const resolveEntity = async (input: { type: 'account' | 'category'; query: string; request: Request; headers?: Record<string, string> }): Promise<EntityCandidate> => {
  const path = input.type === 'account' ? '/accounts' : '/categories';
  const response = await input.request('GET', path, { query: { search: input.query }, headers: input.headers });
  const raw = response && typeof response === 'object' ? response as { items?: unknown; data?: unknown } : {};
  const items = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.data) ? raw.data : Array.isArray(response) ? response : [];
  const candidates = items.filter((x): x is EntityCandidate => !!x && typeof x === 'object' && typeof (x as EntityCandidate).id === 'string' && typeof (x as EntityCandidate).name === 'string');
  const q = input.query.trim().toLocaleLowerCase('pt-BR');
  const exact = candidates.filter((c) => c.name.trim().toLocaleLowerCase('pt-BR') === q);
  if (exact.length === 1) return exact[0]!;
  if (candidates.length === 0) throw new EntityResolutionError('entity.not_found', `Nenhum ${input.type} encontrado.`, []);
  throw new EntityResolutionError('entity.ambiguous', `Mais de um ${input.type} corresponde à busca.`, exact.length > 1 ? exact : candidates);
};
export const resolveAccount = (input: Omit<Parameters<typeof resolveEntity>[0], 'type'>) => resolveEntity({ ...input, type: 'account' });
export const resolveCategory = (input: Omit<Parameters<typeof resolveEntity>[0], 'type'>) => resolveEntity({ ...input, type: 'category' });
