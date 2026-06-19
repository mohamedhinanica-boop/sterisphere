"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  PlayCircle,
  Timer,
} from "lucide-react";
import toast from "react-hot-toast";
import type { Cycle } from "@/lib/modules/cycles";
import { supabase } from "@/lib/supabase";

type CycleTiming = {
  state: "running" | "ready" | "overdue";
  remainingMs: number;
  elapsedMs: number;
  remainingLabel: string;
  elapsedLabel: string;
  stateLabel: string;
  cardClass: string;
  badgeClass: string;
  textClass: string;
};

type CycleFilter = "all" | "running" | "ready" | "overdue";

const CYCLES_PER_PAGE = 3;
const REVIEW_OVERDUE_THRESHOLD_MS = 5 * 60 * 1000;

export default function AssistantRunningCyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [filter, setFilter] = useState<CycleFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadActiveCycles();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const cycleTimings = useMemo(() => {
    return cycles.map((cycle) => ({
      cycle,
      timing: getCycleTiming(cycle, now),
    }));
  }, [cycles, now]);

  const summary = useMemo(() => {
    const running = cycleTimings.filter(
      ({ timing }) => timing.state === "running"
    ).length;
    const ready = cycleTimings.filter(
      ({ timing }) => timing.state === "ready"
    ).length;
    const overdue = cycleTimings.filter(
      ({ timing }) => timing.state === "overdue"
    ).length;
    const positiveRemaining = cycleTimings
      .filter(({ timing }) => timing.state === "running")
      .map(({ timing }) => timing.remainingMs)
      .filter((remainingMs) => remainingMs > 0);
    const averageRemainingMs =
      positiveRemaining.length > 0
        ? positiveRemaining.reduce((total, value) => total + value, 0) /
          positiveRemaining.length
        : 0;

    return {
      running,
      ready,
      overdue,
      averageRemaining:
        averageRemainingMs > 0 ? formatDurationFromMs(averageRemainingMs) : "N/A",
    };
  }, [cycleTimings]);

  const filteredCycleTimings = useMemo(() => {
    if (filter === "all") {
      return cycleTimings;
    }

    return cycleTimings.filter(({ timing }) => timing.state === filter);
  }, [cycleTimings, filter]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredCycleTimings.length / CYCLES_PER_PAGE)
  );

  const pagedCycleTimings = useMemo(() => {
    const startIndex = (currentPage - 1) * CYCLES_PER_PAGE;

    return filteredCycleTimings.slice(
      startIndex,
      startIndex + CYCLES_PER_PAGE
    );
  }, [currentPage, filteredCycleTimings]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  function handleFilterChange(nextFilter: CycleFilter) {
    setFilter(nextFilter);
    setCurrentPage(1);
  }

  async function loadActiveCycles() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("cycles")
        .select(
          "id, cycle_number, sterilizer, operator, load_contents, status, cycle_state, expected_pack_count, duration_minutes, expected_finish_at, created_at"
        )
        .eq("status", "Pending")
        .order("expected_finish_at", {
          ascending: true,
          nullsFirst: false,
        })
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setCycles(data || []);
    } catch (error) {
      toast.error("Error loading cycle operations.");
      console.error("Assistant cycle operations load error:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100svh] flex-col bg-slate-100 p-3 text-slate-950 lg:h-[100svh] lg:overflow-hidden">
      <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-300">
            SteriSphere Workstation
          </p>
          <h1 className="text-2xl font-bold tracking-normal">
            Cycle Operations Center
          </h1>
        </div>

        <Link
          href="/assistant"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/15 active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          <ArrowLeft className="h-5 w-5" />
          Workstation
        </Link>
      </header>

      <section className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard title="Running" value={String(summary.running)} tone="green" />
        <SummaryCard
          title="Ready for Review"
          value={String(summary.ready)}
          tone="yellow"
        />
        <SummaryCard
          title="Overdue Review"
          value={String(summary.overdue)}
          tone="red"
        />
        <SummaryCard
          title="Average Remaining"
          value={summary.averageRemaining}
        />
      </section>

      <section className="min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-hidden">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-lg font-bold text-slate-500">
            Loading cycle operations...
          </div>
        ) : cycles.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <FilterChips activeFilter={filter} onChange={handleFilterChange} />

            {filteredCycleTimings.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-lg font-bold text-slate-500">
                No cycles in this category.
              </div>
            ) : (
              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
                <CyclePaginationControls
                  currentPage={currentPage}
                  pageCount={pageCount}
                  onPrevious={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  onNext={() =>
                    setCurrentPage((page) => Math.min(pageCount, page + 1))
                  }
                />

                <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pb-2 pr-1 md:grid-cols-2 lg:grid-cols-3">
                  {pagedCycleTimings.map(({ cycle, timing }) => (
                    <CycleMonitorCard
                      key={cycle.id}
                      cycle={cycle}
                      timing={timing}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function FilterChips({
  activeFilter,
  onChange,
}: {
  activeFilter: CycleFilter;
  onChange: (filter: CycleFilter) => void;
}) {
  const filters: Array<{ label: string; value: CycleFilter }> = [
    { label: "All", value: "all" },
    { label: "Running", value: "running" },
    { label: "Ready Review", value: "ready" },
    { label: "Overdue", value: "overdue" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <button
          key={filter.value}
          type="button"
          onClick={() => onChange(filter.value)}
          className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-bold transition-all hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner ${
            activeFilter === filter.value
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

function CyclePaginationControls({
  currentPage,
  pageCount,
  onPrevious,
  onNext,
}: {
  currentPage: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= pageCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <button
        type="button"
        onClick={onPrevious}
        disabled={isFirstPage}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:shadow-sm"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>

      <p className="text-sm font-black text-slate-700" aria-live="polite">
        {currentPage} / {pageCount}
      </p>

      <button
        type="button"
        onClick={onNext}
        disabled={isLastPage}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:shadow-sm"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone = "slate",
}: {
  title: string;
  value: string;
  tone?: "slate" | "green" | "yellow" | "red";
}) {
  const toneClasses = {
    slate: "border-slate-200 bg-white text-slate-900",
    green: "border-green-200 bg-green-50 text-green-800",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-900",
    red: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-sm font-bold uppercase tracking-wide opacity-70">
        {title}
      </p>
      <p className="mt-2 break-words text-3xl font-black">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
      <div>
        <PlayCircle className="mx-auto h-16 w-16 text-slate-500" />
        <h2 className="mt-4 text-4xl font-black">No Active Cycles</h2>
        <p className="mt-3 text-base font-semibold text-slate-500">
          Running cycles will appear here as soon as they are started.
        </p>
        <Link
          href="/assistant/cycle/start"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-base font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          Start New Cycle
        </Link>
      </div>
    </div>
  );
}

function CycleMonitorCard({
  cycle,
  timing,
}: {
  cycle: Cycle;
  timing: CycleTiming;
}) {
  return (
    <article
      className={`flex min-h-[24rem] flex-col rounded-2xl border p-4 shadow-sm ${timing.cardClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide opacity-70">
            {timing.stateLabel}
          </p>
          <h2 className="mt-1 break-words text-3xl font-black">
            {cycle.cycle_number}
          </h2>
        </div>
        <span
          className={`rounded-xl border px-3 py-2 text-sm font-black uppercase ${timing.badgeClass}`}
        >
          {timing.stateLabel}
        </span>
      </div>

      <p className={`mt-3 text-2xl font-black ${timing.textClass}`}>
        {timing.remainingLabel}
      </p>

      <div className="mt-3 grid gap-2 text-sm">
        <CycleDetail label="Sterilizer" value={cycle.sterilizer} />
        <CycleDetail label="Operator" value={cycle.operator || "N/A"} />
        <CycleDetail label="Load Contents" value={cycle.load_contents || "N/A"} />
        <div className="grid grid-cols-2 gap-2">
          <CycleDetail label="Start Time" value={formatDateTime(cycle.created_at)} />
          <CycleDetail
            label="Expected Finish"
            value={formatDateTime(cycle.expected_finish_at || null)}
          />
          <CycleDetail label="Elapsed Time" value={timing.elapsedLabel} />
          <CycleDetail label="Remaining Time" value={timing.remainingLabel} />
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-black/10 pt-3">
        <Link
          href={`/assistant/cycles/${cycle.id}`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/80 px-4 py-3 text-sm font-bold text-slate-800 shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          <Timer className="h-4 w-4" />
          View Details
        </Link>
        <Link
          href={`/assistant/cycle/review?cycleId=${cycle.id}`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          <ClipboardCheck className="h-4 w-4" />
          Review Cycle
        </Link>
      </div>
    </article>
  );
}

function CycleDetail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="block text-xs font-bold uppercase tracking-wide opacity-65">
        {label}
      </span>
      <span className="mt-1 line-clamp-2 block break-words text-base font-black">
        {value}
      </span>
    </p>
  );
}

function getCycleTiming(cycle: Cycle, now: Date): CycleTiming {
  const startedAt = new Date(cycle.created_at).getTime();
  const finishAt = cycle.expected_finish_at
    ? new Date(cycle.expected_finish_at).getTime()
    : null;
  const elapsedMs = Math.max(0, now.getTime() - startedAt);
  const remainingMs = finishAt ? finishAt - now.getTime() : 0;
  const passedMs = finishAt ? now.getTime() - finishAt : 0;
  const state =
    finishAt && remainingMs <= 0
      ? passedMs > REVIEW_OVERDUE_THRESHOLD_MS
        ? "overdue"
        : "ready"
      : "running";
  const remainingLabel =
    state === "overdue"
      ? `Review overdue by ${formatDurationFromMs(Math.abs(remainingMs))}`
      : state === "ready"
        ? "Ready for review"
        : finishAt
          ? `${formatDurationFromMs(remainingMs)} remaining`
          : "No finish time";

  const styles = {
    running: {
      cardClass: "border-blue-200 bg-blue-50 text-blue-950",
      badgeClass: "border-blue-300 bg-blue-100 text-blue-800",
      textClass: "text-blue-800",
      stateLabel: "Running",
    },
    ready: {
      cardClass: "border-yellow-200 bg-yellow-50 text-yellow-950",
      badgeClass: "border-yellow-300 bg-yellow-100 text-yellow-900",
      textClass: "text-yellow-900",
      stateLabel: "Ready for Review",
    },
    overdue: {
      cardClass: "border-red-200 bg-red-50 text-red-950",
      badgeClass: "border-red-300 bg-red-100 text-red-800",
      textClass: "text-red-800",
      stateLabel: "Overdue Review",
    },
  }[state];

  return {
    state,
    remainingMs,
    elapsedMs,
    remainingLabel,
    elapsedLabel: formatDurationFromMs(elapsedMs),
    ...styles,
  };
}

function formatDurationFromMs(valueMs: number) {
  const totalMinutes = Math.max(1, Math.ceil(valueMs / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "N/A";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
