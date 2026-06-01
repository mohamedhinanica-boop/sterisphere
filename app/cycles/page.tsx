"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { createAuditLog } from "@/lib/audit";

type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  load_contents: string;
  status: string;
  cycle_state: string | null;
  expected_pack_count: number | null;
  created_at: string;
};

export default function CyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleCounter, setCycleCounter] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 5;

  const [form, setForm] = useState({
    sterilizer: "",
    loadContents: "",
    expectedPackCount: "",
  });

  useEffect(() => {
    fetchCycles();
  }, []);

  async function fetchCycles() {
    const { data, error } = await supabase
      .from("cycles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error loading cycles.");
      console.error(error);
      return;
    }

    setCycles(data || []);
    setCycleCounter((data?.length || 0) + 1);
  }

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function startCycle() {
    if (!form.sterilizer || !form.loadContents || !form.expectedPackCount) {
      toast.error("Please fill all required fields.");
      return;
    }

    const expectedPackCount = Number(form.expectedPackCount);

    if (!Number.isInteger(expectedPackCount) || expectedPackCount <= 0) {
      toast.error("Expected pack count must be a positive number.");
      return;
    }

    setLoading(true);

    const newCycleNumber = `STERI-${new Date().getFullYear()}-${String(
      cycleCounter
    ).padStart(4, "0")}`;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const operatorEmail = user?.email || "unknown";

    const { data: newCycle, error } = await supabase
      .from("cycles")
      .insert([
        {
          cycle_number: newCycleNumber,
          sterilizer: form.sterilizer,
          operator: operatorEmail,
          load_contents: form.loadContents,
          status: "Pending",
          cycle_state: "Closed",
          expected_pack_count: expectedPackCount,
          created_by: operatorEmail,
        },
      ])
      .select()
      .single();

    if (error || !newCycle) {
      toast.error("Error starting cycle.");
      console.error(error);
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: "cycle_started",
      entityType: "cycle",
      entityId: newCycle.id,
      description: `Started sterilization cycle ${newCycle.cycle_number}`,
      metadata: {
        cycle_number: newCycle.cycle_number,
        sterilizer: newCycle.sterilizer,
        operator: newCycle.operator,
        status: newCycle.status,
        cycle_state: newCycle.cycle_state,
        expected_pack_count: newCycle.expected_pack_count,
      },
    });

    setForm({
      sterilizer: "",
      loadContents: "",
      expectedPackCount: "",
    });

    await fetchCycles();
    toast.success("Sterilization cycle started.");
    setLoading(false);
  }

  async function updateCycleStatus(cycleId: string, newStatus: string) {
    const { error } = await supabase
      .from("cycles")
      .update({
        status: newStatus,
        cycle_state: newStatus === "Passed" ? "Open" : "Closed",
      })
      .eq("id", cycleId);

    if (error) {
      toast.error("Error updating cycle status.");
      console.error(error);
      return;
    }

    await createAuditLog({
      action: "cycle_status_updated",
      entityType: "cycle",
      entityId: cycleId,
      description: `Cycle status updated to ${newStatus}`,
      metadata: {
        new_status: newStatus,
        cycle_state: newStatus === "Passed" ? "Open" : "Closed",
      },
    });

    await fetchCycles();

    if (newStatus === "Failed") {
      toast.error("Cycle marked as Failed and closed.");
    } else {
      toast.success("Cycle marked as Passed and opened for pack creation.");
    }
  }

  const filteredCycles = cycles.filter((cycle) => {
    const search = searchTerm.toLowerCase();
    const cycleState = cycle.cycle_state || "Open";

    const matchesSearch =
      cycle.cycle_number.toLowerCase().includes(search) ||
      cycle.sterilizer.toLowerCase().includes(search) ||
      cycle.operator.toLowerCase().includes(search) ||
      cycle.status.toLowerCase().includes(search) ||
      cycleState.toLowerCase().includes(search);

    const matchesStatus =
      statusFilter === "All" || cycle.status === statusFilter;

    const matchesState = stateFilter === "All" || cycleState === stateFilter;

    return matchesSearch && matchesStatus && matchesState;
  });

  const totalPages = Math.ceil(filteredCycles.length / itemsPerPage);

  const paginatedCycles = filteredCycles.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Sterilization Cycles</h1>
        <p className="mt-2 text-slate-600">
          Start sterilization cycles, track pending cycles, and release passed
          cycles for pack creation.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-3xl mb-8">
        <h2 className="text-2xl font-semibold mb-2">
          Start Sterilization Cycle
        </h2>

        <p className="text-sm text-slate-600 mb-6">
          New cycles always start as Pending. After sterilization is complete,
          mark the cycle as Passed or Failed from the saved cycles list.
        </p>

        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">Sterilizer</label>
            <input
              value={form.sterilizer}
              onChange={(e) => updateForm("sterilizer", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: Statim 5000 / Autoclave 1"
            />
            <p className="mt-2 text-xs text-slate-500">
              Later, this will become a managed sterilizer dropdown with presets.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Load Contents
            </label>
            <textarea
              value={form.loadContents}
              onChange={(e) => updateForm("loadContents", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 min-h-28"
              placeholder="Example: 5 exam kits, 2 surgical cassettes..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Expected Pack Count
            </label>
            <input
              type="number"
              min="1"
              value={form.expectedPackCount}
              onChange={(e) => updateForm("expectedPackCount", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: 5"
            />
            <p className="mt-2 text-xs text-slate-500">
              Once this number of packs is created after a Passed cycle, the
              cycle will automatically close.
            </p>
          </div>

          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            This cycle will be created as <strong>Pending</strong>. It will not
            be available for pack creation until it is marked as{" "}
            <strong>Passed</strong>.
          </div>

          <button
            type="button"
            onClick={startCycle}
            disabled={loading}
            className="rounded-xl bg-slate-950 text-white px-6 py-3 min-h-11 font-medium cursor-pointer hover:bg-slate-800 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Starting..." : "Start Sterilization Cycle"}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-2xl font-semibold mb-4">Saved Cycles</h2>

        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Passed">Passed</option>
            <option value="Failed">Failed</option>
          </select>

          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="All">All States</option>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>

          <input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Search cycles"
          />
        </div>

        {cycles.length === 0 ? (
          <p className="text-slate-500">No cycles saved yet.</p>
        ) : filteredCycles.length === 0 ? (
          <p className="text-slate-500">No matching cycles found.</p>
        ) : (
          <>
            <div className="space-y-3">
              {paginatedCycles.map((cycle) => (
                <div
                  key={cycle.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col md:flex-row md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <h3 className="font-semibold">{cycle.cycle_number}</h3>

                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`w-fit rounded-lg border px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
                              cycle.status
                            )}`}
                          >
                            {cycle.status}
                          </span>

                          <span
                            className={`w-fit rounded-lg border px-3 py-1 text-xs font-medium ${getStateBadgeClass(
                              cycle.cycle_state || "Open"
                            )}`}
                          >
                            {cycle.cycle_state || "Open"}
                          </span>
                        </div>
                      </div>

                      <p className="text-sm text-slate-600 mt-1">
                        {cycle.sterilizer} · Operator: {cycle.operator}
                      </p>

                      <p className="text-sm text-slate-500 mt-2">
                        {cycle.load_contents}
                      </p>

                      <p className="text-sm text-slate-500 mt-2">
                        Expected packs: {cycle.expected_pack_count || "N/A"}
                      </p>

                      <p className="text-xs text-slate-400 mt-3">
                        Created: {new Date(cycle.created_at).toLocaleString()}
                      </p>

                      {cycle.status === "Pending" && (
                        <div className="flex flex-col md:flex-row gap-3 mt-4">
                          <button
                            type="button"
                            onClick={() =>
                              updateCycleStatus(cycle.id, "Passed")
                            }
                            className="rounded-xl bg-green-600 text-white px-4 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-green-700 active:scale-95 transition"
                          >
                            Mark as Passed
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              updateCycleStatus(cycle.id, "Failed")
                            }
                            className="rounded-xl bg-red-600 text-white px-4 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-red-700 active:scale-95 transition"
                          >
                            Mark as Failed
                          </button>
                        </div>
                      )}

                      {cycle.status === "Failed" && (
                        <Link
                          href={`/investigation?cycle=${cycle.cycle_number}`}
                          className="inline-block mt-4 rounded-xl bg-red-600 text-white px-4 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-red-700 active:scale-95 transition"
                        >
                          Investigate Failed Cycle
                        </Link>
                      )}
                    </div>

                    <div className="shrink-0">
                      <QRCodeSVG value={cycle.cycle_number} size={90} />
                    </div>
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

function getStatusBadgeClass(status: string) {
  if (status === "Passed") {
    return "bg-green-100 text-green-700 border-green-200";
  }

  if (status === "Failed") {
    return "bg-red-100 text-red-700 border-red-200";
  }

  return "bg-yellow-100 text-yellow-700 border-yellow-200";
}

function getStateBadgeClass(state: string) {
  if (state === "Closed") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }

  return "bg-blue-100 text-blue-700 border-blue-200";
}