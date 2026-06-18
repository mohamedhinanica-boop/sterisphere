"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  FileText,
  Package,
  Printer,
  Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { createAuditLog } from "@/lib/audit";
import { supabase } from "@/lib/supabase";
import AssistantNotificationBanner, {
  type AssistantNotification,
} from "@/components/AssistantNotificationBanner";
import LabelPreviewModal from "@/components/packs/LabelPreviewModal";
import type { ExtendedPack, PatientTrace } from "@/components/packs/types";
import { generateLabelData } from "@/lib/modules/labels/generateLabelData";
import type { LabelData } from "@/lib/modules/labels/types";
import type { CycleContext } from "@/lib/modules/packs";
import {
  formatPackDate,
  formatPackDateTime,
  getPackEffectiveStatus,
  isPackExpiringSoon,
} from "@/lib/modules/packs";

type StatusFilter = "All" | "Available" | "Expiring Soon" | "Expired" | "Used";
type AssistantPack = ExtendedPack & {
  used_trace_created_at?: string | null;
};

const statusFilters: StatusFilter[] = [
  "All",
  "Available",
  "Expiring Soon",
  "Expired",
  "Used",
];

export default function AssistantInventoryPage() {
  const [packs, setPacks] = useState<AssistantPack[]>([]);
  const [selectedPack, setSelectedPack] = useState<AssistantPack | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<PatientTrace | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [selectedLabelPack, setSelectedLabelPack] =
    useState<AssistantPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [assistantNotification, setAssistantNotification] =
    useState<AssistantNotification | null>(null);

  const dismissAssistantNotification = useCallback(() => {
    setAssistantNotification(null);
  }, []);

  useEffect(() => {
    fetchPacks();
  }, []);

  useEffect(() => {
    if (!selectedPack) {
      setSelectedTrace(null);
      return;
    }

    loadTrace(selectedPack);
  }, [selectedPack]);

  const selectedLabelData: LabelData | null = selectedLabelPack
    ? generateLabelData({
        id: selectedLabelPack.id,
        pack_number: selectedLabelPack.pack_number,
        pack_type: selectedLabelPack.pack_type,
        expires_at: selectedLabelPack.expires_at,
      })
    : null;

  const todayKey = new Date().toDateString();
  const availablePacks = packs.filter(
    (pack) => getPackEffectiveStatus(pack) === "Available"
  );
  const expiringSoonPacks = packs.filter((pack) => isPackExpiringSoon(pack));
  const expiredPacks = packs.filter(
    (pack) => getPackEffectiveStatus(pack) === "Expired"
  );
  const usedTodayPacks = packs.filter(
    (pack) =>
      getPackEffectiveStatus(pack) === "Used" &&
      Boolean(pack.used_trace_created_at) &&
      new Date(pack.used_trace_created_at || "").toDateString() === todayKey
  );

  const filteredPacks = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return packs.filter((pack) => {
      const effectiveStatus = getPackEffectiveStatus(pack);
      const matchesSearch =
        !search ||
        pack.pack_number.toLowerCase().includes(search) ||
        pack.cycle_number.toLowerCase().includes(search) ||
        pack.pack_type.toLowerCase().includes(search) ||
        (pack.contents || "").toLowerCase().includes(search) ||
        effectiveStatus.toLowerCase().includes(search);

      const matchesStatus =
        statusFilter === "All" ||
        effectiveStatus === statusFilter ||
        (statusFilter === "Expiring Soon" && isPackExpiringSoon(pack));

      return matchesSearch && matchesStatus;
    });
  }, [packs, searchTerm, statusFilter]);

  async function fetchPacks() {
    setLoading(true);

    try {
      const { data: packsData, error: packsError } = await supabase
        .from("packs")
        .select(
          "id, pack_number, cycle_number, pack_type, contents, status, sterilized_at, expires_at, load_item_index, load_item_total, cycle_pack_total, cycle_load_summary, created_at, expired_reviewed, expired_reviewed_at, expired_reviewed_by"
        )
        .order("created_at", { ascending: false });

      if (packsError) {
        throw packsError;
      }

      const packRows = packsData || [];
      const cycleNumbers = Array.from(
        new Set(packRows.map((pack) => pack.cycle_number))
      );

      let cyclesByNumber: Record<string, CycleContext> = {};

      if (cycleNumbers.length > 0) {
        const { data: cyclesData, error: cyclesError } = await supabase
          .from("cycles")
          .select("cycle_number, sterilizer, operator, released_by, released_at")
          .in("cycle_number", cycleNumbers);

        if (cyclesError) {
          throw cyclesError;
        }

        cyclesByNumber = (cyclesData || []).reduce(
          (acc, cycle) => {
            acc[cycle.cycle_number] = cycle;
            return acc;
          },
          {} as Record<string, CycleContext>
        );
      }

      const packNumbers = packRows.map((pack) => pack.pack_number);
      const tracesByPackNumber: Record<string, PatientTrace> = {};

      if (packNumbers.length > 0) {
        const { data: traceData, error: traceError } = await supabase
          .from("patient_traces")
          .select(
            "id, patient_name, provider, treatment_room, procedure, created_at, pack_id, pack_number"
          )
          .in("pack_number", packNumbers);

        if (traceError) {
          throw traceError;
        }

        (traceData || []).forEach((trace) => {
          tracesByPackNumber[trace.pack_number] = trace;
        });
      }

      const enrichedPacks = packRows.map((pack) => ({
        ...pack,
        cycle: cyclesByNumber[pack.cycle_number] || null,
        used_trace_created_at:
          tracesByPackNumber[pack.pack_number]?.created_at || null,
      }));

      setPacks(enrichedPacks);
      setSelectedPack((current) => {
        if (!current) {
          return current;
        }

        return enrichedPacks.find((pack) => pack.id === current.id) || null;
      });
    } catch (error) {
      toast.error("Error loading pack inventory.");
      console.error("Assistant inventory load error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTrace(pack: ExtendedPack) {
    setLoadingTrace(true);

    try {
      const { data: traceByPackId, error: packIdError } = await supabase
        .from("patient_traces")
        .select(
          "id, patient_name, provider, treatment_room, procedure, created_at, pack_id, pack_number"
        )
        .eq("pack_id", pack.id)
        .maybeSingle<PatientTrace>();

      if (packIdError) {
        throw packIdError;
      }

      if (traceByPackId) {
        setSelectedTrace(traceByPackId);
        return;
      }

      const { data: traceByPackNumber, error: packNumberError } = await supabase
        .from("patient_traces")
        .select(
          "id, patient_name, provider, treatment_room, procedure, created_at, pack_id, pack_number"
        )
        .eq("pack_number", pack.pack_number)
        .maybeSingle<PatientTrace>();

      if (packNumberError) {
        throw packNumberError;
      }

      setSelectedTrace(traceByPackNumber || null);
    } catch (error) {
      toast.error("Error loading traceability details.");
      console.error("Assistant inventory trace load error:", error);
    } finally {
      setLoadingTrace(false);
    }
  }

  function openLabelPreview(pack: ExtendedPack) {
    const effectiveStatus = getPackEffectiveStatus(pack);

    if (effectiveStatus === "Used") {
      toast.error("This pack has already been used. Reprinting is blocked.");
      return;
    }

    if (effectiveStatus === "Expired") {
      toast.error("This pack is expired. Reprinting is blocked.");
      return;
    }

    setSelectedLabelPack(pack);
    setAssistantNotification({
      title: "Label Ready",
      message: pack.pack_number,
      detail: "Preview opened for printing.",
      variant: "info",
    });
  }

  async function printSelectedLabel() {
    if (!selectedLabelPack) {
      return;
    }

    try {
      await createAuditLog({
        action: "label_printed",
        entityType: "pack",
        entityId: selectedLabelPack.id,
        description: `Label printed for ${selectedLabelPack.pack_number}`,
        metadata: {
          pack_number: selectedLabelPack.pack_number,
          pack_type: selectedLabelPack.pack_type,
          expires_at: selectedLabelPack.expires_at,
          source: "assistant_inventory",
        },
      });

      window.print();
    } catch (error) {
      toast.error("Label print could not be audited.");
      console.error("Assistant inventory label print error:", error);
    }
  }

  function viewTraceability() {
    if (!selectedTrace) {
      setAssistantNotification({
        title: "No Traceability Record",
        message: selectedPack?.pack_number || "Pack not linked",
        detail: "This pack has not been linked to a patient.",
        variant: "info",
      });
      return;
    }

    window.location.href = `/patients?traceId=${selectedTrace.id}`;
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
            Pack Inventory
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

      <section className="grid min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-hidden">
        {selectedPack ? (
          <PackDetails
            pack={selectedPack}
            trace={selectedTrace}
            loadingTrace={loadingTrace}
            onBack={() => setSelectedPack(null)}
            onPrintLabel={() => openLabelPreview(selectedPack)}
            onViewTraceability={viewTraceability}
          />
        ) : (
          <InventoryOverview
            packs={filteredPacks}
            loading={loading}
            searchTerm={searchTerm}
            statusFilter={statusFilter}
            availableCount={availablePacks.length}
            expiringSoonCount={expiringSoonPacks.length}
            expiredCount={expiredPacks.length}
            usedTodayCount={usedTodayPacks.length}
            onSearchChange={setSearchTerm}
            onStatusFilterChange={setStatusFilter}
            onRefresh={fetchPacks}
            onSelectPack={setSelectedPack}
          />
        )}
      </section>

      {selectedLabelPack && selectedLabelData && (
        <LabelPreviewModal
          labelData={selectedLabelData}
          onClose={() => setSelectedLabelPack(null)}
          onPrint={printSelectedLabel}
        />
      )}
    </main>
  );
}

function InventoryOverview({
  packs,
  loading,
  searchTerm,
  statusFilter,
  availableCount,
  expiringSoonCount,
  expiredCount,
  usedTodayCount,
  onSearchChange,
  onStatusFilterChange,
  onRefresh,
  onSelectPack,
}: {
  packs: ExtendedPack[];
  loading: boolean;
  searchTerm: string;
  statusFilter: StatusFilter;
  availableCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  usedTodayCount: number;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onRefresh: () => void;
  onSelectPack: (pack: ExtendedPack) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard title="Available Packs" value={availableCount} tone="success" />
        <MetricCard title="Expiring Soon" value={expiringSoonCount} tone="warning" />
        <MetricCard title="Expired Packs" value={expiredCount} tone="critical" />
        <MetricCard title="Used Today" value={usedTodayCount} tone="neutral" />
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            className="min-h-14 w-full rounded-2xl border-2 border-slate-300 bg-white pl-12 pr-4 text-lg font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            placeholder="Search pack, cycle, contents, or status"
          />
        </label>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="min-h-14 rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:opacity-50 disabled:active:scale-100"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        {statusFilters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => onStatusFilterChange(filter)}
            className={`min-h-12 rounded-2xl border px-3 py-2 text-sm font-black transition-all hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner ${
              statusFilter === filter
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
          Loading inventory...
        </div>
      ) : packs.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <div>
            <Boxes className="mx-auto h-10 w-10 text-slate-500" />
            <h2 className="mt-3 text-2xl font-bold">No Packs Found</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Try a different search or status filter.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {packs.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              onSelect={() => onSelectPack(pack)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PackCard({
  pack,
  onSelect,
}: {
  pack: ExtendedPack;
  onSelect: () => void;
}) {
  const status = getPackEffectiveStatus(pack);
  const expiringSoon = isPackExpiringSoon(pack);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-[15rem] flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-950 hover:bg-white hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Pack
            </p>
            <h2 className="mt-1 break-words text-2xl font-black">
              {pack.pack_number}
            </h2>
          </div>
          <StatusPill status={expiringSoon ? "Expiring Soon" : status} />
        </div>

        <div className="mt-4 grid gap-2 text-sm">
          <Detail label="Cycle" value={pack.cycle_number} />
          <Detail label="Contents" value={pack.contents || pack.pack_type} />
          <Detail label="Expires" value={formatPackDate(pack.expires_at)} />
        </div>
      </div>

      <p className="mt-4 text-sm font-bold text-slate-500">
        Created {formatPackDate(pack.created_at)}
      </p>
    </button>
  );
}

function PackDetails({
  pack,
  trace,
  loadingTrace,
  onBack,
  onPrintLabel,
  onViewTraceability,
}: {
  pack: ExtendedPack;
  trace: PatientTrace | null;
  loadingTrace: boolean;
  onBack: () => void;
  onPrintLabel: () => void;
  onViewTraceability: () => void;
}) {
  const status = getPackEffectiveStatus(pack);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <Package className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-2xl font-bold">Pack Details</h2>
          <p className="mt-1 text-sm text-slate-600">
            Review identity, lifecycle, and traceability status.
          </p>
        </div>
      </div>

      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)]">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Pack Number
              </p>
              <h3 className="mt-1 break-words text-3xl font-black">
                {pack.pack_number}
              </h3>
            </div>
            <StatusPill status={status} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ReviewCard title="Cycle Number" value={pack.cycle_number} />
            <ReviewCard title="Contents" value={pack.contents || pack.pack_type} />
            <ReviewCard title="Status" value={status} />
            <ReviewCard title="Expiration" value={formatPackDate(pack.expires_at)} />
            <ReviewCard title="Created Date" value={formatPackDateTime(pack.created_at)} />
            <ReviewCard
              title="Sterilized"
              value={formatPackDate(pack.sterilized_at)}
            />
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Traceability
            </p>
            {loadingTrace ? (
              <p className="mt-3 text-base font-bold text-slate-500">
                Loading traceability...
              </p>
            ) : trace ? (
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <Detail label="Patient" value={trace.patient_name} />
                <Detail label="Provider" value={trace.provider} />
                <Detail label="Procedure" value={trace.procedure} />
                <Detail
                  label="Used On"
                  value={formatPackDateTime(trace.created_at)}
                />
              </div>
            ) : (
              <p className="mt-3 text-base font-bold text-green-700">
                No patient traceability record is linked to this pack.
              </p>
            )}
          </div>
        </section>

        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-xl font-bold">Actions</h3>
          <p className="mt-1 text-sm text-slate-600">
            Label printing follows existing inventory rules.
          </p>

          <div className="mt-4 grid flex-1 gap-3">
            <button
              type="button"
              onClick={onPrintLabel}
              className="flex min-h-28 flex-col justify-between rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left text-blue-800 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
            >
              <Printer className="h-7 w-7" />
              <span className="text-2xl font-black">Print Label</span>
            </button>

            <button
              type="button"
              onClick={onViewTraceability}
              className="flex min-h-28 flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
            >
              <FileText className="h-7 w-7" />
              <span className="text-2xl font-black">View Traceability</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="mt-4 min-h-12 rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner"
          >
            Back
          </button>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "success" | "warning" | "critical" | "neutral";
}) {
  const toneClasses = {
    success: "border-green-200 bg-green-50 text-green-700",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
    critical: "border-red-200 bg-red-50 text-red-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-800",
  };

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-75">
        {title}
      </p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Expired"
      ? "border-red-200 bg-red-100 text-red-700"
      : status === "Expiring Soon"
        ? "border-yellow-200 bg-yellow-100 text-yellow-800"
        : status === "Available"
          ? "border-green-200 bg-green-100 text-green-700"
          : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <span className={`rounded-xl border px-3 py-2 text-sm font-black ${tone}`}>
      {status}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-1 line-clamp-2 block break-words text-base font-bold text-slate-950">
        {value || "N/A"}
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
        {value || "N/A"}
      </p>
    </div>
  );
}
