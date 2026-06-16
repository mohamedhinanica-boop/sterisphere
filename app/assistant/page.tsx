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
];

const workflowActions = [
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
    <main className="flex min-h-screen flex-col bg-slate-100 p-3 pb-20 lg:h-screen lg:overflow-hidden">
      <header className="mb-3 flex flex-col gap-2 rounded-3xl bg-slate-950 px-5 py-3 text-white shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal">
            SteriSphere Workstation
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Daily sterilization and traceability actions
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm">
          <p className="font-medium">{currentUser.email || "Signed in"}</p>
          <p className="mt-1 capitalize text-slate-300">
            {currentUser.role || "Workstation"}
          </p>
        </div>
      </header>

      <section className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <KpiCard
          title="Running Cycles"
          value={status.pendingCycles}
          loading={loading}
          tone={status.pendingCycles > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          title="Available Packs"
          value={status.availablePacks}
          loading={loading}
          tone="normal"
        />
        <KpiCard
          title="Expired Packs"
          value={status.expiredPacks}
          loading={loading}
          tone={status.expiredPacks > 0 ? "critical" : "neutral"}
        />
        <KpiCard
          title="Alerts/Open Investigations"
          value={alertCount}
          loading={loading}
          tone={alertCount > 0 ? "warning" : "neutral"}
        />
      </section>

      <section className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(330px,0.9fr)] lg:overflow-hidden">
        <div className="grid gap-3 lg:grid-rows-[minmax(0,1fr)_auto]">
          <div className="grid grid-cols-2 gap-3">
            {primaryActions.map((action) => (
              <ActionTile key={action.title} {...action} primary />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {workflowActions.map((action) => (
              <ActionTile key={action.title} {...action} />
            ))}
          </div>
        </div>

        <OperationalCenter
          status={status}
          alertCount={alertCount}
          loading={loading}
        />
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
    <div className={`rounded-2xl border p-3 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">
        {title}
      </p>
      <p className="mt-1 text-2xl font-bold">{loading ? "-" : value}</p>
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
      className={`flex flex-col justify-between rounded-3xl border p-5 shadow-sm ${
        primary
          ? "min-h-44 border-slate-950 bg-slate-950 text-white"
          : "min-h-28 border-slate-200 bg-white text-slate-800"
      }`}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
          primary ? "bg-white text-slate-950" : "bg-slate-100 text-slate-700"
        }`}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className={primary ? "text-3xl font-bold" : "text-xl font-bold"}>
        {title}
      </span>
    </Link>
  );
}

function OperationalCenter({
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
      className={`rounded-3xl border p-4 shadow-sm ${
        hasAlerts
          ? "border-yellow-200 bg-yellow-50 text-yellow-900"
          : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Operational Center</h2>
          <p className="mt-1 text-sm opacity-75">
            Status, guidance, and utility actions
          </p>
        </div>
        {hasAlerts && <ShieldAlert className="h-7 w-7 shrink-0" />}
      </div>

      <section className="mt-4 rounded-2xl border border-white/60 bg-white/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Running Cycle Status</h3>
            <p className="mt-1 text-sm opacity-75">
              {loading
                ? "Checking cycle queue..."
                : status.pendingCycles > 0
                  ? "Cycles are awaiting review."
                  : "No active cycles"}
            </p>
          </div>
          <Timer className="h-6 w-6 opacity-60" />
        </div>
        <div className="mt-3 rounded-xl border border-dashed border-current/20 p-3 text-sm opacity-75">
          Reserved for future running-cycle details.
        </div>
      </section>

      <section className="mt-4">
        <h3 className="text-base font-bold">Steri Assistant</h3>
        <div className="mt-2 space-y-2 text-sm">
          {loading ? (
            <p>Loading workstation status...</p>
          ) : hasAlerts ? (
            <>
              <p className="text-lg font-semibold">
                Start with the highest-risk items first.
              </p>
              {status.failedCycles > 0 && (
                <p>Investigate failed cycles before releasing related packs.</p>
              )}
              {status.expiredPacks > 0 && (
                <p>Review expired packs and keep them out of patient use.</p>
              )}
              {status.pendingCycles > 0 && (
                <p>Confirm pending cycles before starting the next load.</p>
              )}
              {status.openInvestigations > 0 && (
                <p>Check open investigations for follow-up actions.</p>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">Workstation ready.</p>
              <p>No urgent sterilization or traceability alerts are active.</p>
            </>
          )}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        {secondaryActions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.title}
              href={action.href}
              className="flex min-h-20 flex-col justify-between rounded-2xl border border-white/70 bg-white/70 p-3 text-sm font-semibold shadow-sm"
            >
              <Icon className="h-5 w-5 opacity-70" />
              {action.title}
            </Link>
          );
        })}
      </section>
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
