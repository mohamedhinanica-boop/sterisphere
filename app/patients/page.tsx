"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  pack_number: string;
  procedure: string;
  created_at: string;
};

type Pack = {
  id: string;
  pack_number: string;
};

export default function PatientsPage() {
  const [records, setRecords] = useState<PatientTrace[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);

  const [form, setForm] = useState({
    patientName: "",
    provider: "",
    treatmentRoom: "",
    packNumber: "",
    procedure: "",
  });

  useEffect(() => {
    fetchRecords();
    fetchPacks();
  }, []);

  async function fetchRecords() {
    const { data, error } = await supabase
      .from("patient_traces")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert("Error loading patient traceability records.");
      console.error(error);
      return;
    }

    setRecords(data || []);
  }

  async function fetchPacks() {
    const { data, error } = await supabase
      .from("packs")
      .select("id, pack_number")
      .order("created_at", { ascending: false });

    if (error) {
      alert("Error loading packs.");
      console.error(error);
      return;
    }

    setPacks(data || []);
  }

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveRecord() {
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

    const { error } = await supabase.from("patient_traces").insert([
      {
        patient_name: form.patientName,
        provider: form.provider,
        treatment_room: form.treatmentRoom,
        pack_number: form.packNumber,
        procedure: form.procedure,
      },
    ]);

    if (error) {
      alert("Error saving traceability record.");
      console.error(error);
      return;
    }

    setForm({
      patientName: "",
      provider: "",
      treatmentRoom: "",
      packNumber: "",
      procedure: "",
    });

    fetchRecords();
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
            <label className="block text-sm font-medium mb-2">Provider</label>
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
            <select
              value={form.packNumber}
              onChange={(e) => updateForm("packNumber", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Select an instrument pack</option>
              {packs.map((pack) => (
                <option key={pack.id} value={pack.pack_number}>
                  {pack.pack_number}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Procedure</label>
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
          <p className="text-slate-500">No patient traceability records yet.</p>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div
                key={record.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex justify-between">
                  <h3 className="font-semibold">{record.patient_name}</h3>
                  <span className="text-sm text-slate-500">
                    {record.pack_number}
                  </span>
                </div>

                <p className="text-sm text-slate-600 mt-1">
                  Provider: {record.provider} · {record.treatment_room}
                </p>

                <p className="text-sm text-slate-500 mt-2">
                  Procedure: {record.procedure}
                </p>

                <p className="text-xs text-slate-400 mt-3">
                  Created: {new Date(record.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}