export interface PhoneWorkspaceResolution {
  userId: string;
  workspaceId: string;
  role: "owner" | "member";
  userName: string;
  email: string;
}

export class PhoneResolutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "PhoneResolutionError";
  }
}

export interface UserPhoneBinding {
  phone: string;
  userId: string;
  workspaceId?: string;
  status: "active" | "disabled";
}

export interface PhoneWorkspaceStore {
  bindPhone(input: { phone: string; userId: string; workspaceId?: string }): Promise<void>;
  unbindPhone(phone: string): Promise<void>;
  resolvePhone(phone: string, preferredWorkspaceId?: string): Promise<PhoneWorkspaceResolution>;
}

export const normalizePhone = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  return digits;
};

export type InMemoryUser = {
  id: string;
  name: string;
  email: string;
  status: "active" | "disabled";
};

export type InMemoryMembership = {
  userId: string;
  householdId: string;
  role: "owner" | "member";
  status: "active" | "revoked";
};

export const createInMemoryPhoneWorkspaceStore = (seed?: {
  users?: InMemoryUser[];
  memberships?: InMemoryMembership[];
  bindings?: UserPhoneBinding[];
}): PhoneWorkspaceStore => {
  const users = new Map<string, InMemoryUser>();
  const memberships: InMemoryMembership[] = [];
  const bindings = new Map<string, UserPhoneBinding>();

  if (seed?.users) {
    for (const u of seed.users) users.set(u.id, { ...u });
  }
  if (seed?.memberships) {
    for (const m of seed.memberships) memberships.push({ ...m });
  }
  if (seed?.bindings) {
    for (const b of seed.bindings) bindings.set(normalizePhone(b.phone), { ...b, phone: normalizePhone(b.phone) });
  }

  return {
    async bindPhone(input: { phone: string; userId: string; workspaceId?: string }): Promise<void> {
      const normalized = normalizePhone(input.phone);
      if (!normalized) {
        throw new PhoneResolutionError("auth.invalid_phone", "Telefone inválido", 400);
      }
      const binding: UserPhoneBinding = {
        phone: normalized,
        userId: input.userId,
        status: "active",
      };
      if (input.workspaceId !== undefined) {
        binding.workspaceId = input.workspaceId;
      }
      bindings.set(normalized, binding);
    },


    async unbindPhone(phone: string): Promise<void> {
      const normalized = normalizePhone(phone);
      bindings.delete(normalized);
    },

    async resolvePhone(phone: string, preferredWorkspaceId?: string): Promise<PhoneWorkspaceResolution> {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        throw new PhoneResolutionError("auth.invalid_phone", "Telefone não informado ou inválido", 400);
      }

      const binding = bindings.get(normalized);
      if (!binding || binding.status !== "active") {
        throw new PhoneResolutionError("auth.user_not_found", "Nenhum usuário cadastrado para este telefone", 404);
      }

      const user = users.get(binding.userId);
      if (!user || user.status !== "active") {
        throw new PhoneResolutionError("auth.user_disabled", "Usuário desativado", 403);
      }

      const activeMemberships = memberships.filter(
        (m) => m.userId === user.id && m.status === "active",
      );

      if (activeMemberships.length === 0) {
        throw new PhoneResolutionError("auth.no_active_workspace", "Usuário não possui nenhum workspace ativo", 403);
      }

      // If a specific workspace was requested or bound to the phone
      const targetWorkspaceId = preferredWorkspaceId ?? binding.workspaceId;

      if (targetWorkspaceId) {
        const found = activeMemberships.find((m) => m.householdId === targetWorkspaceId);
        if (!found) {
          throw new PhoneResolutionError("auth.membership_revoked", "Acesso revogado ou inexistente neste workspace", 403);
        }
        return {
          userId: user.id,
          workspaceId: found.householdId,
          role: found.role,
          userName: user.name,
          email: user.email,
        };
      }

      // If single active membership, resolve automatically
      if (activeMemberships.length === 1) {
        const single = activeMemberships[0]!;
        return {
          userId: user.id,
          workspaceId: single.householdId,
          role: single.role,
          userName: user.name,
          email: user.email,
        };
      }

      // Multiple active memberships without preference is ambiguous
      throw new PhoneResolutionError(
        "auth.ambiguous_workspace",
        `Usuário pertence a múltiplos workspaces (${activeMemberships.length}). Especifique o workspaceId.`,
        409,
      );
    },
  };
};
