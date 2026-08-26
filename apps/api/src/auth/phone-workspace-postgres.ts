import type { Pool } from "pg";
import {
  normalizePhone,
  PhoneResolutionError,
  type PhoneWorkspaceResolution,
  type PhoneWorkspaceStore,
} from "./phone-workspace.js";

type Row = Record<string, unknown>;

export const createPostgresPhoneWorkspaceStore = (pool: Pool): PhoneWorkspaceStore => {
  return {
    async bindPhone(input: { phone: string; userId: string; workspaceId?: string }): Promise<void> {
      const normalized = normalizePhone(input.phone);
      if (!normalized) {
        throw new PhoneResolutionError("auth.invalid_phone", "Telefone inválido", 400);
      }

      await pool.query(
        `INSERT INTO user_phone_bindings (phone, user_id, workspace_id, status, updated_at)
         VALUES ($1, $2, $3, 'active', NOW())
         ON CONFLICT (phone) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             workspace_id = EXCLUDED.workspace_id,
             status = 'active',
             updated_at = NOW()`,
        [normalized, input.userId, input.workspaceId ?? null],
      );
    },

    async unbindPhone(phone: string): Promise<void> {
      const normalized = normalizePhone(phone);
      if (!normalized) return;

      await pool.query(
        `UPDATE user_phone_bindings
         SET status = 'disabled', updated_at = NOW()
         WHERE phone = $1`,
        [normalized],
      );
    },

    async resolvePhone(phone: string, preferredWorkspaceId?: string): Promise<PhoneWorkspaceResolution> {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        throw new PhoneResolutionError("auth.invalid_phone", "Telefone não informado ou inválido", 400);
      }

      const res = await pool.query<Row>(
        `SELECT
           b.user_id,
           b.workspace_id AS bound_workspace_id,
           u.name AS user_name,
           u.email,
           u.status AS user_status,
           m.household_id,
           m.role,
           m.status AS membership_status
         FROM user_phone_bindings b
         JOIN users u ON b.user_id = u.id
         LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
         WHERE b.phone = $1 AND b.status = 'active'`,
        [normalized],
      );

      if (res.rowCount === 0) {
        throw new PhoneResolutionError("auth.user_not_found", "Nenhum usuário cadastrado para este telefone", 404);
      }

      const firstRow = res.rows[0]!;
      if (firstRow["user_status"] !== "active") {
        throw new PhoneResolutionError("auth.user_disabled", "Usuário desativado", 403);
      }

      const activeMemberships = res.rows
        .filter((r) => r["household_id"] && r["membership_status"] === "active")
        .map((r) => ({
          householdId: r["household_id"] as string,
          role: (r["role"] as "owner" | "member") ?? "member",
        }));

      if (activeMemberships.length === 0) {
        throw new PhoneResolutionError("auth.no_active_workspace", "Usuário não possui nenhum workspace ativo", 403);
      }

      const targetWorkspaceId = preferredWorkspaceId ?? (firstRow["bound_workspace_id"] as string | null);

      if (targetWorkspaceId) {
        const found = activeMemberships.find((m) => m.householdId === targetWorkspaceId);
        if (!found) {
          throw new PhoneResolutionError("auth.membership_revoked", "Acesso revogado ou inexistente neste workspace", 403);
        }
        return {
          userId: firstRow["user_id"] as string,
          workspaceId: found.householdId,
          role: found.role,
          userName: firstRow["user_name"] as string,
          email: firstRow["email"] as string,
        };
      }

      if (activeMemberships.length === 1) {
        const single = activeMemberships[0]!;
        return {
          userId: firstRow["user_id"] as string,
          workspaceId: single.householdId,
          role: single.role,
          userName: firstRow["user_name"] as string,
          email: firstRow["email"] as string,
        };
      }

      throw new PhoneResolutionError(
        "auth.ambiguous_workspace",
        `Usuário pertence a múltiplos workspaces (${activeMemberships.length}). Especifique o workspaceId.`,
        409,
      );
    },
  };
};
