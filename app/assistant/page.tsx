"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  FileSearch,
  Package,
  Printer,
  QrCode,
  Search,
  ShieldAlert,
  Timer,
} from "lucide-react";
import toast from "react-hot-toast";
import { getDashboardData } from "@/lib/modules/dashboard";

const actionCards = [
  {
    title: "Start Guided Cycle",
    href: "/cycles",
    icon: ClipboardCheck,
  },
  {
    title: "Review Running Cycles",
    href: "/cycles",
    icon: Timer,
  },
  {
    title: "Pack Inventory",
    href: "/packs",
    icon: Package,
  },
  {
    title: "Trace Patient Pack",
    href: "/patients",
    icon: Search,
  },
  {
    title: "Scan Pack QR",
    href: "/patients",
    icon: QrCode,
  },
  {
    title: "Print Labels",
    href: "/packs",
    icon: Printer,
  },
  {
    title: "Review Investigations",
    href: "/investigation",
    icon: FileSearch,
  },
];

type WorkstationStatus = {
  pendingCycles: number;
  availablePacks: number;
  expiredPacks: number;
  openInvestigations: number;
};

export default function AssistantPage() {
  const [status, setStatus] = useState<WorkstationStatus>({
    pendingCycles: 0,
    availablePacks: 0,
    expiredPacks: 0,
    openInvestigations: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);

    try {
      const data = await getDashboardData();

      setStatus({
        pendingCycles: data.pendingCyclesCount,
        availablePacks: data.availablePacksCount,
        expiredPacks: data.unreviewedExpiredPacksCount,
        openInvestigations: data.openInvestigationsCount,
      });
    } catch (error) {
      toast.error("Error loading workstation status.");
      console.error("Assistant workstation status error:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">SteriSphere Workstation</h1>
        <p className="mt-2 text-slate-600">
          Daily sterilization and traceability actions
        </p>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          title="Running/Pending Cycles"
          value={status.pendingCycles}
          loading={loading}
          tone={status.pendingCycles > 0 ? "warning" : "normal"}
        />
        <StatusCard
          title="Available Packs"
          value={status.availablePacks}
          loading={loading}
          tone="normal"
        />
        <StatusCard
          title="Expired Packs"
          value={status.expiredPacks}
          loading={loading}
          tone={status.expiredPacks > 0 ? "critical" : "normal"}
        />
        <StatusCard
          title="Open Investigations"
          value={status.openInvestigations}
          loading={loading}
          tone={status.openInvestigations > 0 ? "warning" : "normal"}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {actionCards.map((card) => {
          const Icon = card.icon;

          return (
            <Link
              key={card.title}
              href={card.href}
              className="flex min-h-36 items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:translate-y-0"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Icon className="h-7 w-7" />
              </span>
              <span className="text-xl font-semibold text-slate-950">
                {card.title}
              </span>
            </Link>
          );
        })}
      </section>
    </>
  );
}

function StatusCard({
  title,
  value,
  loading,
  tone,
}: {
  title: string;
  value: number;
  loading: boolean;
  tone: "normal" | "warning" | "critical";
}) {
  const toneClasses = {
    normal: "border-green-200 bg-green-50 text-green-700",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
    critical: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium opacity-80">{title}</p>
        {tone === "critical" && <ShieldAlert className="h-5 w-5" />}
      </div>
      <p className="mt-2 text-4xl font-bold">{loading ? "-" : value}</p>
    </div>
  );
}
