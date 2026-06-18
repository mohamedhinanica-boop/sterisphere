"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ClipboardCheck,
  Home,
  PackageCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import type { Cycle } from "@/lib/modules/cycles";
import { supabase } from "@/lib/supabase";

export default function AssistantCycleDetailsPage() {
  const params = useParams<{ id: string }>();
  const cycleId = params.id;
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    loadCycle();
  }, [cycleId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  async function loadCycle() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("cycles")
        .select(
          "id, cycle_number, sterilizer, operator, load_contents, status, cycle_state, expected_pack_count, duration_minutes, expected_finish_at, created_at"
        )
        .eq("id", cycleId)
        .maybeSingle<Cycle>();

      if (error) {
        throw error;
      }

      setCycle(data || null);
    } catch (error) {
      toast.error("Error loading cycle details.");
      console.error("Assistant cycle details load error:", error);
    } finally {
      setLoading(false);
    }
  }

  const timing = cycle ? getCycleTiming(cycle, now) : null;

  return (
    <main className="flex min-h-[100svh] flex-col bg-slate-100 p-3 text-slate-950 lg:h-[100svh] lg:overflow-hidden">
      <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-300">
            Running Cycles Center
          </p>
          <h1 className="text-2xl font-bold tracking-normal">Cycle Details</h1>
        </div>

        <Link
          href="/assistant/cycles"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/15 active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          <ArrowLeft className="h-5 w-5" />
          Running Cycles
        </Link>
      </header>

      <section className="grid min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-hidden">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-lg font-bold text-slate-500">
            Loading cycle details...
          </div>
        ) : !cycle || !timing ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
            <div>
              <PackageCheck className="mx-auto h-14 w-14 text-slate-500" />
              <h2 className="mt-4 text-3xl font-black">Cycle Not Found</h2>
              <Link
                href="/assistant/cycles"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-base font-bold text-white transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                Back to Running Cycles
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.45fr)]">
            <section
              className={`rounded-2xl border p-5 ${timing.panelClass}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide opacity-70">
                    {cycle.status}
                  </p>
                  <h2 className="mt-1 break-words text-4xl font-black">
                    {cycle.cycle_number}
                  </h2>
                </div>
                <span
                  className={`rounded-xl border px-4 py-3 text-base font-black uppercase ${timing.badgeClass}`}
                >
                  {timing.badgeLabel}
                </span>
              </div>

              <p className={`mt-5 text-3xl font-black ${timing.textClass}`}>
                {timing.remainingLabel}
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <Detail title="Sterilizer" value={cycle.sterilizer} />
                <Detail title="Operator" value={cycle.operator || "N/A"} />
                <Detail title="Status" value={cycle.status} />
                <Detail title="Started" value={formatDateTime(cycle.created_at)} />
                <Detail
                  title="Expected Finish"
                  value={formatDateTime(cycle.expected_finish_at || null)}
                />
                <Detail title="Remaining" value={timing.remainingLabel} />
                <Detail
                  title="Duration"
                  value={
                    cycle.duration_minutes
                      ? formatDurationFromMinutes(cycle.duration_minutes)
                      : "N/A"
                  }
                />
                <Detail title="Elapsed" value={timing.elapsedLabel} />
              </div>

              <div className="mt-4 rounded-2xl border border-black/10 bg-white/70 p-4">
                <p className="text-sm font-bold uppercase tracking-wide opacity-65">
                  Load Contents
                </p>
                <p className="mt-2 break-words text-xl font-black">
                  {cycle.load_contents || "N/A"}
                </p>
              </div>
            </section>

            <aside className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Link
                href="/assistant/cycles"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-bold text-slate-800 shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                <ArrowLeft className="h-5 w-5" />
                Back to Running Cycles
              </Link>
              <Link
                href={`/assistant/cycle/review?cycleId=${cycle.id}`}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-base font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                <ClipboardCheck className="h-5 w-5" />
                Review Cycle
              </Link>
              <Link
                href="/assistant"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-bold text-slate-800 shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                <Home className="h-5 w-5" />
                Return to Workstation
              </Link>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function Detail({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/70 p-4">
      <p className="text-sm font-bold uppercase tracking-wide opacity-65">
        {title}
      </p>
      <p className="mt-2 break-words text-xl font-black">{value}</p>
    </div>
  );
}

function getCycleTiming(cycle: Cycle, now: Date) {
  const finishAt = cycle.expected_finish_at
    ? new Date(cycle.expected_finish_at).getTime()
    : null;
  const startedAt = new Date(cycle.created_at).getTime();
  const elapsedMs = Math.max(0, now.getTime() - startedAt);
  const remainingMs = finishAt ? finishAt - now.getTime() : 0;
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  const overdue = Boolean(finishAt && remainingMs <= 0);
  const dueSoon = !overdue && remainingMinutes <= 30;
  const remainingLabel = finishAt
    ? overdue
      ? `OVERDUE BY ${formatDurationFromMs(Math.abs(remainingMs)).toUpperCase()}`
      : `${formatDurationFromMs(remainingMs)} remaining`
    : "No finish time";

  if (overdue) {
    return {
      remainingLabel,
      elapsedLabel: formatDurationFromMs(elapsedMs),
      badgeLabel: "Overdue",
      panelClass: "border-red-200 bg-red-50 text-red-950",
      badgeClass: "border-red-300 bg-red-100 text-red-800",
      textClass: "text-red-800",
    };
  }

  if (dueSoon) {
    return {
      remainingLabel,
      elapsedLabel: formatDurationFromMs(elapsedMs),
      badgeLabel: "Due Soon",
      panelClass: "border-yellow-200 bg-yellow-50 text-yellow-950",
      badgeClass: "border-yellow-300 bg-yellow-100 text-yellow-900",
      textClass: "text-yellow-900",
    };
  }

  return {
    remainingLabel,
    elapsedLabel: formatDurationFromMs(elapsedMs),
    badgeLabel: "Running",
    panelClass: "border-green-200 bg-green-50 text-green-950",
    badgeClass: "border-green-300 bg-green-100 text-green-800",
    textClass: "text-green-800",
  };
}

function formatDurationFromMs(valueMs: number) {
  return formatDurationFromMinutes(Math.max(1, Math.ceil(valueMs / 60000)));
}

function formatDurationFromMinutes(totalMinutes: number) {
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
