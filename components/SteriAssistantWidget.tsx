"use client";

import { useState } from "react";
import Link from "next/link";

type Props = {
  overdueCycles: number;
  failedCycles: number;
  expiredPacks: number;
  expiringSoonPacks: number;
  availablePacks: number;
};

export default function SteriAssistantWidget({
  overdueCycles,
  failedCycles,
  expiredPacks,
  expiringSoonPacks,
  availablePacks,
}: Props) {
  const [collapsed, setCollapsed] = useState(true);

  const hasCriticalIssues =
    overdueCycles > 0 || failedCycles > 0 || expiredPacks > 0;

  const hasWarnings = expiringSoonPacks > 0;

  const status = hasCriticalIssues
    ? "critical"
    : hasWarnings
    ? "warning"
    : "normal";

  const containerClass =
    status === "critical"
      ? "bg-red-50 border-red-200"
      : status === "warning"
      ? "bg-orange-50 border-orange-200"
      : "bg-blue-50 border-blue-200";

  const titleClass =
    status === "critical"
      ? "text-red-700"
      : status === "warning"
      ? "text-orange-700"
      : "text-blue-700";

  const pulseClass = status !== "normal" ? "animate-pulse" : "";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={`fixed bottom-5 right-5 z-50 rounded-full border shadow-xl px-4 py-3 text-sm font-semibold cursor-pointer transition hover:scale-105 ${containerClass} ${titleClass} ${pulseClass}`}
      >
        🤖 Steri Assistant
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border shadow-xl p-4 ${containerClass}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className={`font-semibold ${titleClass}`}>
            SteriSphere Assistant
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Live operational guidance
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          −
        </button>
      </div>

      <div className="space-y-2 text-sm text-slate-800">
        {overdueCycles > 0 && (
          <p>⚠ {overdueCycles} cycle(s) awaiting confirmation</p>
        )}

        {failedCycles > 0 && (
          <p>🚨 {failedCycles} failed cycle(s) need investigation</p>
        )}

        {expiredPacks > 0 && <p>🚨 {expiredPacks} expired pack(s)</p>}

        {expiringSoonPacks > 0 && (
          <p>⚠ {expiringSoonPacks} pack(s) expire within 30 days</p>
        )}

        {!hasCriticalIssues && !hasWarnings && (
          <p>✓ All systems operating normally.</p>
        )}
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
        Available packs: {availablePacks}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/cycles"
          className="text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
        >
          Cycles
        </Link>

        <Link
          href="/packs"
          className="text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
        >
          Packs
        </Link>

        <Link
          href="/investigation"
          className="text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
        >
          Review
        </Link>
      </div>
    </div>
  );
}