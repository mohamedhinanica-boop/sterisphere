"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Home,
  MoreHorizontal,
  Package,
  PackageX,
  Printer,
  Search,
  ShieldAlert,
  Timer,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatCycleDuration } from "@/lib/modules/cycles";
import { getDashboardData } from "@/lib/modules/dashboard";
import { supabase } from "@/lib/supabase";
import {
  getActivityVariantClass,
  loadAssistantActivity,
  type AssistantActivityItem,
} from "@/lib/modules/assistantActivity";

const primaryActions = [
  { title: "Start Cycle", href: "/assistant/cycle/start", icon: ClipboardCheck },
  { title: "Scan QR", href: "/assistant/trace/start?mode=scan", icon: Search },
];

const workflowActions = [
  { title: "Cycle Center", href: "/assistant/cycles", icon: ClipboardCheck },
  { title: "Pack Inventory", href: "/assistant/inventory", icon: Package },
];

const REVIEW_OVERDUE_THRESHOLD_MS = 5 * 60 * 1000;

const secondaryActions = [
  { title: "Print Labels", href: "/packs", icon: Printer },
  { title: "Investigations", href: "/assistant/investigations", icon: FileSearch },
];

type WorkstationStatus = {
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
type WorkQueueCycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  expected_finish_at: string | null;
  created_at: string;
};

type WorkQueueInvestigation = {
  id: string;
  cycle_number: string;
  investigation_status: string | null;
  created_at: string;
};

type WorkQueuePack = {
  id: string;
  pack_number: string;
  expires_at: string | null;
  status: string | null;
};

type QueueCounts = {
  readyCycles: number;
  openInvestigations: number;
  expiredPacks: number;
  expiringPacks: number;
};

type NextRecommendedAction = {
  title: string;
  label: string;
  identifier: string;
  detail: string;
  href: string;
  buttonLabel: string;
  tone: "red" | "yellow" | "blue" | "green";
  icon: ComponentType<{ className?: string }>;
};

type WorkQueueData = {
  nextAction: NextRecommendedAction | null;
  counts: QueueCounts;
};

export default function AssistantPage() {
  const [status, setStatus] = useState<WorkstationStatus>({
    availablePacks: 0,
    expiredPacks: 0,
    failedCycles: 0,
  });
  const [activeCycles, setActiveCycles] = useState<RunningCycle[]>([]);
  const [recentActivity, setRecentActivity] = useState<AssistantActivityItem[]>([]);
  const [workQueue, setWorkQueue] = useState<WorkQueueData>({
    nextAction: null,
    counts: {
      readyCycles: 0,
      openInvestigations: 0,
      expiredPacks: 0,
      expiringPacks: 0,
    },
  });
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
      const [
        dashboardData,
        currentActiveCycles,
        currentWorkQueue,
        currentActivity,
      ] = await Promise.all([
        getDashboardData(),
        loadActiveCycles(),
        loadWorkQueueData(),
        loadAssistantActivity(6).catch((error) => {
          console.error("Assistant recent activity load error:", error);
          return [];
        }),
        loadCurrentUser(),
      ]);

      setStatus({
        availablePacks: dashboardData.availablePacksCount,
        expiredPacks: dashboardData.unreviewedExpiredPacksCount,
        failedCycles: dashboardData.unreviewedFailedCyclesCount,
      });
      setActiveCycles(currentActiveCycles);
      setWorkQueue(currentWorkQueue);
      setRecentActivity(currentActivity);
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

  async function loadActiveCycles(): Promise<RunningCycle[]> {
    const { data, error } = await supabase
      .from("cycles")
      .select(
        "id, cycle_number, sterilizer, status, cycle_state, expected_finish_at, created_at"
      )
      .eq("status", "Pending")
      .order("expected_finish_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .returns<RunningCycle[]>();

    if (error) {
      console.error("Assistant cycle operations lookup error:", error);
      return [];
    }

    return data || [];
  }

  async function loadWorkQueueData(): Promise<WorkQueueData> {
    const queueNow = new Date();
    const nowIso = queueNow.toISOString();
    const thirtyDaysFromNow = new Date(queueNow);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [
      readyCyclesResult,
      investigationsResult,
      expiredPacksResult,
      expiringPacksResult,
      runningCyclesResult,
    ] = await Promise.all([
      supabase
        .from("cycles")
        .select("id, cycle_number, sterilizer, expected_finish_at, created_at")
        .eq("status", "Pending")
        .lte("expected_finish_at", nowIso)
        .order("expected_finish_at", { ascending: true, nullsFirst: false })
        .returns<WorkQueueCycle[]>(),
      supabase
        .from("cycles")
        .select("id, cycle_number, investigation_status, created_at")
        .eq("investigation_status", "Open")
        .order("created_at", { ascending: true })
        .returns<WorkQueueInvestigation[]>(),
      supabase
        .from("packs")
        .select("id, pack_number, expires_at, status")
        .eq("status", "Expired")
        .order("expires_at", { ascending: true, nullsFirst: false })
        .returns<WorkQueuePack[]>(),
      supabase
        .from("packs")
        .select("id, pack_number, expires_at, status")
        .gte("expires_at", nowIso)
        .lte("expires_at", thirtyDaysFromNow.toISOString())
        .neq("status", "Used")
        .order("expires_at", { ascending: true, nullsFirst: false })
        .returns<WorkQueuePack[]>(),
      supabase
        .from("cycles")
        .select("id, cycle_number, sterilizer, expected_finish_at, created_at")
        .eq("status", "Pending")
        .gt("expected_finish_at", nowIso)
        .order("expected_finish_at", { ascending: true, nullsFirst: false })
        .returns<WorkQueueCycle[]>(),
    ]);

    const queryErrors = [
      readyCyclesResult.error,
      investigationsResult.error,
      expiredPacksResult.error,
      expiringPacksResult.error,
      runningCyclesResult.error,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
      throw queryErrors[0];
    }

    const readyCycles = readyCyclesResult.data || [];
    const openInvestigations = investigationsResult.data || [];
    const expiredPacks = expiredPacksResult.data || [];
    const expiringPacks = expiringPacksResult.data || [];
    const runningCycles = runningCyclesResult.data || [];

    return {
      counts: {
        readyCycles: readyCycles.length,
        openInvestigations: openInvestigations.length,
        expiredPacks: expiredPacks.length,
        expiringPacks: expiringPacks.length,
      },
      nextAction: getNextRecommendedAction({
        readyCycles,
        openInvestigations,
        expiredPacks,
        expiringPacks,
        runningCycles,
        now: queueNow,
      }),
    };
  }
  const cycleStateCounts = getAssistantCycleStateCounts(activeCycles, now);
  const pendingReviews =
    cycleStateCounts.readyReview + cycleStateCounts.overdueReview;
  const activeCycleStats = getActiveCycleStats(activeCycles, now);

  return (
    <main
      className="grid h-full min-h-0 gap-2 overflow-hidden bg-slate-100 p-2 text-slate-950 sm:p-3"
      style={{
        gridTemplateAreas: `"header" "kpis" "middle" "activity" "actions" "nav"`,
        gridTemplateRows:
          "clamp(3.25rem,5.8dvh,3.85rem) clamp(3.25rem,5.8dvh,3.85rem) minmax(0,0.95fr) minmax(0,1.05fr) clamp(5.1rem,10dvh,6rem) clamp(3.25rem,6.5dvh,4rem)",
      }}
    >
      <header
        className="flex min-h-0 flex-col justify-center gap-1 rounded-xl bg-slate-950 px-3 py-1.5 text-white shadow-sm md:flex-row md:items-center md:justify-between"
        style={{ gridArea: "header" }}
      >
        <div>
          <h1 className="text-base font-bold tracking-normal">
            SteriSphere Workstation
          </h1>
          <p className="mt-0.5 text-[0.7rem] font-semibold text-slate-300">
            Daily sterilization and traceability actions
          </p>
        </div>

        <div className="rounded-xl bg-white/10 px-2.5 py-1 text-xs">
          <p className="font-medium">{currentUser.email || "Signed in"}</p>
          <p className="mt-0.5 capitalize text-slate-300">
            {currentUser.role || "Workstation"}
          </p>
        </div>
      </header>

      <section
        className="grid h-full min-h-0 grid-cols-2 gap-2 md:grid-cols-4"
        style={{ gridArea: "kpis" }}
      >
        <KpiCard
          title="Running Cycles"
          value={cycleStateCounts.running}
          loading={loading}
          tone={cycleStateCounts.running > 0 ? "warning" : "neutral"}
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
            cycleStateCounts.overdueReview > 0
              ? "critical"
              : pendingReviews > 0
                ? "warning"
                : "neutral"
          }
        />
      </section>

      <div
        className="grid h-full min-h-0 gap-2 overflow-hidden md:grid-cols-[minmax(0,2fr)_minmax(320px,0.88fr)] xl:grid-cols-[minmax(0,2.15fr)_minmax(360px,0.9fr)]"
        style={{ gridArea: "middle" }}
      >
        <SmartWorkQueue workQueue={workQueue} loading={loading} />

        <OperationalCenter
          status={status}
          activeCycles={activeCycles}
          now={now}
          loading={loading}
        />
      </div>

      <div className="min-h-0 overflow-hidden" style={{ gridArea: "activity" }}>
        <RecentActivityCard activity={recentActivity} loading={loading} />
      </div>

      <div
        className="grid h-full min-h-0 grid-cols-2 gap-2 md:grid-cols-4"
        style={{ gridArea: "actions" }}
      >
          {primaryActions.map((action) => (
            <ActionTile key={action.title} {...action} primary />
          ))}
          {workflowActions.map((action) => (
            <ActionTile
              key={action.title}
              {...action}
              badge={
                action.href === "/assistant/cycles" &&
                activeCycleStats.count > 0
                  ? String(activeCycleStats.count)
                  : undefined
              }
              tone={
                action.href === "/assistant/cycles"
                  ? activeCycleStats.tileTone
                  : "default"
              }
            />
          ))}
      </div>

      <BottomNavigation />
    </main>
  );
}

function SmartWorkQueue({
  workQueue,
  loading,
}: {
  workQueue: WorkQueueData;
  loading: boolean;
}) {
  const hasActions = Boolean(workQueue.nextAction);

  return (
    <section className="grid h-full min-h-0 gap-2 md:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)] md:overflow-hidden">
      {loading ? (
        <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <p className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
            Next Recommended Action
          </p>
          <h2 className="mt-0.5 text-lg font-black leading-tight text-slate-900">
            Checking work queue...
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            Prioritizing cycles, investigations, and inventory.
          </p>
        </div>
      ) : hasActions && workQueue.nextAction ? (
        <NextActionCard action={workQueue.nextAction} />
      ) : (
        <AllClearCard />
      )}

      <AttentionQueue counts={workQueue.counts} loading={loading} />
    </section>
  );
}

function NextActionCard({ action }: { action: NextRecommendedAction }) {
  const Icon = action.icon;
  const toneClasses = {
    red: "border-red-200 bg-red-50 text-red-950",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-950",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    green: "border-green-200 bg-green-50 text-green-950",
  }[action.tone];
  const buttonClasses = {
    red: "bg-red-600 text-white",
    yellow: "bg-yellow-500 text-yellow-950",
    blue: "bg-slate-950 text-white",
    green: "bg-green-700 text-white",
  }[action.tone];

  return (
    <article className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border p-2 shadow-sm ${toneClasses}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-wide opacity-70">
            Next Recommended Action
          </p>
          <h2 className="mt-0.5 text-lg font-black leading-tight">
            {action.title}
          </h2>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/75 shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
      </div>

      <p className="mt-1 text-[0.7rem] font-black uppercase tracking-wide opacity-70">
        {action.label}
      </p>
      <p className="mt-0.5 break-words text-lg font-black leading-tight">
        {action.identifier}
      </p>
      <p className="mt-0.5 line-clamp-1 text-xs font-bold opacity-85">{action.detail}</p>

      <Link
        href={action.href}
        className={`mt-auto inline-flex min-h-8 w-fit items-center justify-center rounded-xl px-3 py-1 text-xs font-black shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner ${buttonClasses}`}
      >
        {action.buttonLabel}
      </Link>
    </article>
  );
}

function AllClearCard() {
  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-green-200 bg-green-50 p-2 text-green-950 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-wide text-green-700">
            Next Recommended Action
          </p>
          <h2 className="mt-0.5 text-lg font-black leading-tight">All Clear</h2>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/75 text-green-700 shadow-sm">
          <CheckCircle2 className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-1 space-y-0 text-xs font-bold text-green-900">
        <p>No cycles require review.</p>
        <p>No investigations are open.</p>
        <p>No expired packs detected.</p>
      </div>

      <Link
        href="/assistant/cycle/start"
        className="mt-auto inline-flex min-h-8 w-fit items-center justify-center rounded-xl bg-green-700 px-3 py-1 text-xs font-black text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
      >
        Start New Cycle
      </Link>
    </article>
  );
}

function AttentionQueue({
  counts,
  loading,
}: {
  counts: QueueCounts;
  loading: boolean;
}) {
  const rows = [
    {
      label: "Cycles Ready For Review",
      count: counts.readyCycles,
      href: "/assistant/cycle/review",
    },
    {
      label: "Open Investigations",
      count: counts.openInvestigations,
      href: "/assistant/investigations",
    },
    {
      label: "Expired Packs",
      count: counts.expiredPacks,
      href: "/assistant/inventory",
    },
    {
      label: "Packs Expiring Soon",
      count: counts.expiringPacks,
      href: "/assistant/inventory",
    },
  ];

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <h2 className="text-base font-black leading-tight text-slate-950">Attention Queue</h2>
      <div className="mt-1.5 grid min-h-0 flex-1 grid-rows-4 gap-1">
        {rows.map((row) => (
          <Link
            key={row.label}
            href={row.href}
            className="flex min-h-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-slate-800 transition-all hover:bg-white hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner"
          >
            <span className="truncate text-xs font-black">
              {loading ? "-" : row.count} {row.label}
            </span>
            <span className="text-base font-black text-slate-500">{">"}</span>
          </Link>
        ))}
      </div>
    </article>
  );
}
function RecentActivityCard({
  activity,
  loading,
}: {
  activity: AssistantActivityItem[];
  loading: boolean;
}) {
  const rows = activity.slice(0, 8);

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="mb-1 flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-black leading-tight text-slate-950">
              Recent Activity
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              Today&apos;s latest events
            </p>
          </div>
        </div>
        <Link
          href="/assistant/activity"
          className="inline-flex min-h-8 items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-black text-blue-800 transition-all hover:bg-blue-50 active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          View All Activity
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-min gap-0 overflow-hidden rounded-xl border border-slate-200">
        {loading ? (
          <p className="bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">
            Loading activity...
          </p>
        ) : rows.length === 0 ? (
          <p className="bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">
            No activity recorded today.
          </p>
        ) : (
          rows.map((item) => (
            <div
              key={item.id}
              className="grid min-h-[1.5rem] grid-cols-[4.75rem_minmax(9rem,1fr)_minmax(8rem,0.75fr)_auto] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-0.5 last:border-b-0"
            >
              <span className="text-xs font-black text-slate-500">{item.time}</span>
              <span className="truncate text-xs font-bold text-slate-800">
                {item.title}
              </span>
              <span className="truncate text-xs font-bold text-slate-500">
                {item.entityLabel}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-black uppercase ${getActivityVariantClass(
                  item.variant
                )}`}
              >
                {formatActivityVariant(item.variant)}
              </span>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function formatActivityVariant(variant: AssistantActivityItem["variant"]) {
  return {
    success: "Passed",
    warning: "Started",
    critical: "Open",
    neutral: "Recorded",
  }[variant];
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
    <div className={`h-full min-h-0 rounded-xl border p-2 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-[0.7rem] font-bold uppercase tracking-wide opacity-75">
        {title}
      </p>
      <p className="mt-0.5 text-xl font-black leading-none">{loading ? "-" : value}</p>
    </div>
  );
}

function ActionTile({
  title,
  href,
  icon: Icon,
  primary = false,
  badge,
  tone = "default",
}: {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  primary?: boolean;
  badge?: string;
  tone?: "default" | "warning" | "critical";
}) {
  const toneClasses = {
    default: "border-slate-200 bg-white text-slate-800",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-900",
    critical: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <Link
      href={href}
      className={`flex h-full min-h-0 flex-col justify-between rounded-xl border p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner ${
        primary
          ? "border-slate-950 bg-slate-950 text-white"
          : `${toneClasses[tone]}`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-xl ${
            primary ? "bg-white text-slate-950" : "bg-white/70 text-slate-700"
          }`}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        {badge && (
          <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-black text-white">
            {badge}
          </span>
        )}
      </div>
      <span
        className={
          primary
            ? "text-[clamp(0.95rem,1.4vw,1.1rem)] font-bold"
            : "text-[clamp(0.9rem,1.3vw,1rem)] font-bold"
        }
      >
        {title}
      </span>
    </Link>
  );
}

function OperationalCenter({
  status,
  activeCycles,
  now,
  loading,
}: {
  status: WorkstationStatus;
  activeCycles: RunningCycle[];
  now: Date;
  loading: boolean;
}) {
  const hasFailedReviews = status.failedCycles > 0;
  const overdueCycles = activeCycles.filter(
    (cycle) => getCycleOperationalState(cycle.expected_finish_at, now) === "overdue"
  );
  const readyCycles = activeCycles.filter(
    (cycle) => getCycleOperationalState(cycle.expected_finish_at, now) === "ready"
  );
  const runningCycles = activeCycles.filter(
    (cycle) => getCycleOperationalState(cycle.expected_finish_at, now) === "running"
  );
  const focusCycle =
    overdueCycles[0] || readyCycles[0] || runningCycles[0] || null;
  const hasPriority = hasFailedReviews || Boolean(focusCycle);
  const isIdle = !loading && !hasPriority;
  const timing = focusCycle
    ? getCycleTiming(focusCycle.expected_finish_at, now)
    : null;
  const openCycleHref =
    runningCycles.length === 1
      ? `/assistant/cycles/${runningCycles[0].id}`
      : "/assistant/cycles";
  const reviewCycleHref =
    activeCycles.length === 1 && focusCycle
      ? `/assistant/cycle/review?cycleId=${focusCycle.id}`
      : "/assistant/cycle/review";

  return (
    <aside
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border p-2 shadow-sm ${
        overdueCycles.length > 0
          ? "border-red-200 bg-red-50 text-red-900"
          : readyCycles.length > 0
            ? "border-yellow-200 bg-yellow-50 text-yellow-900"
            : runningCycles.length > 0
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : hasFailedReviews
                ? "border-red-200 bg-red-50 text-red-900"
                : hasPriority
          ? "border-yellow-200 bg-yellow-50 text-yellow-900"
          : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold leading-tight">Operational Center</h2>
          <p className="mt-0.5 text-[0.7rem] font-semibold opacity-75">
            Live cycle status and review guidance
          </p>
        </div>
        {hasPriority ? (
          <ShieldAlert className="h-5 w-5 shrink-0" />
        ) : (
          <Timer className="h-5 w-5 shrink-0 opacity-70" />
        )}
      </div>

      {loading ? (
        <section className="mt-1.5 flex min-h-0 flex-1 flex-col rounded-xl border border-white/60 bg-white/60 p-2">
          <p className="text-base font-semibold">Checking command center...</p>
          <p className="mt-1 text-xs opacity-75">
            Loading cycle status and pending reviews.
          </p>
        </section>
      ) : overdueCycles.length > 0 && focusCycle && timing ? (
        <section className="mt-1.5 flex min-h-0 flex-1 flex-col rounded-xl border border-red-200 bg-white/75 p-2">
          <span className="w-fit rounded-full bg-red-100 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-red-700">
            Review Required
          </span>
          <h3 className="mt-1 text-sm font-bold">Overdue Review</h3>
          <p className="mt-0.5 line-clamp-2 text-xs font-semibold">
            {overdueCycles.length}{" "}
            {overdueCycles.length === 1 ? "cycle is" : "cycles are"} past the
            review threshold. Review before releasing packs.
          </p>
          <Link
            href={reviewCycleHref}
            className="mt-auto inline-flex min-h-8 w-fit items-center justify-center rounded-xl bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
          >
            Review Cycles
          </Link>
        </section>
      ) : readyCycles.length > 0 && focusCycle && timing ? (
        <section className="mt-1.5 flex min-h-0 flex-1 flex-col rounded-xl border border-yellow-200 bg-white/75 p-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="w-fit rounded-full bg-yellow-100 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-yellow-800">
                Ready for Review
              </span>
              <h3 className="mt-1 text-sm font-bold">
                {focusCycle.cycle_number}
              </h3>
              <p className="mt-0.5 text-xs font-semibold opacity-75">
                {focusCycle.sterilizer}
              </p>
            </div>
            <span
              className={`rounded-xl border px-2 py-0.5 text-xs font-bold ${timing.badgeClass}`}
            >
              Ready
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs font-semibold">
            {readyCycles.length}{" "}
            {readyCycles.length === 1 ? "cycle has" : "cycles have"} reached
            expected finish and can be reviewed.
          </p>
          <Link
            href={reviewCycleHref}
            className="mt-auto inline-flex min-h-8 w-fit items-center justify-center rounded-xl bg-yellow-500 px-3 py-1 text-xs font-bold text-yellow-950 shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
          >
            Review Cycles
          </Link>
        </section>
      ) : runningCycles.length > 0 && focusCycle && timing ? (
        <section className="mt-1.5 flex min-h-0 flex-1 flex-col rounded-xl border border-blue-200 bg-white/75 p-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="w-fit rounded-full bg-blue-100 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-blue-700">
                Running Cycle
              </span>
              <h3 className="mt-1 text-sm font-bold">
                {focusCycle.cycle_number}
              </h3>
              <p className="mt-0.5 text-xs font-semibold opacity-75">
                {focusCycle.sterilizer}
              </p>
            </div>
            <span
              className={`rounded-xl border px-2 py-0.5 text-xs font-bold ${timing.badgeClass}`}
            >
              {timing.label}
            </span>
          </div>

          <dl className="mt-1 grid grid-cols-2 gap-1 text-xs">
            <div>
              <dt className="font-semibold opacity-70">Started</dt>
              <dd className="mt-0.5 font-bold">
                {formatCompactDateTime(focusCycle.created_at)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold opacity-70">Expected Finish</dt>
              <dd className="mt-0.5 font-bold">
                {formatCompactDateTime(focusCycle.expected_finish_at)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold opacity-70">Time Remaining</dt>
              <dd className={`mt-0.5 font-bold ${timing.textClass}`}>
                {timing.description}
              </dd>
            </div>
            <div>
              <dt className="font-semibold opacity-70">Status</dt>
              <dd className="mt-0.5 font-bold">Running</dd>
            </div>
          </dl>

          <Link
            href={openCycleHref}
            className="mt-auto inline-flex min-h-8 w-fit items-center justify-center rounded-xl bg-slate-950 px-3 py-1 text-xs font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
          >
            {runningCycles.length > 1 ? "Open Cycles" : "Open Cycle"}
          </Link>
        </section>
      ) : hasFailedReviews ? (
        <section className="mt-1.5 flex min-h-0 flex-1 flex-col rounded-xl border border-red-200 bg-white/75 p-2">
          <span className="w-fit rounded-full bg-red-100 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-red-700">
            Critical status
          </span>
          <h3 className="mt-1 text-sm font-bold">
            Failed cycle requiring review
          </h3>
          <p className="mt-0.5 line-clamp-2 text-xs font-semibold">
            {status.failedCycles} failed{" "}
            {status.failedCycles === 1 ? "cycle is" : "cycles are"} awaiting
            investigation review before related work can move forward.
          </p>
          <Link
            href="/assistant/investigations"
            className="mt-auto inline-flex min-h-8 w-fit items-center justify-center rounded-xl bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
          >
            Investigation Center
          </Link>
        </section>
      ) : (
        <section className="mt-1.5 flex min-h-0 flex-1 flex-col rounded-xl border border-blue-200 bg-white/75 p-2">
          <span className="w-fit rounded-full bg-blue-100 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-blue-700">
            Normal state
          </span>
          <h3 className="mt-1 text-sm font-bold">No Active Cycles</h3>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
            <p>
              <span className="block font-semibold opacity-70">
                Available Packs
              </span>
              <span className="text-base font-bold">{status.availablePacks}</span>
            </p>
            <p>
              <span className="block font-semibold opacity-70">
                Expired Packs
              </span>
              <span className="text-base font-bold">{status.expiredPacks}</span>
            </p>
          </div>
          <p className="mt-1.5 text-xs font-semibold">
            All systems operating normally.
          </p>
        </section>
      )}

      {isIdle && (
        <>
          <section className="mt-1.5 rounded-xl border border-white/60 bg-white/60 p-1.5 text-xs">
            <h3 className="font-bold">Steri Assistant</h3>
            <p className="mt-1 line-clamp-2">
              Workstation ready for the next sterilization or traceability task.
            </p>
          </section>

          <section className="mt-1.5 grid grid-cols-2 gap-1.5">
            {secondaryActions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.title}
                  href={action.href}
                  className="flex min-h-[3.25rem] flex-col justify-between rounded-xl border border-white/70 bg-white/70 p-2 text-xs font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
                >
                  <Icon className="h-4 w-4 opacity-70" />
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

function getNextRecommendedAction({
  readyCycles,
  openInvestigations,
  expiredPacks,
  expiringPacks,
  runningCycles,
  now,
}: {
  readyCycles: WorkQueueCycle[];
  openInvestigations: WorkQueueInvestigation[];
  expiredPacks: WorkQueuePack[];
  expiringPacks: WorkQueuePack[];
  runningCycles: WorkQueueCycle[];
  now: Date;
}): NextRecommendedAction | null {
  const cycleForReview = readyCycles[0];
  if (cycleForReview) {
    return {
      title: "Review Cycle",
      label: "Cycle Review",
      identifier: cycleForReview.cycle_number,
      detail: formatOverdueDetail(cycleForReview.expected_finish_at, now),
      href: `/assistant/cycle/review?cycleId=${cycleForReview.id}`,
      buttonLabel: "Review Now",
      tone: "red",
      icon: ClipboardCheck,
    };
  }

  const investigation = openInvestigations[0];
  if (investigation) {
    return {
      title: "Open Investigation",
      label: "Cycle",
      identifier: investigation.cycle_number,
      detail: "Investigation remains open.",
      href: "/assistant/investigations",
      buttonLabel: "Open Investigation",
      tone: "red",
      icon: FileSearch,
    };
  }

  const expiredPack = expiredPacks[0];
  if (expiredPack) {
    return {
      title: "Expired Pack",
      label: "Inventory Review",
      identifier: expiredPack.pack_number,
      detail: formatExpiredDetail(expiredPack.expires_at, now),
      href: "/assistant/inventory",
      buttonLabel: "Review Inventory",
      tone: "red",
      icon: PackageX,
    };
  }

  const expiringPack = expiringPacks[0];
  if (expiringPack) {
    return {
      title: "Pack Expiring Soon",
      label: "Inventory",
      identifier: expiringPack.pack_number,
      detail: formatExpiringDetail(expiringPack.expires_at, now),
      href: `/assistant/inventory?packId=${expiringPack.id}`,
      buttonLabel: "View Pack",
      tone: "yellow",
      icon: Package,
    };
  }

  const runningCycle = runningCycles[0];
  if (runningCycle) {
    return {
      title: "Running Cycle",
      label: "Cycle In Progress",
      identifier: runningCycle.cycle_number,
      detail: formatRemainingDetail(runningCycle.expected_finish_at, now),
      href: `/assistant/cycles/${runningCycle.id}`,
      buttonLabel: "Open Cycle",
      tone: "blue",
      icon: Timer,
    };
  }

  return null;
}
function getActiveCycleStats(activeCycles: RunningCycle[], now: Date) {
  const states = activeCycles.map((cycle) =>
    getCycleOperationalState(cycle.expected_finish_at, now)
  );
  const hasOverdue = states.includes("overdue");
  const hasReady = states.includes("ready");

  return {
    count: activeCycles.length,
    tileTone: hasOverdue ? "critical" : hasReady ? "warning" : "default",
  } as const;
}

function getAssistantCycleStateCounts(activeCycles: RunningCycle[], now: Date) {
  return activeCycles.reduce(
    (counts, cycle) => {
      const state = getCycleOperationalState(cycle.expected_finish_at, now);

      if (state === "running") {
        counts.running += 1;
      } else if (state === "ready") {
        counts.readyReview += 1;
      } else {
        counts.overdueReview += 1;
      }

      return counts;
    },
    { running: 0, readyReview: 0, overdueReview: 0 }
  );
}

function getCycleOperationalState(expectedFinishAt: string | null, now: Date) {
  if (!expectedFinishAt) {
    return "running";
  }

  const finishTime = new Date(expectedFinishAt).getTime();
  const remainingMs = finishTime - now.getTime();

  if (remainingMs > 0) {
    return "running";
  }

  return Math.abs(remainingMs) > REVIEW_OVERDUE_THRESHOLD_MS
    ? "overdue"
    : "ready";
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

function formatOverdueDetail(value: string | null, now: Date) {
  if (!value) {
    return "Ready for review.";
  }

  const elapsedMinutes = Math.max(
    1,
    Math.ceil((now.getTime() - new Date(value).getTime()) / 60000)
  );

  return `Review overdue by ${formatCycleDuration(elapsedMinutes)}`;
}

function formatExpiredDetail(value: string | null, now: Date) {
  if (!value) {
    return "Expiration date unavailable.";
  }

  const elapsedDays = Math.max(
    1,
    Math.ceil((now.getTime() - new Date(value).getTime()) / 86400000)
  );

  return `Expired ${elapsedDays} ${elapsedDays === 1 ? "day" : "days"} ago`;
}

function formatExpiringDetail(value: string | null, now: Date) {
  if (!value) {
    return "Expiration date unavailable.";
  }

  const remainingDays = Math.max(
    1,
    Math.ceil((new Date(value).getTime() - now.getTime()) / 86400000)
  );

  return `Expires in ${remainingDays} ${remainingDays === 1 ? "day" : "days"}`;
}

function formatRemainingDetail(value: string | null, now: Date) {
  if (!value) {
    return "No finish time available.";
  }

  const remainingMinutes = Math.max(
    1,
    Math.ceil((new Date(value).getTime() - now.getTime()) / 60000)
  );

  return `${formatCycleDuration(remainingMinutes)} remaining`;
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
    { label: "Inventory", href: "/assistant/inventory", icon: Package },
  ];

  return (
    <nav
      className="min-h-0 rounded-xl border border-slate-200 bg-white px-3 py-0.5 shadow-lg"
      style={{ gridArea: "nav" }}
    >
      <div className="mx-auto grid h-full max-w-5xl grid-cols-5 gap-2">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex h-full min-h-0 flex-col items-center justify-center rounded-xl text-xs font-medium text-slate-700 transition-all hover:bg-slate-100 active:scale-[0.98] active:brightness-95 active:shadow-inner"
            >
              <Icon className="mb-1 h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          className="flex h-full min-h-0 flex-col items-center justify-center rounded-xl text-xs font-medium text-slate-700 transition-all hover:bg-slate-100 active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          <MoreHorizontal className="mb-1 h-5 w-5" />
          More
        </button>
      </div>
    </nav>
  );
}
