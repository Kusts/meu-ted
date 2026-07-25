"use client";

import BottomSheet from "@/components/BottomSheet";
import type { Transaction } from "@/lib/state/types";

interface TransactionActionSheetProps {
  open: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

export function TransactionActionSheet({
  open,
  transaction,
  onClose,
  onEdit,
  onDelete,
}: TransactionActionSheetProps) {
  if (!transaction) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title={transaction.description}>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            onEdit(transaction);
          }}
          className="flex w-full items-center gap-3 rounded-[12px] bg-surface px-4 py-3.5 text-left text-[14px] font-semibold text-text-primary transition-colors active:bg-fill-light"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
          Editar
        </button>

        <button
          type="button"
          data-testid="action-sheet-delete"
          onClick={() => {
            onDelete(transaction);
            onClose();
          }}
          className="flex w-full items-center gap-3 rounded-[12px] bg-surface px-4 py-3.5 text-left text-[14px] font-semibold text-danger transition-colors active:bg-fill-light"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6" />
          </svg>
          Excluir
        </button>
      </div>
    </BottomSheet>
  );
}
