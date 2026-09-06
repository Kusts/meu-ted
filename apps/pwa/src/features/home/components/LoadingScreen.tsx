"use client";

import StatusBar from "@/components/StatusBar";
import Skeleton from "@/components/ui/Skeleton";
import { HERO_BACKGROUND } from "../hero";

export function LoadingScreen() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <div
        className="px-5 pt-1 pb-6 sm:px-8 lg:px-12"
        style={{
          background: HERO_BACKGROUND,
        }}
      >
        {/* Hero skeleton */}
        <div className="mb-5 mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Skeleton variant="circle" width={38} height={38} style={{ background: "rgba(255,255,255,0.2)" }} />
            <div className="flex flex-col gap-1.5">
              <Skeleton variant="text" width={80} height={10} style={{ background: "rgba(255,255,255,0.2)" }} />
              <Skeleton variant="text" width={60} height={14} style={{ background: "rgba(255,255,255,0.3)" }} />
            </div>
          </div>
          <Skeleton variant="circle" width={38} height={38} style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>
        <Skeleton variant="text" width={140} height={10} style={{ background: "rgba(255,255,255,0.15)" }} className="mb-3" />
        <Skeleton variant="text" width={80} height={10} style={{ background: "rgba(255,255,255,0.15)" }} className="mb-2" />
        <Skeleton width="60%" height={40} style={{ background: "rgba(255,255,255,0.25)" }} className="mb-5" />
        <div className="flex gap-2">
          <Skeleton height={48} className="flex-1" style={{ background: "rgba(255,255,255,0.15)" }} />
          <Skeleton height={48} className="flex-1" style={{ background: "rgba(255,255,255,0.15)" }} />
          <Skeleton height={48} className="flex-1" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>
      </div>
      <div className="px-5 pt-4 pb-6 sm:px-8 lg:px-12">
        {/* KPI delta row skeleton */}
        <div className="mb-[14px] grid grid-cols-2 gap-2.5">
          <Skeleton variant="card" height={72} />
          <Skeleton variant="card" height={72} />
        </div>
        {/* Account list skeleton */}
        <div className="mb-[14px] flex flex-col gap-3 rounded-[18px] border border-border-subtle bg-surface-1 p-4">
          <Skeleton variant="text" width={120} height={14} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton variant="circle" width={28} height={28} />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton variant="text" width="50%" />
                <Skeleton variant="text" width="30%" height={9} />
              </div>
              <Skeleton variant="text" width={70} />
            </div>
          ))}
        </div>
        {/* Donut skeleton */}
        <Skeleton variant="card" height={140} />
      </div>
    </div>
  );
}
