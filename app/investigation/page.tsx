"use client";


import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
};

type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  pack_number: string;
  procedure: string;
};

export default function InvestigationPage() {
  const [cycleNumber, setCycleNumber] = useState("");
  const [packs, setPacks] = useState<Pack[]>([]);
  const [patients, setPatients] = useState<PatientTrace[]>([]);
  const [searched, setSearched] = useState(false);
const [loading, setLoading] = useState(false);

 useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const cycle = params.get("cycle");

  if (cycle) {
    setCycleNumber(cycle);
    investigateCycle(cycle);
  }
}, []);

  async function investigateCycle(selectedCycle?: string) {
  const cycleToInvestigate = selectedCycle || cycleNumber;
  setLoading(true);

  if (!cycleToInvestigate) {
    toast.error("Please enter a cycle number.");
    return;
  }

  setSearched(true);

  const { data: packsData, error: packsError } = await supabase
    .from("packs")
    .select("*")
    .eq("cycle_number", cycleToInvestigate);

  if (packsError) {
    toast.error("Error loading packs.");
    console.error(packsError);
    setLoading(false);
    return;
  }

  setPacks(packsData || []);

  if (!packsData || packsData.length === 0) {
    setPatients([]);
    toast.error("No linked packs found for this cycle.");
    setLoading(false);
    return;
  }

  const packNumbers = packsData.map((pack) => pack.pack_number);

  const { data: patientData, error: patientError } = await supabase
    .from("patient_traces")
    .select("*")
    .in("pack_number", packNumbers);

  if (patientError) {
    toast.error("Error loading patient records.");
    console.error(patientError);
     setLoading(false);
    return;
  }

  setPatients(patientData || []);
  toast.success("Investigation completed.");
  setLoading(false);
   
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Investigation</h1>

        <p className="mt-2 text-slate-600">
          Investigate sterilization cycles and trace linked packs and patients.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-6">
          Investigate Sterilization Cycle
        </h2>

        <div className="flex gap-4">
          <input
            value={cycleNumber}
            onChange={(e) => setCycleNumber(e.target.value)}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Example: STERI-2026-0001"
          />

          <button
  onClick={() => investigateCycle()}
  disabled={loading}
  className="rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
>
  {loading ? "Investigating..." : "Investigate"}
</button>
        </div>
      </section>

      {searched && (
        <>
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-4">
              Linked Instrument Packs
            </h2>

            {packs.length === 0 ? (
              <p className="text-slate-500">
                No linked packs found for this cycle.
              </p>
            ) : (
              <div className="space-y-3">
                {packs.map((pack) => (
                  <div
                    key={pack.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex justify-between">
                      <h3 className="font-semibold">{pack.pack_number}</h3>

                      <span className="text-sm text-slate-500">
                        {pack.pack_type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-2xl font-semibold mb-4">
              Linked Patient Records
            </h2>

            {patients.length === 0 ? (
              <p className="text-slate-500">
                No linked patients found.
              </p>
            ) : (
              <div className="space-y-3">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex justify-between">
                      <h3 className="font-semibold">
                        {patient.patient_name}
                      </h3>

                      <span className="text-sm text-slate-500">
                        {patient.pack_number}
                      </span>
                    </div>

                    <p className="text-sm text-slate-600 mt-1">
                      {patient.provider} · {patient.treatment_room}
                    </p>

                    <p className="text-sm text-slate-500 mt-2">
                      Procedure: {patient.procedure}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}