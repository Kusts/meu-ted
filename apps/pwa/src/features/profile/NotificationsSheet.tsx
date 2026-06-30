"use client";

import BottomSheet from "@/components/BottomSheet";
import Icon from "@/components/ui/Icon";

interface NotificationsSheetProps {
  open: boolean;
  onClose: () => void;
}

const ITEMS = [
  {
    title: "Contas a vencer hoje",
    detail: "Receba alerta no começo do dia para não esquecer boletos e assinaturas.",
  },
  {
    title: "Resumo diário",
    detail: "Resumo com saldo, gastos e próximos vencimentos.",
  },
  {
    title: "Limite do cartão",
    detail: "Aviso quando uso do limite passar de 80%.",
  },
];

export default function NotificationsSheet({
  open,
  onClose,
}: NotificationsSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Notificações">
      <div className="mb-4 rounded-[18px] bg-fill-light p-4">
        <div className="mb-1.5 flex items-center gap-2 text-[15px] font-bold text-text-primary">
          <Icon name="bell" size={18} />
          Alertas do Pi
        </div>
        <p className="text-[13px] leading-relaxed text-text-secondary">
          Centralize lembretes financeiros e acompanhe sinais importantes sem sair do PWA.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {ITEMS.map((item) => (
          <div
            key={item.title}
            className="rounded-[16px] border border-border bg-fill-light px-4 py-3"
          >
            <div className="mb-1 text-[14px] font-semibold text-text-primary">
              {item.title}
            </div>
            <div className="text-[12px] leading-relaxed text-text-secondary">
              {item.detail}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
      >
        Fechar
      </button>
    </BottomSheet>
  );
}
