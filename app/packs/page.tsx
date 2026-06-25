"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";
import toast from "react-hot-toast";
import InventoryCard from "@/components/packs/InventoryCard";
import StatusBadge from "@/components/packs/StatusBadge";
import type { CycleContext } from "@/lib/modules/packs";
import { generateLabelData } from "@/lib/modules/labels/generateLabelData";
import type { LabelData } from "@/lib/modules/labels/types";
import { printPackLabelViaAgent } from "@/lib/modules/printers";
import {
  formatInitials,
  formatLoadComposition,
  formatPackDate,
  formatPackDateTime,
  getPackEffectiveStatus,
  isPackExpiringSoon,
} from "@/lib/modules/packs";
import PackDetailsModal from "@/components/packs/PackDetailsModal";
import LabelPreviewModal from "@/components/packs/LabelPreviewModal";
import type { ExtendedPack } from "@/components/packs/types";

const itemsPerPage = 5;

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
    const status = params.get("status");
    const filter = params.get("filter");

    if (status) {
      setStatusFilter(status);
      setCurrentPage(1);
      return;
    }

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

      const agentPrintResult = await printPackLabelViaAgent({
        displayName: selectedLabelPack.pack_type,
        packNumber: selectedLabelPack.pack_number,
        cycleNumber: selectedLabelPack.cycle_number,
        expiresAt: selectedLabelPack.expires_at,
        qrValue: selectedLabelPack.pack_number,
      });

      if (agentPrintResult.status === "printed") {
        toast.success("Direct print successful.");
        return;
      }

      if (agentPrintResult.status === "fallback") {
        if (agentPrintResult.message) {
          toast(agentPrintResult.message);
        }

        window.print();
      }
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
