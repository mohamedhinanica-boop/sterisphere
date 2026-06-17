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
import { formatCycleDuration } from "@/lib/modules/cycles";
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
  failedCycles: number;
};

type CurrentUser = {
  email: string;
  role: string;
};

type RunningCycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  status: string;
  cycle_state: string | null;
  expected_finish_at: string | null;
  created_at: string;
};

export default function AssistantPage() {
  const [status, setStatus] = useState<WorkstationStatus>({
    pendingCycles: 0,
    availablePacks: 0,
    expiredPacks: 0,
    failedCycles: 0,
  });
  const [runningCycle, setRunningCycle] = useState<RunningCycle | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    email: "",
    role: "",
  });
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    loadWorkstation();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  async function loadWorkstation() {
    setLoading(true);

    try {
      const [dashboardData, currentRunningCycle] = await Promise.all([
        getDashboardData(),
        loadRunningCycle(),
        loadCurrentUser(),
      ]);

      setStatus({
        pendingCycles: dashboardData.pendingCyclesCount,
        availablePacks: dashboardData.availablePacksCount,
        expiredPacks: dashboardData.unreviewedExpiredPacksCount,
        failedCycles: dashboardData.unreviewedFailedCyclesCount,
      });
      setRunningCycle(currentRunningCycle);
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

  async function loadRunningCycle(): Promise<RunningCycle | null> {
    const { data, error } = await supabase
      .from("cycles")
      .select(
        "id, cycle_number, sterilizer, status, cycle_state, expected_finish_at, created_at"
      )
      .eq("status", "Pending")
      .eq("cycle_state", "Open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RunningCycle>();

    if (error) {
      console.error("Assistant running cycle lookup error:", error);
      return null;
    }

    return data;
  }

  const pendingReviews = status.failedCycles + status.pendingCycles;

  return (
    <main className="flex min-h-[100svh] flex-col bg-slate-100 p-2 pb-20 sm:p-3 lg:h-[100svh] lg:overflow-hidden">
      <header className="mb-2 flex flex-col gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-white shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-normal sm:text-2xl">
            SteriSphere Workstation
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Daily sterilization and traceability actions
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 px-3 py-1.5 text-sm">
          <p className="font-medium">{currentUser.email || "Signed in"}</p>
          <p className="mt-1 capitalize text-slate-300">
            {currentUser.role || "Workstation"}
          </p>
        </div>
      </header>

      <section className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-4">
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
          title="Pending Reviews"
          value={pendingReviews}
          loading={loading}
          tone={
            status.failedCycles > 0
              ? "critical"
              : pendingReviews > 0
                ? "warning"
                : "neutral"
          }
        />
      </section>

      <section className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.9fr)] xl:grid-cols-[minmax(0,2fr)_minmax(330px,0.9fr)] lg:overflow-hidden">
        <div className="grid min-h-0 gap-2 lg:grid-rows-[minmax(0,1fr)_auto]">
          <div className="grid min-h-0 grid-cols-2 gap-2">
            {primaryActions.map((action) => (
              <ActionTile key={action.title} {...action} primary />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {workflowActions.map((action) => (
              <ActionTile key={action.title} {...action} />
            ))}
          </div>
        </div>

        <OperationalCenter
          status={status}
          runningCycle={runningCycle}
          now={now}
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
    <div className={`rounded-2xl border p-2.5 shadow-sm sm:p-3 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">
        {title}
      </p>
      <p className="mt-1 text-xl font-bold sm:text-2xl">{loading ? "-" : value}</p>
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
      className={`flex min-h-0 flex-col justify-between rounded-2xl border p-4 shadow-sm ${
        primary
          ? "min-h-[clamp(7.5rem,19vh,10rem)] border-slate-950 bg-slate-950 text-white"
          : "min-h-[clamp(5.75rem,13vh,7rem)] border-slate-200 bg-white text-slate-800"
      }`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-2xl sm:h-11 sm:w-11 ${
          primary ? "bg-white text-slate-950" : "bg-slate-100 text-slate-700"
        }`}
      >
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <span
        className={
          primary
            ? "text-[clamp(1.5rem,2.5vw,1.875rem)] font-bold"
            : "text-[clamp(1.125rem,2vw,1.25rem)] font-bold"
        }
      >
        {title}
      </span>
    </Link>
  );
}

function OperationalCenter({
  status,
  runningCycle,
  now,
  loading,
}: {
  status: WorkstationStatus;
  runningCycle: RunningCycle | null;
  now: Date;
  loading: boolean;
}) {
  const hasFailedReviews = status.failedCycles > 0;
  const hasPendingReviews = status.pendingCycles > 0;
  const hasRunningCycle = Boolean(runningCycle);
  const hasPriority = hasFailedReviews || hasRunningCycle || hasPendingReviews;
  const isIdle = !loading && !hasPriority;
  const timing = runningCycle
    ? getCycleTiming(runningCycle.expected_finish_at, now)
    : null;

  return (
    <aside
      className={`flex min-h-0 flex-col rounded-2xl border p-3 shadow-sm sm:p-4 ${
        hasFailedReviews
          ? "border-red-200 bg-red-50 text-red-900"
          : hasPriority
          ? "border-yellow-200 bg-yellow-50 text-yellow-900"
          : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Operational Center</h2>
          <p className="mt-1 text-sm opacity-75">
            Live cycle status and review guidance
          </p>
        </div>
        {hasPriority ? (
          <ShieldAlert className="h-7 w-7 shrink-0" />
        ) : (
          <Timer className="h-7 w-7 shrink-0 opacity-70" />
        )}
      </div>

      {loading ? (
        <section className="mt-3 rounded-2xl border border-white/60 bg-white/60 p-3 sm:p-4">
          <p className="text-lg font-semibold">Checking command center...</p>
          <p className="mt-2 text-sm opacity-75">
            Loading cycle status and pending reviews.
          </p>
        </section>
      ) : hasFailedReviews ? (
        <section className="mt-3 rounded-2xl border border-red-200 bg-white/75 p-3 sm:p-4">
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
            Critical status
          </span>
          <h3 className="mt-3 text-xl font-bold">
            Failed cycle requiring review
          </h3>
          <p className="mt-2 text-sm">
            {status.failedCycles} failed{" "}
            {status.failedCycles === 1 ? "cycle is" : "cycles are"} awaiting
            investigation review before related work can move forward.
          </p>
          <Link
            href="/investigation"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-sm"
          >
            Investigation Center
          </Link>
        </section>
      ) : runningCycle && timing ? (
        <section className="mt-3 rounded-2xl border border-yellow-200 bg-white/75 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
                Running
              </span>
              <h3 className="mt-3 text-xl font-bold">
                {runningCycle.cycle_number}
              </h3>
              <p className="mt-1 text-sm opacity-75">
                {runningCycle.sterilizer}
              </p>
            </div>
            <span
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${timing.badgeClass}`}
            >
              {timing.label}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:gap-3">
            <div>
              <dt className="font-semibold opacity-70">Started</dt>
              <dd className="mt-1 font-bold">
                {formatCompactDateTime(runningCycle.created_at)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold opacity-70">Expected Finish</dt>
              <dd className="mt-1 font-bold">
                {formatCompactDateTime(runningCycle.expected_finish_at)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold opacity-70">Time Remaining</dt>
              <dd className={`mt-1 font-bold ${timing.textClass}`}>
                {timing.description}
              </dd>
            </div>
            <div>
              <dt className="font-semibold opacity-70">Status</dt>
              <dd className="mt-1 font-bold">Running</dd>
            </div>
          </dl>

          <Link
            href="/cycles?status=Pending"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm"
          >
            Open Cycle
          </Link>
        </section>
      ) : hasPendingReviews ? (
        <section className="mt-3 rounded-2xl border border-yellow-200 bg-white/75 p-3 sm:p-4">
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-800">
            Review recommended
          </span>
          <h3 className="mt-3 text-xl font-bold">Pending cycle review</h3>
          <p className="mt-2 text-sm">
            {status.pendingCycles}{" "}
            {status.pendingCycles === 1 ? "cycle is" : "cycles are"} awaiting
            confirmation. Review before releasing packs or starting related
            traceability work.
          </p>
          <Link
            href="/cycles?status=Pending"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-yellow-500 px-4 py-3 text-sm font-bold text-yellow-950 shadow-sm"
          >
            Review Cycles
          </Link>
        </section>
      ) : (
        <section className="mt-3 rounded-2xl border border-blue-200 bg-white/75 p-3 sm:p-4">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
            Normal state
          </span>
          <h3 className="mt-3 text-xl font-bold">No Active Cycles</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <p>
              <span className="block font-semibold opacity-70">
                Available Packs
              </span>
              <span className="text-lg font-bold">{status.availablePacks}</span>
            </p>
            <p>
              <span className="block font-semibold opacity-70">
                Expired Packs
              </span>
              <span className="text-lg font-bold">{status.expiredPacks}</span>
            </p>
          </div>
          <p className="mt-3 text-sm font-semibold">
            All systems operating normally.
          </p>
        </section>
      )}

      {isIdle && (
        <>
          <section className="mt-3 rounded-2xl border border-white/60 bg-white/60 p-3 text-sm">
            <h3 className="font-bold">Steri Assistant</h3>
            <p className="mt-2">
              Workstation ready for the next sterilization or traceability task.
            </p>
          </section>

          <section className="mt-3 grid grid-cols-2 gap-2">
            {secondaryActions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.title}
                  href={action.href}
                  className="flex min-h-[clamp(4.75rem,10vh,5.75rem)] flex-col justify-between rounded-2xl border border-white/70 bg-white/70 p-3 text-sm font-semibold shadow-sm"
                >
                  <Icon className="h-5 w-5 opacity-70" />
                  {action.title}
                </Link>
              );
            })}
          </section>
        </>
      )}
    </aside>
  );
}

function getCycleTiming(expectedFinishAt: string | null, now: Date) {
  if (!expectedFinishAt) {
    return {
      label: "No finish time",
      description: "N/A",
      textClass: "text-slate-700",
      badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
    };
  }

  const finishTime = new Date(expectedFinishAt).getTime();
  const diffMinutes = Math.ceil((finishTime - now.getTime()) / 60000);

  if (diffMinutes > 0) {
    const duration = formatCycleDuration(diffMinutes);

    return {
      label: `${duration} remaining`,
      description: duration,
      textClass: "text-blue-700",
      badgeClass: "border-blue-200 bg-blue-100 text-blue-700",
    };
  }

  const overdueMinutes = Math.max(1, Math.abs(diffMinutes));
  const duration = formatCycleDuration(overdueMinutes);

  return {
    label: `Overdue by ${duration}`,
    description: `Overdue by ${duration}`,
    textClass: "text-red-700",
    badgeClass: "border-red-200 bg-red-100 text-red-700",
  };
}

function formatCompactDateTime(date: string | null) {
  if (!date) {
    return "N/A";
  }

  return new Date(date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
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
