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
  contents: string;
  status: string | null;
  created_at: string;
};

type Cycle = {
  id: string;
  cycle_number: string;
  expected_pack_count: number | null;
};

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [packCounter, setPackCounter] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 5;

  const [form, setForm] = useState({
    cycleId: "",
    packType: "Instrument Pouch",
    contents: "",
  });

  useEffect(() => {
    fetchPacks();
    fetchCycles();
  }, []);

  async function fetchPacks() {
    const { data, error } = await supabase
      .from("packs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error loading packs.");
      console.error(error);
      return;
    }

    setPacks(data || []);
    setPackCounter((data?.length || 0) + 1);
  }

  async function fetchCycles() {
    const { data, error } = await supabase
      .from("cycles")
      .select("id, cycle_number, expected_pack_count")
      .eq("status", "Passed")
      .eq("cycle_state", "Open")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error loading open cycles.");
      console.error(error);
      return;
    }

    setCycles(data || []);
  }

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function savePack() {
    if (!form.cycleId || !form.packType || !form.contents) {
      toast.error("Please fill all required fields.");
      return;
    }

    const selectedCycle = cycles.find((cycle) => cycle.id === form.cycleId);

    if (!selectedCycle) {
      toast.error("Selected cycle not found.");
      return;
    }

    setLoading(true);

    const { count: existingPackCount, error: countError } = await supabase
      .from("packs")
      .select("id", { count: "exact", head: true })
      .eq("cycle_id", selectedCycle.id);

    if (countError) {
      toast.error("Error checking pack count.");
      console.error(countError);
      setLoading(false);
      return;
    }

    const currentCount = existingPackCount || 0;
    const expectedCount = selectedCycle.expected_pack_count || 0;

    if (expectedCount > 0 && currentCount >= expectedCount) {
      await supabase
        .from("cycles")
        .update({ cycle_state: "Closed" })
        .eq("id", selectedCycle.id);

      await fetchCycles();

      toast.error("This cycle has already reached its expected pack count.");
      setLoading(false);
      return;
    }

    const newPackNumber = `PACK-${new Date().getFullYear()}-${String(
      packCounter
    ).padStart(4, "0")}`;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("packs").insert([
      {
        pack_number: newPackNumber,
        cycle_id: selectedCycle.id,
        cycle_number: selectedCycle.cycle_number,
        pack_type: form.packType,
        contents: form.contents,
        status: "Available",
        created_by: user?.email || "unknown",
      },
    ]);

    if (error) {
      toast.error("Error saving pack.");
      console.error(error);
      setLoading(false);
      return;
    }

    const newCount = currentCount + 1;

    if (expectedCount > 0 && newCount >= expectedCount) {
      const { error: closeError } = await supabase
        .from("cycles")
        .update({ cycle_state: "Closed" })
        .eq("id", selectedCycle.id);

      if (closeError) {
        toast.error("Pack saved, but cycle was not closed.");
        console.error(closeError);
        setLoading(false);
        return;
      }

      toast.success("Pack saved. Cycle reached expected count and was closed.");
    } else {
      toast.success(
        `Pack saved. ${newCount}/${expectedCount || "?"} packs created for this cycle.`
      );
    }

    setForm({
      cycleId: "",
      packType: "Instrument Pouch",
      contents: "",
    });

    await fetchPacks();
    await fetchCycles();

    setLoading(false);
  }

  const filteredPacks = packs.filter((pack) => {
    const search = searchTerm.toLowerCase();
    const packStatus = pack.status || "Available";

    const matchesSearch =
      pack.pack_number.toLowerCase().includes(search) ||
      pack.cycle_number.toLowerCase().includes(search) ||
      pack.pack_type.toLowerCase().includes(search) ||
      pack.contents.toLowerCase().includes(search) ||
      packStatus.toLowerCase().includes(search);

    const matchesStatus =
      statusFilter === "All" || packStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredPacks.length / itemsPerPage);

  const paginatedPacks = filteredPacks.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Instrument Packs</h1>
        <p className="mt-2 text-slate-600">
          Create QR-coded instrument packs and link them to open sterilization
          cycles.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-3xl mb-8">
        <h2 className="text-2xl font-semibold mb-6">New Instrument Pack</h2>

        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">
              Open Passed Sterilization Cycle
            </label>

            <select
              value={form.cycleId}
              onChange={(e) => updateForm("cycleId", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">
                {cycles.length === 0
                  ? "No open passed cycles available"
                  : "Select an open sterilization cycle"}
              </option>

              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.cycle_number} · Expected packs:{" "}
                  {cycle.expected_pack_count || "N/A"}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs text-slate-500">
              Closed, failed, and pending cycles are not available for pack
              creation.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Pack Type</label>
            <select
              value={form.packType}
              onChange={(e) => updateForm("packType", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option>Instrument Pouch</option>
              <option>Cassette</option>
              <option>Surgical Kit</option>
              <option>Hygiene Kit</option>
              <option>Exam Kit</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Contents</label>
            <textarea
              value={form.contents}
              onChange={(e) => updateForm("contents", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 min-h-28"
              placeholder="Example: mirror, explorer, cotton pliers..."
            />
          </div>

          <button
            type="button"
            onClick={savePack}
            disabled={loading || cycles.length === 0}
            className="rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Save Pack"}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-2xl font-semibold mb-4">Saved Packs</h2>

        <div className="mb-4 flex flex-col md:flex-row gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full md:w-48 rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="All">All Packs</option>
            <option value="Available">Available</option>
            <option value="Used">Used</option>
          </select>

          <input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Search by pack number, cycle, type, contents, or status"
          />
        </div>

        {packs.length === 0 ? (
          <p className="text-slate-500">No packs saved yet.</p>
        ) : filteredPacks.length === 0 ? (
          <p className="text-slate-500">No matching packs found.</p>
        ) : (
          <>
            <div className="space-y-3">
              {paginatedPacks.map((pack) => (
                <div
                  key={pack.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{pack.pack_number}</h3>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${getPackStatusBadgeClass(
                            pack.status || "Available"
                          )}`}
                        >
                          {pack.status || "Available"}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 mt-1">
                        {pack.pack_type} · Cycle: {pack.cycle_number}
                      </p>

                      <p className="text-sm text-slate-500 mt-2">
                        {pack.contents}
                      </p>

                      <p className="text-xs text-slate-400 mt-3">
                        Created: {new Date(pack.created_at).toLocaleString()}
                      </p>
                    </div>

                    <QRCodeSVG value={pack.pack_number} size={90} />
                  </div>
                </div>
              ))}
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

function getPackStatusBadgeClass(status: string) {
  if (status === "Used") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }

  if (status === "Available") {
    return "bg-green-100 text-green-700 border-green-200";
  }

  return "bg-yellow-100 text-yellow-700 border-yellow-200";
}