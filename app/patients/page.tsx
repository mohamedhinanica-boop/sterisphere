"use client";

import { useState } from "react";

type PatientTrace = {
  id: string;
  patientName: string;
  provider: string;
  treatmentRoom: string;
  packNumber: string;
  procedure: string;
  createdAt: string;
};

export default function PatientsPage() {
  const [records, setRecords] = useState<PatientTrace[]>([]);

  const [form, setForm] = useState({
    patientName: "",
    provider: "",
    treatmentRoom: "",
    packNumber: "",
    procedure: "",
  });

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function saveRecord() {
    if (
      !form.patientName ||
      !form.provider ||
      !form.treatmentRoom ||
      !form.packNumber ||
      !form.procedure
    ) {
      alert("Please fill all required fields.");
      return;
    }

    const newRecord: PatientTrace = {
      id: `TRACE-${Date.now()}`,
      patientName: form.patientName,
      provider: form.provider,
      treatmentRoom: form.treatmentRoom,
      packNumber: form.packNumber,
      procedure: form.procedure,
      createdAt: new Date().toLocaleString(),
    };

    setRecords((current) => [newRecord, ...current]);

    setForm({
      patientName: "",
      provider: "",
      treatmentRoom: "",
      packNumber: "",
      procedure: "",
    });
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Patient Traceability</h1>

        <p className="mt-2 text-slate-600">
          Link sterilized instrument packs to patients and procedures.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-3xl mb-8">
        <h2 className="text-2xl font-semibold mb-6">
          New Patient Traceability Record
        </h2>

        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">
              Patient Name
            </label>

            <input
              value={form.patientName}
              onChange={(e) => updateForm("patientName", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Patient full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Provider
            </label>

            <input
              value={form.provider}
              onChange={(e) => updateForm("provider", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: Dre Ola"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Treatment Room
            </label>

            <input
              value={form.treatmentRoom}
              onChange={(e) => updateForm("treatmentRoom", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: Room 2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Instrument Pack Number
            </label>

            <input
              value={form.packNumber}
              onChange={(e) => updateForm("packNumber", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: PACK-2026-0001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Procedure
            </label>

            <input
              value={form.procedure}
              onChange={(e) => updateForm("procedure", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: Hygiene cleaning / Extraction / Exam"
            />
          </div>

          <button
            type="button"
            onClick={saveRecord}
            className="rounded-xl bg-slate-950 text-white px-6 py-3 font-medium"
          >
            Save Traceability Record
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-2xl font-semibold mb-4">
          Saved Traceability Records
        </h2>

        {records.length === 0 ? (
          <p className="text-slate-500">
            No patient traceability records yet.
          </p>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div
                key={record.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex justify-between">
                  <h3 className="font-semibold">{record.patientName}</h3>

                  <span className="text-sm text-slate-500">
                    {record.packNumber}
                  </span>
                </div>

                <p className="text-sm text-slate-600 mt-1">
                  Provider: {record.provider} · {record.treatmentRoom}
                </p>

                <p className="text-sm text-slate-500 mt-2">
                  Procedure: {record.procedure}
                </p>

                <p className="text-xs text-slate-400 mt-3">
                  Created: {record.createdAt}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}