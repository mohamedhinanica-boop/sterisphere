"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";

type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  contents: string;
  created_at: string;
};

type Cycle = {
  id: string;
  cycle_number: string;
};

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [packCounter, setPackCounter] = useState(1);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    cycleNumber: "",
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
      alert("Error loading packs.");
      console.error(error);
      return;
    }

    setPacks(data || []);
    setPackCounter((data?.length || 0) + 1);
  }

  async function fetchCycles() {
    const { data, error } = await supabase
      .from("cycles")
    .select("id, cycle_number")
.eq("status", "Passed")
.order("created_at", { ascending: false });

    if (error) {
      alert("Error loading cycles.");
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
    if (!form.cycleNumber || !form.packType || !form.contents) {
      alert("Please fill all required fields.");
      return;
    }

    setLoading(true);

    const newPackNumber = `PACK-${new Date().getFullYear()}-${String(
      packCounter
    ).padStart(4, "0")}`;

    const { error } = await supabase.from("packs").insert([
      {
        pack_number: newPackNumber,
        cycle_number: form.cycleNumber,
        pack_type: form.packType,
        contents: form.contents,
      },
    ]);

    if (error) {
      alert("Error saving pack.");
      console.error(error);
      setLoading(false);
      return;
    }

    setForm({
      cycleNumber: "",
      packType: "Instrument Pouch",
      contents: "",
    });

    await fetchPacks();
    setLoading(false);
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Instrument Packs</h1>
        <p className="mt-2 text-slate-600">
          Create QR-coded instrument packs and link them to sterilization cycles.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-3xl mb-8">
        <h2 className="text-2xl font-semibold mb-6">New Instrument Pack</h2>

        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">
              Sterilization Cycle ID
            </label>
            <select
              value={form.cycleNumber}
              onChange={(e) => updateForm("cycleNumber", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Select a sterilization cycle</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.cycle_number}>
                  {cycle.cycle_number}
                </option>
              ))}
            </select>
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
            disabled={loading}
            className="rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Save Pack"}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-2xl font-semibold mb-4">Saved Packs</h2>

        {packs.length === 0 ? (
          <p className="text-slate-500">No packs saved yet.</p>
        ) : (
          <div className="space-y-3">
            {packs.map((pack) => (
              <div key={pack.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{pack.pack_number}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {pack.pack_type} · Cycle: {pack.cycle_number}
                    </p>
                    <p className="text-sm text-slate-500 mt-2">{pack.contents}</p>
                    <p className="text-xs text-slate-400 mt-3">
                      Created: {new Date(pack.created_at).toLocaleString()}
                    </p>
                  </div>

                  <QRCodeSVG value={pack.pack_number} size={90} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}