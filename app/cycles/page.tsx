"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";

type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  load_contents: string;
  status: string;
  created_at: string;
};

export default function CyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleCounter, setCycleCounter] = useState(1);

  const [form, setForm] = useState({
    sterilizer: "",
    operator: "",
    loadContents: "",
    status: "Passed",
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
      alert("Error loading cycles.");
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

  async function saveCycle() {
    if (!form.sterilizer || !form.operator || !form.loadContents) {
      alert("Please fill all required fields.");
      return;
    }

    const newCycleNumber = `STERI-${new Date().getFullYear()}-${String(
      cycleCounter
    ).padStart(4, "0")}`;

    const { error } = await supabase.from("cycles").insert([
      {
        cycle_number: newCycleNumber,
        sterilizer: form.sterilizer,
        operator: form.operator,
        load_contents: form.loadContents,
        status: form.status,
      },
    ]);

    if (error) {
      alert("Error saving cycle.");
      console.error(error);
      return;
    }

    setForm({
      sterilizer: "",
      operator: "",
      loadContents: "",
      status: "Passed",
    });

    fetchCycles();
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Sterilization Cycles</h1>
        <p className="mt-2 text-slate-600">
          Create and manage sterilization cycle records.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-3xl mb-8">
        <h2 className="text-2xl font-semibold mb-6">New Sterilization Cycle</h2>

        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">Clinic</label>
            <div className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-700">
              Dentaria
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Sterilizer</label>
            <input
              value={form.sterilizer}
              onChange={(e) => updateForm("sterilizer", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: Statim 5000 / Autoclave 1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Operator</label>
            <input
              value={form.operator}
              onChange={(e) => updateForm("operator", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Staff member name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Load Contents</label>
            <textarea
              value={form.loadContents}
              onChange={(e) => updateForm("loadContents", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 min-h-28"
              placeholder="Example: exam kits, surgical cassette, hygiene instruments..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Cycle Status</label>
            <select
              value={form.status}
              onChange={(e) => updateForm("status", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option>Passed</option>
              <option>Failed</option>
              <option>Pending</option>
            </select>
          </div>

          <button
            type="button"
            onClick={saveCycle}
            className="rounded-xl bg-slate-950 text-white px-6 py-3 font-medium"
          >
            Save Cycle
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-2xl font-semibold mb-4">Saved Cycles</h2>

        {cycles.length === 0 ? (
          <p className="text-slate-500">No cycles saved yet.</p>
        ) : (
          <div className="space-y-3">
            {cycles.map((cycle) => (
              <div
                key={cycle.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="flex justify-between">
                      <h3 className="font-semibold">{cycle.cycle_number}</h3>
                     <span
  className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
    cycle.status
  )}`}
>
  {cycle.status}
</span>
                    </div>

                    <p className="text-sm text-slate-600 mt-1">
                      {cycle.sterilizer} · Operator: {cycle.operator}
                    </p>

                    <p className="text-sm text-slate-500 mt-2">
                      {cycle.load_contents}
                    </p>

                    <p className="text-xs text-slate-400 mt-3">
                      Created: {new Date(cycle.created_at).toLocaleString()}
                    </p>
                    {cycle.status === "Failed" && (
  <Link
    href={`/investigation?cycle=${cycle.cycle_number}`}
    className="inline-block mt-4 rounded-xl bg-red-600 text-white px-4 py-2 text-sm font-medium"
  >
    Investigate Failed Cycle
  </Link>
)}
                  </div>

                  <QRCodeSVG value={cycle.cycle_number} size={90} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
  function getStatusBadgeClass(status: string) {
  if (status === "Passed") {
    return "bg-green-100 text-green-700 border-green-200";
  }

  if (status === "Failed") {
    return "bg-red-100 text-red-700 border-red-200";
  }

  return "bg-yellow-100 text-yellow-700 border-yellow-200";
}
}