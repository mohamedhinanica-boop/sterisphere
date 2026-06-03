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
  duration_minutes: number | null;
  expected_finish_at: string | null;
  created_at: string;
};

type Sterilizer = {
  id: string;
  name: string;
  type: string | null;
  active: boolean;
};

type LoadItem = {
  packType: string;
  quantity: string;
};

type SavedLoadItem = {
  id: string;
  cycle_id: string;
  pack_type: string;
  quantity: number;
};

const packTypeOptions = [
  "Instrument Pouch",
  "Cassette",
  "Surgical Kit",
  "Hygiene Kit",
  "Exam Kit",
];

export default function CyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [sterilizers, setSterilizers] = useState<Sterilizer[]>([]);
  const [cycleCounter, setCycleCounter] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 5;

  const [form, setForm] = useState({
    sterilizer: "",
    loadNotes: "",
    durationMinutes: "20",
  });

  const [loadItems, setLoadItems] = useState<LoadItem[]>([
    {
      packType: "Exam Kit",
      quantity: "1",
    },
  ]);

  useEffect(() => {
    fetchCycles();
    fetchSterilizers();
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

  async function fetchSterilizers() {
    const { data, error } = await supabase
      .from("sterilizers")
      .select("id, name, type, active")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      toast.error("Error loading sterilizers.");
      console.error(error);
      return;
    }

    setSterilizers(data || []);
  }

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateLoadItem(index: number, field: keyof LoadItem, value: string) {
    setLoadItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function addLoadItem() {
    setLoadItems((current) => [
      ...current,
      {
        packType: "Exam Kit",
        quantity: "1",
      },
    ]);
  }

  function removeLoadItem(index: number) {
    setLoadItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  const expectedPackCount = loadItems.reduce((total, item) => {
    const quantity = Number(item.quantity);
    return total + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);

  function buildLoadSummary() {
    const composition = loadItems
      .map((item) => `${item.packType} × ${item.quantity}`)
      .join(", ");

    if (form.loadNotes.trim()) {
      return `${composition}. Notes: ${form.loadNotes.trim()}`;
    }

    return composition;
  }

  async function getNextPackNumberSequence(totalNeeded: number) {
    const currentYear = new Date().getFullYear();
    const prefix = `PACK-${currentYear}-`;

    const { data, error } = await supabase
      .from("packs")
      .select("pack_number")
      .like("pack_number", `${prefix}%`);

    if (error) {
      throw error;
    }

    const maxExistingNumber =
      data?.reduce((max, pack) => {
        const numericPart = Number(pack.pack_number.replace(prefix, ""));
        return Number.isFinite(numericPart) && numericPart > max
          ? numericPart
          : max;
      }, 0) || 0;

    return Array.from({ length: totalNeeded }, (_, index) => {
      const nextNumber = maxExistingNumber + index + 1;
      return `${prefix}${String(nextNumber).padStart(4, "0")}`;
    });
  }

  function buildPackGenerationItems(items: SavedLoadItem[]) {
    const cycleLoadSummary = items
      .map((item) => `${item.pack_type} × ${item.quantity}`)
      .join(", ");

    const cyclePackTotal = items.reduce(
      (total, item) => total + item.quantity,
      0
    );

    const packItems = items.flatMap((item) =>
      Array.from({ length: item.quantity }, (_, index) => ({
        packType: item.pack_type,
        loadItemIndex: index + 1,
        loadItemTotal: item.quantity,
        cyclePackTotal,
        cycleLoadSummary,
      }))
    );

    return {
      packItems,
      cyclePackTotal,
      cycleLoadSummary,
    };
  }

  async function startCycle() {
    if (!form.sterilizer) {
      toast.error("Please select a sterilizer.");
      return;
    }

    const durationMinutes = Number(form.durationMinutes);

    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      toast.error("Please enter a valid cycle duration.");
      return;
    }

    if (loadItems.length === 0) {
      toast.error("Please add at least one load item.");
      return;
    }

    for (const item of loadItems) {
      const quantity = Number(item.quantity);

      if (!item.packType || !Number.isInteger(quantity) || quantity <= 0) {
        toast.error("Each load item must have a valid pack type and quantity.");
        return;
      }
    }

    if (expectedPackCount <= 0) {
      toast.error("Expected pack count must be greater than zero.");
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
    const loadSummary = buildLoadSummary();

    const expectedFinish = new Date();
    expectedFinish.setMinutes(expectedFinish.getMinutes() + durationMinutes);

    const { data: newCycle, error: cycleError } = await supabase
      .from("cycles")
      .insert([
        {
          cycle_number: newCycleNumber,
          sterilizer: form.sterilizer,
          operator: operatorEmail,
          load_contents: loadSummary,
          duration_minutes: durationMinutes,
          expected_finish_at: expectedFinish.toISOString(),
          status: "Pending",
          cycle_state: "Open",
          expected_pack_count: expectedPackCount,
          created_by: operatorEmail,
        },
      ])
      .select()
      .single();

    if (cycleError || !newCycle) {
      toast.error("Error starting cycle.");
      console.error(cycleError);
      setLoading(false);
      return;
    }

    const loadRows = loadItems.map((item) => ({
      cycle_id: newCycle.id,
      pack_type: item.packType,
      quantity: Number(item.quantity),
    }));

    const { error: loadItemsError } = await supabase
      .from("load_items")
      .insert(loadRows);

    if (loadItemsError) {
      await supabase.from("cycles").delete().eq("id", newCycle.id);

      toast.error("Error saving load composition.");
      console.error(loadItemsError);
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
        duration_minutes: durationMinutes,
        expected_finish_at: expectedFinish.toISOString(),
        load_items: loadRows,
      },
    });

    setForm({
      sterilizer: "",
      loadNotes: "",
      durationMinutes: "20",
    });

    setLoadItems([
      {
        packType: "Exam Kit",
        quantity: "1",
      },
    ]);

    await fetchCycles();

    toast.success("Sterilization cycle started with duration tracking.");
    setLoading(false);
  }

  async function generatePacksForPassedCycle(cycle: Cycle) {
    const { data: existingPacks, error: existingPacksError } = await supabase
      .from("packs")
      .select("id")
      .eq("cycle_id", cycle.id);

    if (existingPacksError) {
      throw existingPacksError;
    }

    if ((existingPacks || []).length > 0) {
      throw new Error("Packs have already been generated for this cycle.");
    }

    const { data: savedLoadItems, error: loadItemsError } = await supabase
      .from("load_items")
      .select("id, cycle_id, pack_type, quantity")
      .eq("cycle_id", cycle.id);

    if (loadItemsError) {
      throw loadItemsError;
    }

    if (!savedLoadItems || savedLoadItems.length === 0) {
      throw new Error("No load composition found for this cycle.");
    }

    const { packItems, cyclePackTotal, cycleLoadSummary } =
      buildPackGenerationItems(savedLoadItems);

    if (packItems.length === 0) {
      throw new Error("Load composition does not contain valid quantities.");
    }

    const packNumbers = await getNextPackNumberSequence(packItems.length);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const createdBy = user?.email || "unknown";

    const sterilizedAt = new Date();

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const packRows = packItems.map((item, index) => ({
      pack_number: packNumbers[index],
      cycle_id: cycle.id,
      cycle_number: cycle.cycle_number,
      pack_type: item.packType,
      contents: item.packType,
      status: "Available",
      created_by: createdBy,
      sterilized_at: sterilizedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      load_item_index: item.loadItemIndex,
      load_item_total: item.loadItemTotal,
      cycle_pack_total: cyclePackTotal,
      cycle_load_summary: cycleLoadSummary,
    }));

    const { data: createdPacks, error: packsError } = await supabase
      .from("packs")
      .insert(packRows)
      .select();

    if (packsError) {
      throw packsError;
    }

    await createAuditLog({
      action: "packs_auto_generated",
      entityType: "cycle",
      entityId: cycle.id,
      description: `Generated ${packRows.length} packs from cycle ${cycle.cycle_number}`,
      metadata: {
        cycle_number: cycle.cycle_number,
        generated_count: packRows.length,
        cycle_pack_total: cyclePackTotal,
        cycle_load_summary: cycleLoadSummary,
        packs: packRows.map((pack) => ({
          pack_number: pack.pack_number,
          pack_type: pack.pack_type,
        })),
      },
    });

    await Promise.all(
      (createdPacks || []).map((pack) =>
        createAuditLog({
          action: "pack_created",
          entityType: "pack",
          entityId: pack.id,
          description: `Auto-created pack ${pack.pack_number} from cycle ${cycle.cycle_number}`,
          metadata: {
            pack_number: pack.pack_number,
            cycle_number: pack.cycle_number,
            pack_type: pack.pack_type,
            status: pack.status,
            source: "auto_generated_from_passed_cycle",
          },
        })
      )
    );

    return packRows.length;
  }

  async function updateCycleStatus(cycleId: string, newStatus: string) {
    const cycle = cycles.find((item) => item.id === cycleId);

    if (!cycle) {
      toast.error("Cycle not found.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const completedBy = user?.email || "unknown";
    const completedAt = new Date().toISOString();

    try {
      if (newStatus === "Passed") {
        const generatedPackCount = await generatePacksForPassedCycle(cycle);

        const { error } = await supabase
          .from("cycles")
          .update({
            status: "Passed",
            cycle_state: "Closed",
            expected_pack_count: generatedPackCount,
            released_by: completedBy,
            released_at: completedAt,
          })
          .eq("id", cycleId);

        if (error) {
          throw error;
        }

        await createAuditLog({
          action: "cycle_passed",
          entityType: "cycle",
          entityId: cycleId,
          description: `Cycle ${cycle.cycle_number} passed and ${generatedPackCount} packs were generated`,
          metadata: {
            cycle_number: cycle.cycle_number,
            new_status: "Passed",
            cycle_state: "Closed",
            completed_by: completedBy,
            completed_at: completedAt,
            generated_pack_count: generatedPackCount,
          },
        });

        await fetchCycles();

        toast.success(
          `Cycle marked as Passed. ${generatedPackCount} packs were created automatically.`
        );

        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("cycles")
        .update({
          status: newStatus,
          cycle_state: "Closed",
          released_by: completedBy,
          released_at: completedAt,
        })
        .eq("id", cycleId);

      if (error) {
        throw error;
      }

      await createAuditLog({
        action: "cycle_status_updated",
        entityType: "cycle",
        entityId: cycleId,
        description: `Cycle status updated to ${newStatus}`,
        metadata: {
          cycle_number: cycle.cycle_number,
          new_status: newStatus,
          cycle_state: "Closed",
          completed_by: completedBy,
          completed_at: completedAt,
        },
      });

      await fetchCycles();

      if (newStatus === "Failed") {
        toast.error("Cycle marked as Failed and closed.");
      } else {
        toast.success(`Cycle marked as ${newStatus}.`);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error updating cycle status.";

      toast.error(message);
      console.error(error);
    } finally {
      setLoading(false);
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
      cycleState.toLowerCase().includes(search) ||
      cycle.load_contents.toLowerCase().includes(search);

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
          Start sterilization cycles with load composition, duration tracking,
          and automatic pack generation when a cycle passes.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-4xl mb-8">
        <h2 className="text-2xl font-semibold mb-2">
          Start Sterilization Cycle
        </h2>

        <p className="text-sm text-slate-600 mb-6">
          Add the load composition and duration before starting the cycle. The
          expected finish time will be calculated automatically.
        </p>

        <form className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Sterilizer
            </label>

            <select
              value={form.sterilizer}
              onChange={(e) => updateForm("sterilizer", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">
                {sterilizers.length === 0
                  ? "No active sterilizers available"
                  : "Select a sterilizer"}
              </option>

              {sterilizers.map((sterilizer) => (
                <option key={sterilizer.id} value={sterilizer.name}>
                  {sterilizer.name}
                  {sterilizer.type ? ` · ${sterilizer.type}` : ""}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs text-slate-500">
              Only active sterilizers are available for cycle creation.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Cycle Duration
            </label>

            <input
              type="number"
              min="1"
              value={form.durationMinutes}
              onChange={(e) => updateForm("durationMinutes", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: 20"
            />

            <p className="mt-2 text-xs text-slate-500">
              Enter the duration programmed on the sterilizer. SteriSphere will
              calculate the expected finish time.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold">Load Composition</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Define what will be released as packs after this cycle.
                </p>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                Expected packs: {expectedPackCount}
              </div>
            </div>

            <div className="space-y-3">
              {loadItems.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3"
                >
                  <select
                    value={item.packType}
                    onChange={(e) =>
                      updateLoadItem(index, "packType", e.target.value)
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    {packTypeOptions.map((packType) => (
                      <option key={packType} value={packType}>
                        {packType}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateLoadItem(index, "quantity", e.target.value)
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                    placeholder="Qty"
                  />

                  <button
                    type="button"
                    onClick={() => removeLoadItem(index)}
                    disabled={loadItems.length === 1}
                    className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium cursor-pointer hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addLoadItem}
              className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium cursor-pointer hover:bg-slate-50"
            >
              Add Load Item
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Optional Load Notes
            </label>

            <textarea
              value={form.loadNotes}
              onChange={(e) => updateForm("loadNotes", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 min-h-24"
              placeholder="Optional notes about this load..."
            />
          </div>

          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            This cycle will be created as <strong>Pending</strong> and{" "}
            <strong>Open</strong>. When marked as <strong>Passed</strong>, packs
            will be created automatically and the cycle will close.
          </div>

          <button
            type="button"
            onClick={startCycle}
            disabled={loading || sterilizers.length === 0}
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

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-sm text-slate-500">
                        <p>
                          Generated packs:{" "}
                          <span className="font-medium text-slate-700">
                            {cycle.expected_pack_count || "N/A"}
                          </span>
                        </p>

                        <p>
                          Duration:{" "}
                          <span className="font-medium text-slate-700">
                            {cycle.duration_minutes
                              ? `${cycle.duration_minutes} min`
                              : "N/A"}
                          </span>
                        </p>

                        <p>
                          Expected finish:{" "}
                          <span className="font-medium text-slate-700">
                            {formatDateTime(cycle.expected_finish_at)}
                          </span>
                        </p>
                      </div>

                      <p className="text-xs text-slate-400 mt-3">
                        Created: {new Date(cycle.created_at).toLocaleString()}
                      </p>

                      {cycle.status === "Pending" && (
                        <div className="flex flex-col md:flex-row gap-3 mt-4">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() =>
                              updateCycleStatus(cycle.id, "Passed")
                            }
                            className="rounded-xl bg-green-600 text-white px-4 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-green-700 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Mark as Passed + Generate Packs
                          </button>

                          <button
                            type="button"
                            disabled={loading}
                            onClick={() =>
                              updateCycleStatus(cycle.id, "Failed")
                            }
                            className="rounded-xl bg-red-600 text-white px-4 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-red-700 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
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

function formatDateTime(date: string | null) {
  if (!date) {
    return "N/A";
  }

  return new Date(date).toLocaleString();
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