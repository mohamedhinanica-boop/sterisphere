"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";
import toast from "react-hot-toast";
import type { CycleContext, Pack } from "@/lib/modules/packs";
import { generateLabelData } from "@/lib/modules/labels/generateLabelData";
import type { LabelData } from "@/lib/modules/labels/types";
import {
  formatInitials,
  formatLoadComposition,
  formatPackDate,
  formatPackDateTime,
  getPackEffectiveStatus,
  isPackExpiringSoon,
} from "@/lib/modules/packs";

const itemsPerPage = 5;

type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  procedure: string;
  created_at: string | null;
  pack_id: string | null;
  pack_number: string;
};

type ExtendedPack = Pack & {
  expired_reviewed?: boolean | null;
  expired_reviewed_at?: string | null;
  expired_reviewed_by?: string | null;
};

export default function PacksPage() {
  const [packs, setPacks] = useState<ExtendedPack[]>([]);
  const [selectedLabelPack, setSelectedLabelPack] =
    useState<ExtendedPack | null>(null);
  const [selectedDetailsPack, setSelectedDetailsPack] =
    useState<ExtendedPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchPacks();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get("filter");

    if (filter === "expired") {
      setStatusFilter("Expired");
      setCurrentPage(1);
    }

    if (filter === "expiring-soon") {
      setStatusFilter("Expiring Soon");
      setCurrentPage(1);
    }
  }, []);

  async function fetchPacks() {
    setLoading(true);

    const { data: packsData, error: packsError } = await supabase
      .from("packs")
      .select(
        "id, pack_number, cycle_number, pack_type, contents, status, sterilized_at, expires_at, load_item_index, load_item_total, cycle_pack_total, cycle_load_summary, created_at, expired_reviewed, expired_reviewed_at, expired_reviewed_by",
      )
      .order("created_at", { ascending: false });

    if (packsError) {
      toast.error("Error loading packs.");
      console.error(packsError);
      setLoading(false);
      return;
    }

    const cycleNumbers = Array.from(
      new Set((packsData || []).map((pack) => pack.cycle_number)),
    );

    let cyclesByNumber: Record<string, CycleContext> = {};

    if (cycleNumbers.length > 0) {
      const { data: cyclesData, error: cyclesError } = await supabase
        .from("cycles")
        .select("cycle_number, sterilizer, operator, released_by, released_at")
        .in("cycle_number", cycleNumbers);

      if (cyclesError) {
        toast.error("Error loading cycle details.");
        console.error(cyclesError);
        setLoading(false);
        return;
      }

      cyclesByNumber = (cyclesData || []).reduce(
        (acc, cycle) => {
          acc[cycle.cycle_number] = cycle;
          return acc;
        },
        {} as Record<string, CycleContext>,
      );
    }

    const enrichedPacks = (packsData || []).map((pack) => ({
      ...pack,
      cycle: cyclesByNumber[pack.cycle_number] || null,
    }));

    setPacks(enrichedPacks);
    setLoading(false);
  }

  function openLabelPreview(pack: ExtendedPack) {
    const effectiveStatus = getPackEffectiveStatus(pack);

    if (effectiveStatus === "Used") {
      toast.error(
        "This pack has already been used. Reprinting is blocked for now.",
      );
      return;
    }

    if (effectiveStatus === "Expired") {
      toast.error("This pack is expired. Reprinting is blocked for now.");
      return;
    }

    setSelectedLabelPack(pack);
  }

  async function markExpiredPackReviewed(pack: ExtendedPack) {
    const effectiveStatus = getPackEffectiveStatus(pack);

    if (effectiveStatus !== "Expired") {
      toast.error("Only expired packs can be marked as reviewed.");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const reviewedBy = user?.email || "unknown";
      const reviewedAt = new Date().toISOString();

      const { error } = await supabase
        .from("packs")
        .update({
          expired_reviewed: true,
          expired_reviewed_at: reviewedAt,
          expired_reviewed_by: reviewedBy,
        })
        .eq("id", pack.id);

      if (error) {
        throw error;
      }

      await createAuditLog({
        action: "expired_pack_reviewed",
        entityType: "pack",
        entityId: pack.id,
        description: `Expired pack ${pack.pack_number} reviewed`,
        metadata: {
          pack_number: pack.pack_number,
          reviewed_by: reviewedBy,
          reviewed_at: reviewedAt,
        },
      });

      const updatedPack: ExtendedPack = {
        ...pack,
        expired_reviewed: true,
        expired_reviewed_at: reviewedAt,
        expired_reviewed_by: reviewedBy,
      };

      setPacks((current) =>
        current.map((item) => (item.id === pack.id ? updatedPack : item)),
      );

      setSelectedDetailsPack((current) =>
        current?.id === pack.id ? updatedPack : current,
      );

      toast.success("Expired pack reviewed.");
    } catch (error) {
      toast.error("Error marking expired pack as reviewed.");
      console.error(error);
    }
  }

  const selectedLabelData: LabelData | null = selectedLabelPack
    ? generateLabelData({
        id: selectedLabelPack.id,
        pack_number: selectedLabelPack.pack_number,
        pack_type: selectedLabelPack.pack_type,
        expires_at: selectedLabelPack.expires_at,
      })
    : null;

  async function printSelectedLabel() {
    if (!selectedLabelPack) return;

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
        },
      });

      window.print();
    } catch (error) {
      toast.error("Label print could not be audited.");
      console.error(error);
    }
  }

  const totalPacks = packs.length;
  const availablePacks = packs.filter(
    (pack) => getPackEffectiveStatus(pack) === "Available",
  );
  const usedPacks = packs.filter(
    (pack) => getPackEffectiveStatus(pack) === "Used",
  );
  const expiredPacks = packs.filter(
    (pack) => getPackEffectiveStatus(pack) === "Expired",
  );
  const expiringSoonPacks = packs.filter((pack) => isPackExpiringSoon(pack));

  const filteredPacks = packs.filter((pack) => {
    const search = searchTerm.toLowerCase();
    const effectiveStatus = getPackEffectiveStatus(pack);

    const matchesSearch =
      pack.pack_number.toLowerCase().includes(search) ||
      pack.cycle_number.toLowerCase().includes(search) ||
      pack.pack_type.toLowerCase().includes(search) ||
      (pack.contents || "").toLowerCase().includes(search) ||
      effectiveStatus.toLowerCase().includes(search) ||
      (pack.cycle?.sterilizer || "").toLowerCase().includes(search) ||
      (pack.cycle?.operator || "").toLowerCase().includes(search) ||
      (pack.cycle?.released_by || "").toLowerCase().includes(search);

    const matchesStatus =
      statusFilter === "All" ||
      effectiveStatus === statusFilter ||
      (statusFilter === "Expiring Soon" && isPackExpiringSoon(pack));

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredPacks.length / itemsPerPage);

  const paginatedPacks = filteredPacks.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <>
      <header className="mb-8 no-print">
        <h1 className="text-4xl font-bold">Pack Inventory</h1>
        <p className="mt-2 text-slate-600">
          View, search, and track sterilized instrument packs generated from
          sterilization cycles.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8 no-print">
        <InventoryCard title="Total Packs" value={totalPacks} />
        <InventoryCard title="Available" value={availablePacks.length} good />
        <InventoryCard title="Used" value={usedPacks.length} />
        <InventoryCard title="Expired" value={expiredPacks.length} danger />
        <InventoryCard
          title="Expiring Soon"
          value={expiringSoonPacks.length}
          warning
        />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-semibold">Inventory List</h2>
            <p className="mt-1 text-sm text-slate-500">
              Showing {filteredPacks.length} of {packs.length} pack(s).
            </p>
          </div>

          <button
            type="button"
            onClick={fetchPacks}
            disabled={loading}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mb-4 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="All">All Packs</option>
            <option value="Available">Available</option>
            <option value="Used">Used</option>
            <option value="Expired">Expired</option>
            <option value="Expiring Soon">Expiring Soon</option>
          </select>

          <input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Search by pack, cycle, type, sterilizer, operator, or status"
          />
        </div>

        {loading ? (
          <p className="text-slate-500">Loading packs...</p>
        ) : packs.length === 0 ? (
          <p className="text-slate-500">No packs found yet.</p>
        ) : filteredPacks.length === 0 ? (
          <p className="text-slate-500">No matching packs found.</p>
        ) : (
          <>
            <div className="space-y-3">
              {paginatedPacks.map((pack) => {
                const effectiveStatus = getPackEffectiveStatus(pack);
                const expiringSoon = isPackExpiringSoon(pack);
                const compositionItems = formatLoadComposition(
                  pack.cycle_load_summary,
                );

                return (
                  <div
                    key={pack.id}
                    onClick={() => setSelectedDetailsPack(pack)}
                    className="rounded-xl border border-slate-200 p-4 cursor-pointer transition hover:border-blue-300 hover:bg-blue-50/30"
                  >
                    <div className="flex flex-col md:flex-row md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{pack.pack_number}</h3>
                          <StatusBadge value={effectiveStatus} />

                          {effectiveStatus === "Expired" &&
                            !pack.expired_reviewed && (
                              <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                                Needs Review
                              </span>
                            )}

                          {effectiveStatus === "Expired" &&
                            pack.expired_reviewed && (
                              <span className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                                Reviewed
                              </span>
                            )}

                          {expiringSoon && (
                            <span className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                              Expiring Soon
                            </span>
                          )}
                        </div>

                        <div className="mt-2">
                          <p className="text-lg font-semibold text-slate-900">
                            {pack.pack_type}
                          </p>

                          {pack.load_item_index && pack.load_item_total && (
                            <p className="text-sm font-medium text-blue-700 mt-1">
                              {pack.load_item_index} of {pack.load_item_total}
                            </p>
                          )}
                        </div>

                        <p className="text-sm text-slate-500 mt-2">
                          Cycle:{" "}
                          <span className="font-medium text-slate-700">
                            {pack.cycle_number}
                          </span>
                        </p>

                        {pack.cycle_pack_total && (
                          <p className="text-sm text-slate-500 mt-1">
                            Part of a{" "}
                            <span className="font-medium text-slate-700">
                              {pack.cycle_pack_total}-pack
                            </span>{" "}
                            sterilization load
                          </p>
                        )}

                        {compositionItems.length > 0 && (
                          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                            <p className="font-medium text-slate-700 mb-2">
                              Load composition
                            </p>

                            <ul className="space-y-1">
                              {compositionItems.map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-sm font-medium text-slate-700 mb-2">
                            Sterilization context
                          </p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-500">
                            <p>
                              Sterilizer:{" "}
                              <span className="font-medium text-slate-700">
                                {pack.cycle?.sterilizer || "N/A"}
                              </span>
                            </p>

                            <p>
                              Started by:{" "}
                              <span className="font-medium text-slate-700">
                                {formatInitials(pack.cycle?.operator)}
                              </span>
                            </p>

                            <p>
                              Completed by:{" "}
                              <span className="font-medium text-slate-700">
                                {formatInitials(pack.cycle?.released_by)}
                              </span>
                            </p>

                            <p>
                              Completed at:{" "}
                              <span className="font-medium text-slate-700">
                                {formatPackDateTime(
                                  pack.cycle?.released_at || null,
                                )}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-sm text-slate-500">
                          <p>
                            Sterilized:{" "}
                            <span className="font-medium text-slate-700">
                              {formatPackDate(pack.sterilized_at)}
                            </span>
                          </p>

                          <p>
                            Expires:{" "}
                            <span className="font-medium text-slate-700">
                              {formatPackDate(pack.expires_at)}
                            </span>
                          </p>
                        </div>

                        <p className="text-xs text-slate-400 mt-3">
                          Created: {new Date(pack.created_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="shrink-0 flex flex-col items-center gap-3">
                        <QRCodeSVG value={pack.pack_number} size={90} />

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openLabelPreview(pack);
                          }}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                        >
                          Preview / Print Label
                        </button>

                        {effectiveStatus === "Expired" &&
                          !pack.expired_reviewed && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                markExpiredPackReviewed(pack);
                              }}
                              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                            >
                              Mark Reviewed
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-6">
                <p className="text-sm text-slate-500">
                  Page {currentPage} of {totalPages}
                </p>

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((page) => page - 1)}
                    className="rounded-xl border border-slate-300 px-4 py-2 min-h-11 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95 transition"
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((page) => page + 1)}
                    className="rounded-xl border border-slate-300 px-4 py-2 min-h-11 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {selectedDetailsPack && (
        <PackDetailsModal
          pack={selectedDetailsPack}
          onClose={() => setSelectedDetailsPack(null)}
          onPrintLabel={(packToPrint) => {
            setSelectedDetailsPack(null);
            openLabelPreview(packToPrint);
          }}
        />
      )}

      {selectedLabelPack && selectedLabelData && (
        <LabelPreviewModal
          labelData={selectedLabelData}
          onClose={() => setSelectedLabelPack(null)}
          onPrint={printSelectedLabel}
        />
      )}
    </>
  );
}

function InventoryCard({
  title,
  value,
  good = false,
  danger = false,
  warning = false,
}: {
  title: string;
  value: number;
  good?: boolean;
  danger?: boolean;
  warning?: boolean;
}) {
  const className = danger
    ? "border-red-200 bg-red-50 text-red-700"
    : warning
      ? "border-orange-200 bg-orange-50 text-orange-700"
      : good
        ? "border-green-200 bg-green-50 text-green-700"
        : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${className}`}>
      <p className="text-sm opacity-80">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  if (value === "Available") {
    return (
      <span className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
        Available
      </span>
    );
  }

  if (value === "Used") {
    return (
      <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
        Used
      </span>
    );
  }

  if (value === "Expired") {
    return (
      <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
        Expired
      </span>
    );
  }

  return (
    <span className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700">
      {value}
    </span>
  );
}

function PackDetailsModal({
  pack,
  onClose,
  onPrintLabel,
}: {
  pack: ExtendedPack;
  onClose: () => void;
  onPrintLabel: (pack: ExtendedPack) => void;
}) {
  const effectiveStatus = getPackEffectiveStatus(pack);
  const compositionItems = formatLoadComposition(pack.cycle_load_summary);
  const [trace, setTrace] = useState<PatientTrace | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(true);

  useEffect(() => {
    loadTrace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.id]);

  async function loadTrace() {
    setLoadingTrace(true);

    const { data: traceByPackId, error: packIdError } = await supabase
      .from("patient_traces")
      .select(
        "id, patient_name, provider, treatment_room, procedure, created_at, pack_id, pack_number",
      )
      .eq("pack_id", pack.id)
      .maybeSingle();

    if (packIdError) {
      console.error(packIdError);
    }

    if (traceByPackId) {
      setTrace(traceByPackId);
      setLoadingTrace(false);
      return;
    }

    const { data: traceByPackNumber, error: packNumberError } = await supabase
      .from("patient_traces")
      .select(
        "id, patient_name, provider, treatment_room, procedure, created_at, pack_id, pack_number",
      )
      .eq("pack_number", pack.pack_number)
      .maybeSingle();

    if (packNumberError) {
      console.error(packNumberError);
    }

    setTrace(traceByPackNumber || null);
    setLoadingTrace(false);
  }

  const canPrintLabel = effectiveStatus === "Available";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Pack Details</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sterilization pack identity, lifecycle, and usage information.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5">
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Pack Identity
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailRow label="Pack Number" value={pack.pack_number} />
                <DetailRow label="Status" value={effectiveStatus} />
                <DetailRow label="Pack Type" value={pack.pack_type} />
                <DetailRow label="Cycle Number" value={pack.cycle_number} />
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Sterilization
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailRow
                  label="Created Date"
                  value={new Date(pack.created_at).toLocaleString()}
                />

                <DetailRow
                  label="Sterilized Date"
                  value={formatPackDate(pack.sterilized_at)}
                />

                <DetailRow
                  label="Expiry Date"
                  value={formatPackDate(pack.expires_at)}
                />

                <DetailRow
                  label="Sterilizer"
                  value={pack.cycle?.sterilizer || "N/A"}
                />

                <DetailRow
                  label="Started By"
                  value={formatInitials(pack.cycle?.operator)}
                />

                <DetailRow
                  label="Completed By"
                  value={formatInitials(pack.cycle?.released_by)}
                />
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Load Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailRow
                  label="Load Position"
                  value={
                    pack.load_item_index && pack.load_item_total
                      ? `${pack.load_item_index} of ${pack.load_item_total}`
                      : "N/A"
                  }
                />

                <DetailRow
                  label="Cycle Pack Total"
                  value={
                    pack.cycle_pack_total
                      ? `${pack.cycle_pack_total} pack(s)`
                      : "N/A"
                  }
                />
              </div>

              {compositionItems.length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Load Composition
                  </p>

                  <ul className="mt-2 space-y-1 text-sm font-medium text-slate-700">
                    {compositionItems.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <QRCodeSVG value={pack.pack_number} size={150} />

              <p className="mt-4 text-center text-sm font-semibold text-slate-700">
                {pack.pack_number}
              </p>

              <p className="mt-1 text-center text-xs text-slate-500">
                Scan to identify this pack.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Usage Information
              </h3>

              {loadingTrace ? (
                <p className="mt-3 text-sm text-slate-500">
                  Loading usage information...
                </p>
              ) : trace ? (
                <div className="mt-3 space-y-2 text-sm">
                  <CompactDetail label="Patient" value={trace.patient_name} />
                  <CompactDetail label="Provider" value={trace.provider} />
                  <CompactDetail label="Procedure" value={trace.procedure} />
                  <CompactDetail label="Room" value={trace.treatment_room} />
                  <CompactDetail
                    label="Used On"
                    value={
                      trace.created_at
                        ? new Date(trace.created_at).toLocaleString()
                        : "N/A"
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      (window.location.href = `/patients?traceId=${trace.id}`)
                    }
                    className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    View Traceability Record
                  </button>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-medium text-green-700">
                    This pack has not yet been linked to a patient.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium hover:bg-slate-50"
          >
            Close
          </button>

          <button
            type="button"
            disabled={!canPrintLabel}
            onClick={() => onPrintLabel(pack)}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Print Label
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-800">{value || "N/A"}</p>
    </div>
  );
}

function CompactDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="font-semibold text-slate-800">{value || "N/A"}</p>
    </div>
  );
}

function LabelPreviewModal({
  labelData,
  onClose,
  onPrint,
}: {
  labelData: LabelData;
  onClose: () => void;
  onPrint: () => void;
}) {
  const packType = labelData.packType || "Instrument Pack";
  const expiry = labelData.expiresAt
    ? new Date(labelData.expiresAt).toLocaleDateString()
    : "N/A";

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 50mm 30mm;
            margin: 0;
          }

          html,
          body {
            width: 50mm;
            height: 30mm;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .label-print-area,
          .label-print-area * {
            visibility: visible !important;
          }

          .label-print-area {
            display: flex !important;
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 50mm !important;
            height: 30mm !important;
            margin: 0 !important;
            padding: 1.5mm !important;
            box-sizing: border-box !important;
            align-items: center !important;
            gap: 2mm !important;
            background: white !important;
            color: black !important;
            font-family: Arial, Helvetica, sans-serif !important;
            box-shadow: none !important;
            border: none !important;
          }

          .label-qr {
            width: 18mm !important;
            height: 27mm !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
          }

          .label-qr svg {
            width: 18mm !important;
            height: 18mm !important;
          }

          .label-info {
            width: 27mm !important;
            height: 27mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            overflow: hidden !important;
          }

          .label-title {
            font-size: 10px !important;
            font-weight: 900 !important;
            line-height: 1 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .label-line {
            height: 1px !important;
            background: #000 !important;
            width: 100% !important;
            margin: 2.2mm 0 !important;
          }

          .label-row {
            display: flex !important;
            align-items: baseline !important;
            gap: 1mm !important;
            white-space: nowrap !important;
            line-height: 1 !important;
          }

          .label-key {
            font-size: 7px !important;
            font-weight: 800 !important;
          }

          .label-value {
            font-size: 8px !important;
            font-weight: 900 !important;
          }

          .label-pack {
            font-size: 6px !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Label Preview</h2>
              <p className="mt-1 text-sm text-slate-500">
                Standard 50 × 30 mm SteriSphere pack label.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium"
            >
              Close
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="mx-auto flex h-[180px] w-[300px] flex-col items-center justify-between rounded-xl border border-slate-300 bg-white p-3 text-center shadow-sm">
              <p className="text-sm font-bold text-slate-950">{packType}</p>

              <QRCodeSVG value={labelData.qrValue} size={96} />

              <div>
                <p className="text-[11px] font-semibold text-slate-900">
                  EXP {expiry}
                </p>
                <p className="text-[10px] font-semibold text-slate-700">
                  {labelData.packNumber}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onPrint}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white"
            >
              Print Label
            </button>
          </div>
        </div>
      </div>

      <div className="label-print-area hidden bg-white text-black">
        <div className="label-qr">
          <QRCodeSVG value={labelData.qrValue} size={78} />
        </div>

        <div className="label-info">
          <div className="label-title">{packType}</div>

          <div className="label-line" />

          <div className="label-row">
            <span className="label-key">EXP:</span>
            <span className="label-value">{expiry}</span>
          </div>

          <div className="label-line" />

          <div className="label-row">
            <span className="label-key">PACK:</span>
            <span className="label-value label-pack">
              {labelData.packNumber}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
