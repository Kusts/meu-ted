export type ContextTokenReplayClaim = {
  jti: string;
  workspaceId: string;
  requestId: string;
  providerMessageId: string;
  expiresAt: Date;
};

export type ContextTokenReplayGuard = {
  claim(input: ContextTokenReplayClaim): Promise<boolean>;
};
