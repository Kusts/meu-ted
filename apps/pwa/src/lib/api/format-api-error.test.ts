import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { formatApiError } from "./format-api-error";

describe("formatApiError", () => {
  it("maps 409 version_conflict to a reload hint", () => {
    expect(formatApiError(new ApiError(409, "agent.version_conflict", "Conflito de versão"))).toBe(
      "A configuração foi alterada em outra sessão. Recarregue e tente novamente.",
    );
  });

  it("maps 409 runtime_in_use to an in-use hint", () => {
    expect(formatApiError(new ApiError(409, "agent.runtime_in_use", "provider is runtime in use"))).toBe(
      "Item em uso pela configuração ativa do agente. Altere o runtime antes de modificar.",
    );
  });

  it("passes activation_blocked server messages through", () => {
    expect(formatApiError(new ApiError(422, "agent.activation_blocked", "provider is disabled"))).toBe(
      "provider is disabled",
    );
  });

  it("maps 401 to a session-expired hint", () => {
    expect(formatApiError(new ApiError(401, "auth.session_required", "Token inválido"))).toBe(
      "Sessão expirada. Entre novamente.",
    );
  });

  it("maps 403 to a permission hint", () => {
    expect(formatApiError(new ApiError(403, "auth.admin_forbidden", "Forbidden"))).toBe(
      "Sem permissão para esta ação.",
    );
  });

  it("maps 404 to a not-found hint", () => {
    expect(formatApiError(new ApiError(404, "agent.provider_not_found", "Not here"))).toBe(
      "Recurso não encontrado. Recarregue e tente novamente.",
    );
  });

  it("keeps unknown server messages with their code", () => {
    expect(formatApiError(new ApiError(500, "agent.provider_error", "Upstream falhou"))).toBe(
      "Upstream falhou (código agent.provider_error).",
    );
  });

  it("falls back for plain errors and unknown values", () => {
    expect(formatApiError(new Error("boom"))).toBe("boom");
    expect(formatApiError("boom")).toBe("Erro inesperado. Tente novamente.");
    expect(formatApiError(null)).toBe("Erro inesperado. Tente novamente.");
  });
});
