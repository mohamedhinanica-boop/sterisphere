"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import {
  calculateExpectedPackCount,
  createCycle as createCycleService,
  reviewCycle,
} from "@/lib/modules/cycles";
import {
  LoadItem,
  Cycle,
  Sterilizer,
  PageHeader,
  StartCycleForm,
  RunningCyclesSection,
  SavedCyclesSection,
} from "@/components/cycles";

export default function CyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [sterilizers, setSterilizers] = useState<Sterilizer[]>([]);
  const [cycleCounter, setCycleCounter] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [now, setNow] = useState(new Date());

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
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

  const expectedPackCount = calculateExpectedPackCount(loadItems);

  async function startCycle() {
    const selectedSterilizer = form.sterilizer.trim();

    if (!selectedSterilizer) {
      toast.error("Please select a sterilizer.");
      return;
    }

    setLoading(true);

    try {
      await createCycleService({
        sterilizer: selectedSterilizer,
        loadNotes: form.loadNotes,
        durationMinutes: form.durationMinutes,
        loadItems,
        cycleCounter,
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error starting cycle.";

      toast.error(message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function updateCycleStatus(cycleId: string, newStatus: string) {
    const cycle = cycles.find((item) => item.id === cycleId);

    if (!cycle) {
      toast.error("Cycle not found.");
      return;
    }

    setLoading(true);

    try {
      const result = await reviewCycle(cycle, newStatus);

      await fetchCycles();

      if (result.status === "Passed") {
        toast.success(
          `Cycle marked as Passed. ${result.generatedPackCount} packs were created automatically.`
        );
        return;
      }

      if (result.status === "Failed") {
        toast.error("Cycle marked as Failed and closed.");
      } else {
        toast.success(`Cycle marked as ${result.status}.`);
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

  const runningCycles = cycles.filter(
    (cycle) => cycle.status === "Pending" && (cycle.cycle_state || "Open") === "Open"
  );

  return (
    <>
      <PageHeader />

      <StartCycleForm
        form={form}
        sterilizers={sterilizers}
        loadItems={loadItems}
        expectedPackCount={expectedPackCount}
        loading={loading}
        updateForm={updateForm}
        updateLoadItem={updateLoadItem}
        addLoadItem={addLoadItem}
        removeLoadItem={removeLoadItem}
        startCycle={startCycle}
      />

      <RunningCyclesSection
        runningCycles={runningCycles}
        now={now}
        loading={loading}
        fetchCycles={fetchCycles}
      />

      <SavedCyclesSection
        cycles={cycles}
        filteredCycles={filteredCycles}
        paginatedCycles={paginatedCycles}
        statusFilter={statusFilter}
        stateFilter={stateFilter}
        searchTerm={searchTerm}
        currentPage={currentPage}
        totalPages={totalPages}
        loading={loading}
        now={now}
        setStatusFilter={setStatusFilter}
        setStateFilter={setStateFilter}
        setSearchTerm={setSearchTerm}
        setCurrentPage={setCurrentPage}
        updateCycleStatus={updateCycleStatus}
      />
    </>
  );
}
