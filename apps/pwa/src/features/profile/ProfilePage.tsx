"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import Icon from "@/components/ui/Icon";
import Badge from "@/components/ui/Badge";
import { getAuthToken } from "@/lib/api/client";

type ProfileSheet = "edit" | "chat" | null;

const PROFILE_ITEMS = [
  {
    key: "edit" as const,
    label: "Editar perfil",
    icon: <Icon name="user" size={17} />,
  },
  {
    key: "chat" as const,
    label: "Chat com Pi (WhatsApp)",
    icon: <Icon name="info" size={17} />,
  },
];

export default function ProfilePage() {
  const router = useRouter();
  const [open, setOpen] = useState<ProfileSheet>(null);

  function handleItem(key: string) {
    if (key === "edit") setOpen("edit");
    else if (key === "chat") setOpen("chat");
  }

  function handleLogout() {
    try {
      localStorage.removeItem("pi-finance:token");
      localStorage.removeItem("pi-finance:pin");
    } catch { /* noop */ }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg pb-[var(--tab-bar-height)]">
      <StatusBar />
      <PageHeader title="Perfil" />

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {/* Avatar + nome */}
        <div className="flex items-center gap-3">
          <Badge label="Marina Silva" size="lg" color="#0E8C5A" />
          <div>
            <div className="text-[18px] font-extrabold text-text-primary">
              Marina Silva
            </div>
            <div className="text-[13px] text-text-muted">
              marina@email.com
            </div>
          </div>
        </div>

        {/* Lista de itens ativos */}
        <div className="rounded-[16px] bg-fill-light px-4 py-1">
          {PROFILE_ITEMS.map((item, idx) => (
            <button
              key={item.key}
              type="button"
              onClick={() => handleItem(item.key)}
              className={`flex w-full items-center gap-3 py-3 ${
                idx < PROFILE_ITEMS.length - 1
                  ? "border-b border-border"
                  : ""
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

        {/* Itens desabilitados */}
        <div className="rounded-[16px] bg-fill-light px-4 py-1 opacity-50">
          {[
            {
              label: "Segurança",
              icon: <Icon name="shield" size={17} />,
            },
            {
              label: "Notificações",
              icon: <Icon name="bell" size={17} />,
            },
          ].map((item, idx, arr) => (
            <div
              key={item.label}
              className={`flex w-full items-center gap-3 py-3 ${
                idx < arr.length - 1 ? "border-b border-border" : ""
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left text-[14px] font-semibold text-text-muted">
                {item.label}
              </span>
              <span className="text-[10px] font-bold text-text-muted">Em breve</span>
            </div>
          ))}
        </div>

        {/* Botão Sair */}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-[13px] border border-border bg-surface px-4 py-[13px] text-[14px] font-semibold text-danger transition-opacity hover:opacity-80"
        >
          Sair da conta
        </button>
      </main>

      <EditProfileSheet
        open={open === "edit"}
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
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("Marina Silva");
  const [email, setEmail] = useState("marina@email.com");
  const [phone, setPhone] = useState("(11) 99999-9999");

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar perfil">
      <div className="flex items-center gap-3 pb-5">
        <BackButton onClick={onClose} />
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none transition-colors focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
        >
          Salvar alterações
        </button>
      </div>
    </BottomSheet>
  );
}

function ChatSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
        Número vinculado:{" "}
        <b className="text-text-primary">(11) 99999-9999</b>
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
