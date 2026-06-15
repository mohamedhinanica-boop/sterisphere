"use client";

import { useState } from "react";
import Link from "next/link";

type Props = {
  overdueCycles: number;
  failedCycles: number;
  openInvestigations: number;
  expiredPacks: number;
  expiringSoonPacks: number;
  availablePacks: number;
};

export default function SteriAssistantWidget({
  overdueCycles,
  failedCycles,
  openInvestigations,
  expiredPacks,
  expiringSoonPacks,
  availablePacks,
}: Props) {
  const [collapsed, setCollapsed] = useState(true);

  const hasCriticalIssues = failedCycles > 0 || expiredPacks > 0;
  const hasWarnings =
    overdueCycles > 0 || expiringSoonPacks > 0 || openInvestigations > 0;

  const actions = [
    failedCycles > 0
      ? { href: "/cycles?status=Failed", label: "Investigate Failed Cycles" }
      : null,
    openInvestigations > 0
      ? { href: "/investigation", label: "Review Investigations" }
      : null,
    expiredPacks > 0
      ? { href: "/packs?status=Expired", label: "Review Expired Packs" }
      : null,
    overdueCycles > 0
      ? { href: "/cycles?status=Pending", label: "Review Pending Cycles" }
      : null,
    expiringSoonPacks > 0
      ? { href: "/packs?filter=expiring-soon", label: "Review Expiring Packs" }
      : null,
  ]
    .filter((action): action is { href: string; label: string } =>
      Boolean(action)
    );

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
        Steri Assistant
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
          -
        </button>
      </div>

      <div className="space-y-2 text-sm text-slate-800">
        {status === "critical" && (
          <p className="font-semibold">Attention required</p>
        )}

        {status === "warning" && (
          <p className="font-semibold">Review recommended</p>
        )}

        {status === "normal" && (
          <>
            <p className="font-semibold">All systems operating normally.</p>
            <p>Available packs: {availablePacks}</p>
          </>
        )}

        {status === "critical" && failedCycles > 0 && (
          <p>{failedCycles} failed cycle(s) need investigation.</p>
        )}

        {openInvestigations > 0 && (
          <p>{openInvestigations} open investigation(s) need review.</p>
        )}

        {status === "critical" && expiredPacks > 0 && (
          <p>{expiredPacks} expired pack(s) need review.</p>
        )}

        {status === "warning" && overdueCycles > 0 && (
          <p>{overdueCycles} pending cycle(s) awaiting confirmation.</p>
        )}

        {status === "warning" && expiringSoonPacks > 0 && (
          <p>{expiringSoonPacks} pack(s) expire within 30 days.</p>
        )}
      </div>

      {status !== "normal" && (
        <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
          Available packs: {availablePacks}
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
