"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Clock,
  PackageCheck,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import AssistantNotificationBanner, {
  type AssistantNotification,
} from "@/components/AssistantNotificationBanner";
import { formatCycleDuration, reviewCycle, type Cycle } from "@/lib/modules/cycles";
import { supabase } from "@/lib/supabase";

type ReviewResult = {
  status: "Passed" | "Failed";
  generatedPackCount: number;
  cycleNumber: string;
};

export default function GuidedCycleReviewPage() {
  const router = useRouter();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [now, setNow] = useState(new Date());
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [assistantNotification, setAssistantNotification] =
    useState<AssistantNotification | null>(null);
  const [returnCountdown, setReturnCountdown] = useState(8);

  const isComplete = Boolean(result);
  const dismissAssistantNotification = useCallback(() => {
    setAssistantNotification(null);
  }, []);

  useEffect(() => {
    fetchReviewCycles();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isComplete) {
      return;
    }

    setReturnCountdown(8);

    const timer = window.setInterval(() => {
      setReturnCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          router.push("/assistant");
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isComplete, router]);

  const reviewCycles = useMemo(() => {
    return cycles
      .filter((cycle) => shouldShowCycleForReview(cycle, now))
      .sort((a, b) => {
        const aTime = a.expected_finish_at
          ? new Date(a.expected_finish_at).getTime()
          : new Date(a.created_at).getTime();
        const bTime = b.expected_finish_at
          ? new Date(b.expected_finish_at).getTime()
          : new Date(b.created_at).getTime();

        return aTime - bTime;
      });
  }, [cycles, now]);

  async function fetchReviewCycles() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("cycles")
        .select(
          "id, cycle_number, sterilizer, operator, load_contents, status, cycle_state, expected_pack_count, duration_minutes, expected_finish_at, created_at"
        )
        .in("status", ["Pending", "Failed"])
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const nextCycles = data || [];
      const selectedCycleId = new URLSearchParams(window.location.search).get(
        "cycleId"
      );

      setCycles(nextCycles);

      if (selectedCycleId) {
        const nextSelectedCycle = nextCycles.find(
          (cycle) =>
            cycle.id === selectedCycleId && shouldShowCycleForReview(cycle, now)
        );

        if (nextSelectedCycle) {
          setSelectedCycle(nextSelectedCycle);
        }
      }
    } catch (error) {
      toast.error("Error loading cycles for review.");
      console.error("Assistant cycle review load error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function submitReview(status: "Passed" | "Failed") {
    if (!selectedCycle) {
      toast.error("Select a cycle before reviewing.");
      return;
    }

    setReviewing(true);

    try {
      const reviewResult = await reviewCycle(selectedCycle, status);
      const nextResult: ReviewResult = {
        status,
        generatedPackCount: reviewResult.generatedPackCount,
        cycleNumber: selectedCycle.cycle_number,
      };

      setResult(nextResult);
      setAssistantNotification({
        title: status === "Passed" ? "Cycle Passed" : "Cycle Failed",
        message:
          status === "Passed"
            ? `${reviewResult.generatedPackCount} pack${
                reviewResult.generatedPackCount === 1 ? "" : "s"
              } generated`
            : "Investigation required",
        detail: selectedCycle.cycle_number,
        variant: status === "Passed" ? "success" : "critical",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cycle review could not be saved.";

      toast.error(message);
      console.error("Assistant cycle review error:", error);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <main className="flex min-h-[100svh] flex-col bg-slate-100 p-3 text-slate-950 lg:h-[100svh] lg:overflow-hidden">
      <AssistantNotificationBanner
        notification={assistantNotification}
        onDismiss={dismissAssistantNotification}
      />

      <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-300">
            SteriSphere Workstation
          </p>
          <h1 className="text-2xl font-bold tracking-normal">
            Guided Cycle Review
          </h1>
        </div>

        {!isComplete && (
          <Link
            href="/assistant"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/15 active:scale-[0.98] active:brightness-95 active:shadow-inner"
          >
            <ArrowLeft className="h-5 w-5" />
            Cancel
          </Link>
        )}
      </header>

      <section className="grid min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-hidden">
        {result ? (
          <ReviewSuccess
            result={result}
            returnCountdown={returnCountdown}
          />
        ) : selectedCycle ? (
          <ReviewStep
            cycle={selectedCycle}
            now={now}
            reviewing={reviewing}
            onBack={() => setSelectedCycle(null)}
            onSubmit={submitReview}
          />
        ) : (
          <CycleSelection
            cycles={reviewCycles}
            loading={loading}
            now={now}
            onRefresh={fetchReviewCycles}
            onSelect={setSelectedCycle}
          />
        )}
      </section>
    </main>
  );
}

function CycleSelection({
  cycles,
  loading,
  now,
  onRefresh,
  onSelect,
}: {
  cycles: Cycle[];
  loading: boolean;
  now: Date;
  onRefresh: () => void;
  onSelect: (cycle: Cycle) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <ClipboardCheck className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-2xl font-bold">Cycles Ready for Review</h2>
            <p className="mt-1 text-sm text-slate-600">
              Select a cycle to mark Passed or Failed.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
          Loading cycles...
        </div>
      ) : cycles.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <div>
            <Clock className="mx-auto h-10 w-10 text-slate-500" />
            <h3 className="mt-3 text-2xl font-bold">No Cycles Need Review</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Running cycles will appear here when they are ready to close.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {cycles.map((cycle) => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              now={now}
              onSelect={() => onSelect(cycle)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CycleCard({
  cycle,
  now,
  onSelect,
}: {
  cycle: Cycle;
  now: Date;
  onSelect: () => void;
}) {
  const timing = getCycleTiming(cycle.expected_finish_at || null, now);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-[17rem] flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-950 hover:bg-white hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {cycle.status}
            </p>
            <h3 className="mt-1 break-words text-2xl font-black">
              {cycle.cycle_number}
            </h3>
          </div>
          <span
            className={`rounded-xl border px-3 py-2 text-sm font-bold ${timing.badgeClass}`}
          >
            {timing.label}
          </span>
        </div>

        <div className="mt-4 grid gap-2 text-sm">
          <Detail label="Sterilizer" value={cycle.sterilizer} />
          <Detail label="Load" value={cycle.load_contents || "N/A"} />
          <Detail label="Started" value={formatDateTime(cycle.created_at)} />
          <Detail
            label="Expected Finish"
            value={formatDateTime(cycle.expected_finish_at || null)}
          />
        </div>
      </div>

      <p className={`mt-4 text-base font-black ${timing.textClass}`}>
        {timing.description}
      </p>
    </button>
  );
}

function ReviewStep({
  cycle,
  now,
  reviewing,
  onBack,
  onSubmit,
}: {
  cycle: Cycle;
  now: Date;
  reviewing: boolean;
  onBack: () => void;
  onSubmit: (status: "Passed" | "Failed") => void;
}) {
  const timing = getCycleTiming(cycle.expected_finish_at || null, now);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <PackageCheck className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-2xl font-bold">Review Cycle</h2>
          <p className="mt-1 text-sm text-slate-600">
            Confirm the sterilization outcome.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Cycle
              </p>
              <h3 className="mt-1 break-words text-3xl font-black">
                {cycle.cycle_number}
              </h3>
            </div>
            <span
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${timing.badgeClass}`}
            >
              {timing.label}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ReviewCard title="Sterilizer" value={cycle.sterilizer} />
            <ReviewCard title="Status" value={cycle.status} />
            <ReviewCard title="Started" value={formatDateTime(cycle.created_at)} />
            <ReviewCard
              title="Expected Finish"
              value={formatDateTime(cycle.expected_finish_at || null)}
            />
            <ReviewCard
              title="Expected Packs"
              value={String(cycle.expected_pack_count || 0)}
            />
            <ReviewCard
              title="Duration"
              value={
                cycle.duration_minutes
                  ? formatCycleDuration(cycle.duration_minutes)
                  : "N/A"
              }
            />
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Load Contents
            </p>
            <p className="mt-3 break-words text-lg font-bold">
              {cycle.load_contents || "N/A"}
            </p>
          </div>
        </section>

        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-xl font-bold">Outcome</h3>
          <p className="mt-1 text-sm text-slate-600">
            Passed cycles generate packs. Failed cycles require investigation.
          </p>

          <div className="mt-4 grid flex-1 gap-3">
            <button
              type="button"
              onClick={() => onSubmit("Passed")}
              disabled={reviewing}
              className="flex min-h-32 flex-col justify-between rounded-2xl border border-green-200 bg-green-50 p-4 text-left text-green-800 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:opacity-50 disabled:active:scale-100"
            >
              <Check className="h-8 w-8" />
              <span className="text-2xl font-black">Mark Passed</span>
            </button>

            <button
              type="button"
              onClick={() => onSubmit("Failed")}
              disabled={reviewing}
              className="flex min-h-32 flex-col justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-left text-red-800 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:opacity-50 disabled:active:scale-100"
            >
              <XCircle className="h-8 w-8" />
              <span className="text-2xl font-black">Mark Failed</span>
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onBack}
              disabled={reviewing}
              className="min-h-12 rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:opacity-50 disabled:active:scale-100"
            >
              Back
            </button>
            {reviewing && (
              <p className="text-sm font-bold text-slate-500">Saving review...</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ReviewSuccess({
  result,
  returnCountdown,
}: {
  result: ReviewResult;
  returnCountdown: number;
}) {
  const isFailed = result.status === "Failed";

  return (
    <div className="flex min-h-0 flex-col items-center justify-center text-center">
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-3xl ${
          isFailed ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
        }`}
      >
        {isFailed ? (
          <ShieldAlert className="h-10 w-10" />
        ) : (
          <Check className="h-10 w-10" />
        )}
      </div>
      <h2 className="mt-5 text-4xl font-bold">
        {isFailed ? "Cycle Failed" : "Cycle Passed"}
      </h2>
      <p className="mt-3 text-lg text-slate-600">{result.cycleNumber}</p>
      <p
        className={`mt-2 text-base font-black ${
          isFailed ? "text-red-700" : "text-green-700"
        }`}
      >
        {isFailed
          ? "Investigation required"
          : `${result.generatedPackCount} pack${
              result.generatedPackCount === 1 ? "" : "s"
            } generated if applicable`}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-500">
        Returning to Workstation in {returnCountdown} seconds...
      </p>
      <Link
        href="/assistant"
        className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-base font-bold text-white transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
      >
        Return Now
      </Link>
    </div>
  );
}

function shouldShowCycleForReview(cycle: Cycle, now: Date) {
  const state = cycle.cycle_state || "Open";

  if (state !== "Open") {
    return false;
  }

  if (cycle.status === "Failed") {
    return true;
  }

  if (cycle.status !== "Pending") {
    return false;
  }

  if (!cycle.expected_finish_at) {
    return true;
  }

  return new Date(cycle.expected_finish_at).getTime() <= now.getTime();
}

function getCycleTiming(expectedFinishAt: string | null, now: Date) {
  if (!expectedFinishAt) {
    return {
      label: "No finish time",
      description: "Review ready",
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
      description: `${duration} remaining`,
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-1 line-clamp-2 block break-words text-base font-bold text-slate-950">
        {value}
      </span>
    </p>
  );
}

function ReviewCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-3 break-words text-xl font-bold text-slate-950">
        {value}
      </p>
    </div>
  );
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
