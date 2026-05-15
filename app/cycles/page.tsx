"use client";

import { useState } from "react";

type Cycle = {
  id: string;
  sterilizer: string;
  cycleNumber: string;
  operator: string;
  loadContents: string;
  status: string;
  createdAt: string;
};

export default function CyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
const [cycleCounter, setCycleCounter] = useState(1);
  const [form, setForm] = useState({
    sterilizer: "",
    cycleNumber: "",
    operator: "",
    loadContents: "",
    status: "Passed",
  });

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function saveCycle() {
    if (
    !form.sterilizer ||
    !form.operator ||
    !form.loadContents
  ) {
    alert("Please fill all required fields.");
    return;
  }
    const newCycle: Cycle = {
      id: `CYC-${Date.now()}`,
      sterilizer: form.sterilizer,
      cycleNumber: `STERI-2026-${String(cycleCounter).padStart(4, "0")}`,
      operator: form.operator,
      loadContents: form.loadContents,
      status: form.status,
      createdAt: new Date().toLocaleString(),
    };

    setCycles((current) => [newCycle, ...current]);
    setCycleCounter((current) => current + 1);

    setForm({
      sterilizer: "",
      cycleNumber: "",
      operator: "",
      loadContents: "",
      status: "Passed",
    });
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
                <div className="flex justify-between">
                  <h3 className="font-semibold">{cycle.cycleNumber}</h3>
                  <span className="text-sm text-slate-500">{cycle.status}</span>
                </div>

                <p className="text-sm text-slate-600 mt-1">
                  {cycle.sterilizer} · Operator: {cycle.operator}
                </p>

                <p className="text-sm text-slate-500 mt-2">
                  {cycle.loadContents}
                </p>
                <p className="text-xs text-slate-400 mt-3">
  Created: {cycle.createdAt}
</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}