"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  contents: string | null;
  status: string | null;
  sterilized_at: string | null;
  expires_at: string | null;
  load_item_index: number | null;
  load_item_total: number | null;
  cycle_pack_total: number | null;
  cycle_load_summary: string | null;
  created_at: string;
};

const itemsPerPage = 5;

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchPacks();
  }, []);

  async function fetchPacks() {
    setLoading(true);

    const { data, error } = await supabase
      .from("packs")
      .select(
  "id, pack_number, cycle_number, pack_type, contents, status, sterilized_at, expires_at, load_item_index, load_item_total, cycle_pack_total, cycle_load_summary, created_at"
)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error loading packs.");
      console.error(error);
      setLoading(false);
      return;
    }

    setPacks(data || []);
    setLoading(false);
  }

  function getEffectiveStatus(pack: Pack) {
    if (pack.status === "Used") {
      return "Used";
    }

    if (pack.expires_at && new Date(pack.expires_at) < new Date()) {
      return "Expired";
    }

    return pack.status || "Available";
  }

  function isExpiringSoon(pack: Pack) {
    if (!pack.expires_at || getEffectiveStatus(pack) !== "Available") {
      return false;
    }

    const today = new Date();
    const expiry = new Date(pack.expires_at);
    const diffInDays = Math.ceil(
      (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return diffInDays >= 0 && diffInDays <= 30;
  }

  const totalPacks = packs.length;
  const availablePacks = packs.filter(
    (pack) => getEffectiveStatus(pack) === "Available"
  );
  const usedPacks = packs.filter((pack) => getEffectiveStatus(pack) === "Used");
  const expiredPacks = packs.filter(
    (pack) => getEffectiveStatus(pack) === "Expired"
  );
  const expiringSoonPacks = packs.filter((pack) => isExpiringSoon(pack));

  const filteredPacks = packs.filter((pack) => {
    const search = searchTerm.toLowerCase();
    const effectiveStatus = getEffectiveStatus(pack);

    const matchesSearch =
      pack.pack_number.toLowerCase().includes(search) ||
      pack.cycle_number.toLowerCase().includes(search) ||
      pack.pack_type.toLowerCase().includes(search) ||
      (pack.contents || "").toLowerCase().includes(search) ||
      effectiveStatus.toLowerCase().includes(search);

    const matchesStatus =
      statusFilter === "All" ||
      effectiveStatus === statusFilter ||
      (statusFilter === "Expiring Soon" && isExpiringSoon(pack));

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredPacks.length / itemsPerPage);

  const paginatedPacks = filteredPacks.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  function formatDate(date: string | null) {
    if (!date) {
      return "N/A";
    }

    return new Date(date).toLocaleDateString();
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Pack Inventory</h1>
        <p className="mt-2 text-slate-600">
          View, search, and track sterilized instrument packs generated from
          sterilization cycles.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
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

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
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
            placeholder="Search by pack number, cycle, type, contents, or status"
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
                const effectiveStatus = getEffectiveStatus(pack);
                const expiringSoon = isExpiringSoon(pack);

                return (
                  <div
                    key={pack.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col md:flex-row md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{pack.pack_number}</h3>

                          <StatusBadge value={effectiveStatus} />

                          {expiringSoon && (
                            <span className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                              Expiring Soon
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-slate-600 mt-1">
                          {pack.pack_type} · Cycle: {pack.cycle_number}
                        </p>
                        {pack.load_item_index && pack.load_item_total && (
  <p className="text-sm text-blue-700 mt-2">
    {pack.pack_type} {pack.load_item_index} of {pack.load_item_total}
  </p>
)}

{pack.cycle_pack_total && (
  <p className="text-sm text-slate-500 mt-1">
    Part of a {pack.cycle_pack_total}-pack sterilization load
  </p>
)}

{pack.cycle_load_summary && (
  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
    <span className="font-medium text-slate-700">Load composition:</span>{" "}
    {pack.cycle_load_summary}
  </div>
)}

                        {pack.contents && (
                          <p className="text-sm text-slate-500 mt-2">
                            Contents: {pack.contents}
                          </p>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-sm text-slate-500">
                          <p>
                            Sterilized:{" "}
                            <span className="font-medium text-slate-700">
                              {formatDate(pack.sterilized_at)}
                            </span>
                          </p>

                          <p>
                            Expires:{" "}
                            <span className="font-medium text-slate-700">
                              {formatDate(pack.expires_at)}
                            </span>
                          </p>
                        </div>

                        <p className="text-xs text-slate-400 mt-3">
                          Created: {new Date(pack.created_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="shrink-0">
                        <QRCodeSVG value={pack.pack_number} size={90} />
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