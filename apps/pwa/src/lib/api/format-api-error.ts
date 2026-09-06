import { ApiError } from "./client";

/**
 * Converts any thrown value into an actionable pt-BR message for the UI.
 * Preserves the server-provided code/status/reason semantics: known conflict
 * and auth codes map to next-step guidance, descriptive 422 messages pass
 * through untouched, and unknown failures keep their code for support.
 */
export function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "agent.version_conflict":
        return "A configuração foi alterada em outra sessão. Recarregue e tente novamente.";
      case "agent.runtime_in_use":
        return "Item em uso pela configuração ativa do agente. Altere o runtime antes de modificar.";
      case "auth.session_required":
        return "Sessão expirada. Entre novamente.";
      case "auth.admin_forbidden":
      case "auth.workspace_forbidden":
        return "Sem permissão para esta ação.";
      case "agent.provider_not_found":
        return "Recurso não encontrado. Recarregue e tente novamente.";
      default:
        break;
    }
    if (error.status === 401) return "Sessão expirada. Entre novamente.";
    if (error.status === 403) return "Sem permissão para esta ação.";
    if (error.status === 404) return "Recurso não encontrado. Recarregue e tente novamente.";
    const message = error.message?.trim();
    // 422 carries descriptive governance reasons already — keep them verbatim.
    if (error.status === 422 && message) return message;
    if (message) return `${message} (código ${error.code}).`;
    return `Erro inesperado (HTTP ${error.status}).`;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Erro inesperado. Tente novamente.";
}
