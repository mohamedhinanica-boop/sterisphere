"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  FileSearch,
  Home,
  MoreHorizontal,
  Package,
  Printer,
  QrCode,
  Search,
  ShieldAlert,
  Timer,
} from "lucide-react";
import toast from "react-hot-toast";
import { getDashboardData } from "@/lib/modules/dashboard";
import { supabase } from "@/lib/supabase";

const primaryActions = [
  { title: "Start Cycle", href: "/cycles", icon: ClipboardCheck },
  { title: "Trace Patient", href: "/patients", icon: Search },
  { title: "Scan QR", href: "/patients", icon: QrCode },
  { title: "Pack Inventory", href: "/packs", icon: Package },
];

const secondaryActions = [
  { title: "Print Labels", href: "/packs", icon: Printer },
  { title: "Investigations", href: "/investigation", icon: FileSearch },
];

type WorkstationStatus = {
  pendingCycles: number;
  availablePacks: number;
  expiredPacks: number;
  openInvestigations: number;
  failedCycles: number;
};

type CurrentUser = {
  email: string;
  role: string;
};

export default function AssistantPage() {
  const [status, setStatus] = useState<WorkstationStatus>({
    pendingCycles: 0,
    availablePacks: 0,
    expiredPacks: 0,
    openInvestigations: 0,
    failedCycles: 0,
  });
  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    email: "",
    role: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkstation();
  }, []);

  async function loadWorkstation() {
    setLoading(true);

    try {
      const [dashboardData] = await Promise.all([
        getDashboardData(),
        loadCurrentUser(),
      ]);

      setStatus({
        pendingCycles: dashboardData.pendingCyclesCount,
        availablePacks: dashboardData.availablePacksCount,
        expiredPacks: dashboardData.unreviewedExpiredPacksCount,
        openInvestigations: dashboardData.openInvestigationsCount,
        failedCycles: dashboardData.unreviewedFailedCyclesCount,
      });
    } catch (error) {
      toast.error("Error loading workstation status.");
      console.error("Assistant workstation status error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCurrentUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const email = session?.user?.email || "";

    if (!email) {
      return;
    }

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_email", email)
      .maybeSingle();

    setCurrentUser({
      email,
      role: data?.role || "",
    });
  }

  const alertCount =
    status.expiredPacks +
    status.pendingCycles +
    status.failedCycles +
    status.openInvestigations;

  return (
    <main className="flex min-h-screen flex-col bg-slate-100 p-5 pb-24 lg:h-screen lg:overflow-hidden">
      <header className="mb-4 flex flex-col gap-3 rounded-3xl bg-slate-950 px-6 py-5 text-white shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-normal">
            SteriSphere Workstation
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Daily sterilization and traceability actions
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
          <p className="font-medium">{currentUser.email || "Signed in"}</p>
          <p className="mt-1 capitalize text-slate-300">
            {currentUser.role || "Workstation"}
          </p>
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          title="Available Packs"
          value={status.availablePacks}
          loading={loading}
          tone="normal"
        />
        <KpiCard
          title="Running/Pending Cycles"
          value={status.pendingCycles}
          loading={loading}
          tone={status.pendingCycles > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          title="Expired Packs"
          value={status.expiredPacks}
          loading={loading}
          tone={status.expiredPacks > 0 ? "critical" : "neutral"}
        />
        <KpiCard
          title="Open Investigations"
          value={status.openInvestigations}
          loading={loading}
          tone={status.openInvestigations > 0 ? "warning" : "neutral"}
        />
      </section>

      <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.9fr)] lg:overflow-hidden">
        <div className="grid gap-4 lg:grid-rows-[minmax(0,1fr)_auto]">
          <div className="grid grid-cols-2 gap-4">
            {primaryActions.map((action) => (
              <ActionTile key={action.title} {...action} primary />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {secondaryActions.map((action) => (
              <ActionTile key={action.title} {...action} />
            ))}
          </div>
        </div>

        <AssistantPanel status={status} alertCount={alertCount} loading={loading} />
      </section>

      <BottomNavigation />
    </main>
  );
}

function KpiCard({
  title,
  value,
  loading,
  tone,
}: {
  title: string;
  value: number;
  loading: boolean;
  tone: "normal" | "neutral" | "warning" | "critical";
}) {
  const toneClasses = {
    normal: "border-green-200 bg-green-50 text-green-700",
    neutral: "border-slate-200 bg-white text-slate-800",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
    critical: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">
        {title}
      </p>
      <p className="mt-1 text-3xl font-bold">{loading ? "-" : value}</p>
    </div>
  );
}

function ActionTile({
  title,
  href,
  icon: Icon,
  primary = false,
}: {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-32 flex-col justify-between rounded-3xl border p-5 shadow-sm ${
        primary
          ? "border-slate-900 bg-white text-slate-950"
          : "border-slate-200 bg-white text-slate-800"
      }`}
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
          primary ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
        }`}
      >
        <Icon className="h-7 w-7" />
      </span>
      <span className="text-2xl font-bold">{title}</span>
    </Link>
  );
}

function AssistantPanel({
  status,
  alertCount,
  loading,
}: {
  status: WorkstationStatus;
  alertCount: number;
  loading: boolean;
}) {
  const hasAlerts = alertCount > 0;

  return (
    <aside
      className={`rounded-3xl border p-5 shadow-sm ${
        hasAlerts
          ? "border-yellow-200 bg-yellow-50 text-yellow-900"
          : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Steri Assistant</h2>
          <p className="mt-1 text-sm opacity-75">Workstation guidance</p>
        </div>
        {hasAlerts && <ShieldAlert className="h-7 w-7 shrink-0" />}
      </div>

      <div className="mt-6 space-y-3 text-base">
        {loading ? (
          <p>Loading workstation status...</p>
        ) : hasAlerts ? (
          <>
            <p className="text-lg font-semibold">Review recommended</p>
            {status.expiredPacks > 0 && (
              <p>{status.expiredPacks} expired pack(s) need review.</p>
            )}
            {status.pendingCycles > 0 && (
              <p>{status.pendingCycles} pending cycle(s) need confirmation.</p>
            )}
            {status.failedCycles > 0 && (
              <p>{status.failedCycles} failed cycle(s) need investigation.</p>
            )}
            {status.openInvestigations > 0 && (
              <p>{status.openInvestigations} open investigation(s) need review.</p>
            )}
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">All clear.</p>
            <p>Daily sterilization and traceability workflows are ready.</p>
          </>
        )}
      </div>
    </aside>
  );
}

function BottomNavigation() {
  const items = [
    { label: "Home", href: "/assistant", icon: Home },
    { label: "Cycles", href: "/cycles", icon: Timer },
    { label: "Trace", href: "/patients", icon: Search },
    { label: "Inventory", href: "/packs", icon: Package },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white px-3 py-2 shadow-lg">
      <div className="mx-auto grid max-w-5xl grid-cols-5 gap-2">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-medium text-slate-700"
            >
              <Icon className="mb-1 h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          className="flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-medium text-slate-700"
        >
          <MoreHorizontal className="mb-1 h-5 w-5" />
          More
        </button>
      </div>
    </nav>
  );
}
