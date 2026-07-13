"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resetLocalSession } from "@/lib/reset-session";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import Icon from "@/components/ui/Icon";
import Badge from "@/components/ui/Badge";
import NotificationsSheet from "./NotificationsSheet";
import { useAppState } from "@/lib/state/app-state-context";
import { useEffectiveProfile } from "./hooks";

type ProfileSheet = "edit" | "chat" | "notifications" | null;

const PROFILE_ITEMS = [
  {
    key: "edit" as const,
    label: "Editar perfil",
    icon: <Icon name="user" size={17} />,
  },
  {
    key: "notifications" as const,
    label: "Notificações",
    icon: <Icon name="bell" size={17} />,
  },
  {
    key: "chat" as const,
    label: "Chat com Pi (WhatsApp)",
    icon: <Icon name="info" size={17} />,
  },
];

const AVATAR_COLORS = [
  "#0E8C5A",
  "#820AD1",
  "#EC7000",
  "#3E6FB0",
  "#C8483B",
  "#1F2937",
];

export default function ProfilePage() {
  const router = useRouter();
  const [open, setOpen] = useState<ProfileSheet>(null);
  const [editKey, setEditKey] = useState(0);
  const profile = useEffectiveProfile();
  const { saveProfile } = useAppState();

  function handleItem(key: string) {
    if (key === "edit") {
      setOpen("edit");
      setEditKey((k) => k + 1);
    } else if (key === "chat") setOpen("chat");
    else if (key === "notifications") setOpen("notifications");
  }

  function handleLogout() {
    resetLocalSession();
    try {
      localStorage.removeItem("pi-finance:profile");
    } catch {
      /* noop */
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg pb-[var(--tab-bar-height)]">
      <StatusBar />
      <PageHeader title="Perfil" />

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-3">
          <Badge label={profile.name} size="lg" color={profile.avatarColor} />
          <div>
            <div className="text-[18px] font-extrabold text-text-primary">
              {profile.name}
            </div>
            <div className="text-[13px] text-text-muted">
              {profile.email || profile.phone || "Atualize seus dados de contato"}
            </div>
          </div>
        </div>

        <div className="rounded-[16px] bg-fill-light px-4 py-1">
          {PROFILE_ITEMS.map((item, idx) => (
            <button
              key={item.key}
              type="button"
              onClick={() => handleItem(item.key)}
              className={`flex w-full items-center gap-3 py-3 ${
                idx < PROFILE_ITEMS.length - 1 ? "border-b border-border" : ""
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left text-[14px] font-semibold text-text-primary">
                {item.label}
              </span>
              <Icon name="chevron-right" size={15} />
            </button>
          ))}
        </div>

        <div className="rounded-[16px] bg-fill-light px-4 py-1 opacity-50">
          <div className="flex w-full items-center gap-3 py-3">
            <Icon name="shield" size={17} />
            <span className="flex-1 text-left text-[14px] font-semibold text-text-muted">
              Segurança
            </span>
            <span className="text-[10px] font-bold text-text-muted">Em breve</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-[13px] border border-border bg-surface px-4 py-[13px] text-[14px] font-semibold text-danger transition-opacity hover:opacity-80"
        >
          Sair da conta
        </button>
      </main>

      <EditProfileSheet
        key={editKey}
        open={open === "edit"}
        profile={profile}
        onClose={() => setOpen(null)}
        onSave={async (input) => {
          await saveProfile(input);
          setOpen(null);
        }}
      />
      <NotificationsSheet
        open={open === "notifications"}
        onClose={() => setOpen(null)}
      />
      <ChatSheet open={open === "chat"} onClose={() => setOpen(null)} />
    </div>
  );
}

// ── Sub-sheets ──────────────────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-transparent p-1 text-text-primary"
      aria-label="Voltar"
    >
      <Icon name="chevron-left" size={20} />
    </button>
  );
}

function EditProfileSheet({
  open,
  profile,
  onClose,
  onSave,
}: {
  open: boolean;
  profile: {
    name: string;
    email: string;
    phone: string;
    avatarColor: string;
    greetingStyle: "auto" | "minimal" | "verbose";
  };
  onClose: () => void;
  onSave: (input: {
    name: string;
    email: string;
    phone: string;
    avatarColor: string;
    greetingStyle: "auto" | "minimal" | "verbose";
  }) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor);
  const [greetingStyle, setGreetingStyle] = useState(profile.greetingStyle);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form fields whenever the sheet opens or the underlying profile
  // changes (e.g. a previous save landed while the sheet was closed).
  useEffect(() => {
    if (!open) return;
    setName(profile.name);
    setEmail(profile.email);
    setPhone(profile.phone);
    setAvatarColor(profile.avatarColor);
    setGreetingStyle(profile.greetingStyle);
    setError(null);
  }, [open, profile.name, profile.email, profile.phone, profile.avatarColor, profile.greetingStyle]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar perfil">
      <div className="flex items-center gap-3 pb-5">
        <BackButton onClick={onClose} />
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none transition-colors focus:border-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            E-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none transition-colors focus:border-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Telefone
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none transition-colors focus:border-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Cor do avatar
          </label>
          <div className="flex flex-wrap gap-2.5">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => setAvatarColor(c)}
                className={`h-9 w-9 rounded-full transition-transform ${
                  avatarColor === c
                    ? "ring-2 ring-text-primary ring-offset-2 ring-offset-surface"
                    : ""
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Estilo da saudação
          </label>
          <div className="flex gap-1 rounded-xl bg-fill-light p-1">
            {(["auto", "minimal", "verbose"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setGreetingStyle(s)}
                className={`flex-1 rounded-[10px] py-2 text-center text-[12px] font-bold transition-colors ${
                  greetingStyle === s
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-muted"
                }`}
              >
                {s === "auto" ? "Automática" : s === "minimal" ? "Curta" : "Detalhada"}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <div className="rounded-[10px] bg-danger-tint px-3 py-2 text-[12px] font-semibold text-danger">
            ⚠ {error}
          </div>
        )}

        <button
          type="button"
          disabled={submitting || name.trim().length === 0}
          onClick={async () => {
            setError(null);
            setSubmitting(true);
            try {
              await onSave({
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim(),
                avatarColor,
                greetingStyle,
              });
            } catch (e) {
              setError((e as Error).message || "Falha ao salvar");
            } finally {
              setSubmitting(false);
            }
          }}
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </BottomSheet>
  );
}

function ChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Pi — seu agente financeiro">
      <div className="flex items-center gap-3 pb-5">
        <BackButton onClick={onClose} />
      </div>

      <div
        className="mb-4 rounded-[18px] p-5 text-center text-white"
        style={{ background: "linear-gradient(150deg, #0F6B45, #0A3A28)" }}
      >
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-2xl">
          🥇
        </div>
        <div className="mb-1.5 text-[16px] font-bold">Pi está pronto</div>
        <div className="text-[13px] text-white/80">
          Fale com Pi pelo WhatsApp e ele fará registros, gerará insights e
          responderá dúvidas sobre suas finanças.
        </div>
      </div>

      <div className="mb-4 rounded-[16px] bg-fill-light px-4 py-3.5 text-[13px] text-text-secondary">
        Número vinculado: <b className="text-text-primary">(11) 99999-9999</b>
      </div>

      <a
        href="https://wa.me/5511999999999"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2.5 rounded-[14px] bg-[#25D366] py-[15px] text-center text-[15px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Abrir no WhatsApp
      </a>
    </BottomSheet>
  );
}
