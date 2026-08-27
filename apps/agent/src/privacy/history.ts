export type MessageRecord = {
  id: string;
  actorId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
};

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, // JWT / Tokens
  /sk-[A-Za-z0-9]{20,}/g, // OpenAI API Keys
  /ghp_[A-Za-z0-9]{20,}/g,
  /password["']?\s*[:=]\s*["'][^"']+["']/gi,
];

export const sanitizeForPersistence = (text: string): string => {
  if (!text) return '';
  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }
  return sanitized;
};

export const canActorClearHistory = (
  actorRole: string,
  targetActorId?: string,
  requestingActorId?: string,
): boolean => {
  // Owner can clear workspace history
  if (actorRole === 'owner') return true;

  // Member can only clear their own history, never other members or global workspace
  if (targetActorId && requestingActorId && targetActorId === requestingActorId) {
    return true;
  }

  return false;
};
