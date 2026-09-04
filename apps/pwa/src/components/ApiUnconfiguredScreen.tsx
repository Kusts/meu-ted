/**
 * Fail-closed screen for origins without a configured authoritative API.
 *
 * Rendered by RootProviders when `isApiConfigured()` is false: no app content,
 * no mock financial data and no auth surface is exposed on such origins
 * (the production host keeps its API fallback in lib/api/client.ts).
 */
export function ApiUnconfiguredScreen() {
  return (
    <div
      data-testid="api-unconfigured-screen"
      className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-bg px-6 text-center"
    >
      <h1 className="text-lg font-bold text-text-primary">Configuração necessária</h1>
      <p className="max-w-sm text-[13px] leading-relaxed text-text-muted">
        Esta origem não possui a API autoritativa configurada. Por segurança, os
        dados financeiros ficam indisponíveis aqui.
      </p>
      <p className="max-w-sm text-[11px] text-text-muted">
        Defina NEXT_PUBLIC_PI_FINANCE_API_BASE_URL no deploy desta origem.
      </p>
    </div>
  );
}
