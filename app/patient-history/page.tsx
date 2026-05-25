"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";

type Patient = {
  id: string;
  full_name: string;
  external_id: string | null;
};

type PatientHistoryRecord = {
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
  cycle_number: string;
};

type Cycle = {
  cycle_number: string;
  status: string;
  sterilizer: string;
};

export default function PatientHistoryPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [history, setHistory] = useState<PatientHistoryRecord[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPatients();
  }, []);

  async function fetchPatients() {
    const { data, error } = await supabase
      .from("patients")
      .select("id, full_name, external_id")
      .order("full_name", { ascending: true });

    if (error) {
      toast.error("Error loading patients.");
      console.error(error);
      return;
    }

    setPatients(data || []);
  }

  async function loadHistory(patientId: string) {
    setLoading(true);

    const patient = patients.find((p) => p.id === patientId);

    if (!patient) {
      toast.error("Patient not found.");
      setLoading(false);
      return;
    }

    const { data: traceData, error: traceError } = await supabase
      .from("patient_traces")
      .select("*")
      .eq("patient_name", patient.full_name)
      .order("created_at", { ascending: false });

    if (traceError) {
      toast.error("Error loading patient history.");
      console.error(traceError);
      setLoading(false);
      return;
    }

    const packNumbers = (traceData || []).map(
      (record) => record.pack_number
    );

    const { data: packData } = await supabase
      .from("packs")
      .select("id, pack_number, cycle_number")
      .in("pack_number", packNumbers);

    const cycleNumbers = (packData || []).map(
      (pack) => pack.cycle_number
    );

    const { data: cycleData } = await supabase
      .from("cycles")
      .select("cycle_number, status, sterilizer")
      .in("cycle_number", cycleNumbers);

    setHistory(traceData || []);
    setPacks(packData || []);
    setCycles(cycleData || []);

    setLoading(false);
  }

  const filteredPatients = patients.filter((patient) => {
    const value = search.toLowerCase();

    return (
      patient.full_name.toLowerCase().includes(value) ||
      (patient.external_id || "").toLowerCase().includes(value)
    );
  });

  function getPack(packNumber: string) {
    return packs.find((pack) => pack.pack_number === packNumber);
  }

  function getCycle(cycleNumber: string) {
    return cycles.find(
      (cycle) => cycle.cycle_number === cycleNumber
    );
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Patient History</h1>

        <p className="mt-2 text-slate-600">
          Review sterilization traceability history linked to patients.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-6">
          Search Patient
        </h2>

        <div className="space-y-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Search by patient name or file ID"
          />

          <select
            value={selectedPatient}
            onChange={(e) => {
              setSelectedPatient(e.target.value);
              loadHistory(e.target.value);
            }}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="">Select patient</option>

            {filteredPatients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name}
                {patient.external_id
                  ? ` (${patient.external_id})`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <h2 className="text-2xl font-semibold">
            Patient Traceability History
          </h2>

          <button
            onClick={() => window.print()}
            className="rounded-xl bg-slate-950 text-white px-5 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-slate-800 active:scale-95 transition"
          >
            Print History
          </button>
        </div>

        {loading ? (
          <p className="text-slate-500">
            Loading patient history...
          </p>
        ) : history.length === 0 ? (
          <p className="text-slate-500">
            No patient history found.
          </p>
        ) : (
          <div className="space-y-4">
            {history.map((record) => {
              const linkedPack = getPack(record.pack_number);
              const linkedCycle = linkedPack
                ? getCycle(linkedPack.cycle_number)
                : null;

              return (
                <div
                  key={record.id}
                  className="rounded-xl border border-slate-200 p-5"
                >
                  <div className="flex flex-col md:flex-row md:justify-between gap-2">
                    <h3 className="font-semibold">
                      {record.patient_name}
                    </h3>

                    <span className="text-sm text-slate-500">
                      {record.pack_number}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>
                      <strong>Procedure:</strong>{" "}
                      {record.procedure}
                    </p>

                    <p>
                      <strong>Provider:</strong>{" "}
                      {record.provider}
                    </p>

                    <p>
                      <strong>Treatment room:</strong>{" "}
                      {record.treatment_room}
                    </p>

                    <p>
                      <strong>Linked cycle:</strong>{" "}
                      {linkedPack?.cycle_number || "Unknown"}
                    </p>

                    <p>
                      <strong>Cycle status:</strong>{" "}
                      {linkedCycle?.status || "Unknown"}
                    </p>

                    <p>
                      <strong>Sterilizer:</strong>{" "}
                      {linkedCycle?.sterilizer || "Unknown"}
                    </p>

                    <p className="text-xs text-slate-400 pt-2">
                      {new Date(
                        record.created_at
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}