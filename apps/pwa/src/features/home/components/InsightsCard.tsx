"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { TedAvatar } from "@/components/brand/TedMark";
import { openTedChat } from "@/features/ted/TedChatLauncher";
import type { InsightItem } from "../hooks/useFallbackInsights";
import { MessageCircle, Sparkles } from "lucide-react";

export function InsightsCard({ insights }: { insights: InsightItem[] }) {
  return (
    <div className="rounded-[18px] border border-border-subtle bg-surface-1 px-4 py-4 shadow-card">
      <div className="mb-3 flex items-center gap-2.5">
        <TedAvatar size={36} />
        <div className="text-[13px] font-bold text-text-primary">Insights do TED</div>
      </div>
      {insights.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={24} />}
          title="Sem insights por enquanto"
          description="Assim que houver movimentação, o TED traz observações aqui."
          action={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<MessageCircle size={15} aria-hidden="true" />}
              onClick={openTedChat}
            >
              Conversar com o TED
            </Button>
          }
        />
      ) : (
        insights.map((insight, i) => (
          <div key={i} className="flex gap-2.5 py-[7px] border-t border-border-subtle/50 first:border-none">
            <span className="mt-[6px] h-2 w-2 flex-none rounded-full" style={{ background: insight.color }} />
            <div className="flex-1">
              <div className="text-[13px] font-bold text-text-primary">{insight.title}</div>
              <div className="mt-[2px] text-[12px] leading-relaxed text-text-secondary">{insight.body}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
