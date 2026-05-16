"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  status: string;
  created_at: string;
};

type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  created_at: string;
};

type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  pack_number: string;
  procedure: string;
  created_at: string;
};

export default function ReportsPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [patientTraces, setPatientTraces] = useState<PatientTrace[]>([]);

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    const { data: cyclesData } = await supabase
      .from("cycles")
      .select("id, cycle_number, sterilizer, operator, status, created_at")
      .order("created_at", { ascending: false });

    const { data: packsData } = await supabase
      .from("packs")
      .select("id, pack_number, cycle_number, pack_type, created_at")
      .order("created_at", { ascending: false });

    const { data: tracesData } = await supabase
      .from("patient_traces")
      .select(
        "id, patient_name, provider, treatment_room, pack_number, procedure, created_at"
      )
      .order("created_at", { ascending: false });

    setCycles(cyclesData || []);
    setPacks(packsData || []);
    setPatientTraces(tracesData || []);
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Reports</h1>
        <p className="mt-2 text-slate-600">
          Audit overview of sterilization cycles, instrument packs, and patient
          traceability records.
        </p>
        <button
  onClick={() => window.print()}
  className="mt-4 rounded-xl bg-slate-950 text-white px-5 py-3 font-medium"
>
  Print / Save as PDF
</button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <ReportCard title="Sterilization Cycles" value={cycles.length} />
        <ReportCard title="Instrument Packs" value={packs.length} />
        <ReportCard title="Patient Records" value={patientTraces.length} />
      </div>

      <ReportSection title="Sterilization Cycles">
        {cycles.map((cycle) => (
          <div key={cycle.id} className="border-b border-slate-200 py-3">
            <div className="flex justify-between">
              <p className="font-medium">{cycle.cycle_number}</p>
              <span
  className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
    cycle.status
  )}`}
>
  {cycle.status}
</span>
            </div>
            <p className="text-sm text-slate-600">
              {cycle.sterilizer} · Operator: {cycle.operator}
            </p>
            <p className="text-xs text-slate-400">
              {new Date(cycle.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </ReportSection>

      <ReportSection title="Instrument Packs">
        {packs.map((pack) => (
          <div key={pack.id} className="border-b border-slate-200 py-3">
            <div className="flex justify-between">
              <p className="font-medium">{pack.pack_number}</p>
              <span className="text-sm text-slate-500">{pack.pack_type}</span>
            </div>
            <p className="text-sm text-slate-600">
              Linked cycle: {pack.cycle_number}
            </p>
            <p className="text-xs text-slate-400">
              {new Date(pack.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </ReportSection>

      <ReportSection title="Patient Traceability Records">
        {patientTraces.map((record) => (
          <div key={record.id} className="border-b border-slate-200 py-3">
            <div className="flex justify-between">
              <p className="font-medium">{record.patient_name}</p>
              <span className="text-sm text-slate-500">
                {record.pack_number}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              {record.provider} · {record.treatment_room} · {record.procedure}
            </p>
            <p className="text-xs text-slate-400">
              {new Date(record.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </ReportSection>
    </>
  );
}

function ReportCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
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
