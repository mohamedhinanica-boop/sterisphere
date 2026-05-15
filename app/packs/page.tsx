"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Pack = {
  id: string;
  packNumber: string;
  cycleNumber: string;
  packType: string;
  contents: string;
  createdAt: string;
};

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packCounter, setPackCounter] = useState(1);

  const [form, setForm] = useState({
    cycleNumber: "",
    packType: "Instrument Pouch",
    contents: "",
  });

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function savePack() {
    if (!form.cycleNumber || !form.packType || !form.contents) {
      alert("Please fill all required fields.");
      return;
    }

    const newPack: Pack = {
      id: `PACK-${Date.now()}`,
      packNumber: `PACK-${new Date().getFullYear()}-${String(packCounter).padStart(4, "0")}`,
      cycleNumber: form.cycleNumber,
      packType: form.packType,
      contents: form.contents,
      createdAt: new Date().toLocaleString(),
    };

    setPacks((current) => [newPack, ...current]);
    setPackCounter((current) => current + 1);

    setForm({
      cycleNumber: "",
      packType: "Instrument Pouch",
      contents: "",
    });
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
            <input
              value={form.cycleNumber}
              onChange={(e) => updateForm("cycleNumber", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: STERI-2026-0001"
            />
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
            className="rounded-xl bg-slate-950 text-white px-6 py-3 font-medium"
          >
            Save Pack
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
                    <h3 className="font-semibold">{pack.packNumber}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {pack.packType} · Cycle: {pack.cycleNumber}
                    </p>
                    <p className="text-sm text-slate-500 mt-2">{pack.contents}</p>
                    <p className="text-xs text-slate-400 mt-3">
                      Created: {pack.createdAt}
                    </p>
                  </div>

                  <QRCodeSVG value={pack.packNumber} size={90} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}