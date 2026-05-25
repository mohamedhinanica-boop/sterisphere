"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  FileText,
  PackageCheck,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  status: string;
  created_at: string;
};

type PatientTrace = {
  id: string;
  patient_id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  pack_number: string;
  procedure: string;
  created_at: string;
};

export default function Home() {
  const [cyclesCount, setCyclesCount] = useState(0);
  const [packsCount, setPacksCount] = useState(0);
  const [patientRecordsCount, setPatientRecordsCount] = useState(0);
  const [failedCyclesCount, setFailedCyclesCount] = useState(0);
  const [pendingCyclesCount, setPendingCyclesCount] = useState(0);
  const [latestFailedCycles, setLatestFailedCycles] = useState<Cycle[]>([]);
  const [latestPatientRecords, setLatestPatientRecords] = useState<
    PatientTrace[]
  >([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    const { count: cycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true });

    const { count: packs } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true });

    const { count: patientRecords } = await supabase
      .from("patient_traces")
      .select("*", { count: "exact", head: true });

    const { count: failedCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("status", "Failed");

    const { count: pendingCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("status", "Pending");

    const { data: failedData } = await supabase
      .from("cycles")
      .select("id, cycle_number, sterilizer, operator, status, created_at")
      .eq("status", "Failed")
      .order("created_at", { ascending: false })
      .limit(3);

    const { data: patientData } = await supabase
      .from("patient_traces")
      .select(
  "id, patient_id, patient_name, provider, treatment_room, pack_number, procedure, created_at"
)
      .order("created_at", { ascending: false })
      .limit(3);

    setCyclesCount(cycles || 0);
    setPacksCount(packs || 0);
    setPatientRecordsCount(patientRecords || 0);
    setFailedCyclesCount(failedCycles || 0);
    setPendingCyclesCount(pendingCycles || 0);
    setLatestFailedCycles(failedData || []);
    setLatestPatientRecords(patientData || []);
  }

  return (
    <>
      <header className="mb-8">
        <p className="text-sm text-slate-500">Dentaria Internal System</p>
        <h2 className="text-4xl font-bold mt-1">Sterilization Dashboard</h2>
        <p className="text-slate-600 mt-2">
          Digital traceability for sterilization cycles, instrument packs, and
          patient-linked compliance records.
        </p>
      </header>

      {failedCyclesCount > 0 && (
        <section className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex gap-3">
              <AlertTriangle className="text-red-600 shrink-0" />
              <div>
                <h3 className="font-semibold text-red-800">
                  Failed sterilization cycles need attention
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  There are {failedCyclesCount} failed cycle(s). Review linked
                  packs and patient traceability immediately.
                </p>
              </div>
            </div>

            <Link
              href="/investigation?filter=failed"
              className="rounded-xl bg-red-600 text-white px-5 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-red-700 active:scale-95 transition text-center"
            >
              Open Investigation
            </Link>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-8">
        <StatCard
          icon={<ClipboardCheck />}
          title="Total Cycles"
          value={cyclesCount}
        />

        <StatCard
          icon={<PackageCheck />}
          title="Instrument Packs"
          value={packsCount}
        />

        <StatCard
          icon={<FileText />}
          title="Patient Records"
          value={patientRecordsCount}
        />

        <StatCard
          icon={<ShieldCheck />}
          title="Failed Cycles"
          value={failedCyclesCount}
          warning={failedCyclesCount > 0}
        />

        <StatCard
          icon={<AlertTriangle />}
          title="Pending Cycles"
          value={pendingCyclesCount}
          pending={pendingCyclesCount > 0}
        />
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
        <QuickAction href="/cycles" label="New Cycle" />
        <QuickAction href="/packs" label="Create Pack" />
        <QuickAction href="/patients" label="Trace Patient Pack" />
        <QuickAction href="/reports" label="View Reports" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <section className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
          <h3 className="text-xl font-semibold mb-4">Latest Failed Cycles</h3>

          {latestFailedCycles.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No failed cycles currently detected.
            </p>
          ) : (
            <div className="space-y-3">
              {latestFailedCycles.map((cycle) => (
                <div
                  key={cycle.id}
                  className="rounded-xl border border-red-200 bg-red-50 p-4"
                >
                  <div className="flex flex-col md:flex-row md:justify-between gap-2">
                    <p className="font-medium text-red-800">
                      {cycle.cycle_number}
                    </p>

                    <Link
                      href={`/investigation?cycle=${cycle.cycle_number}`}
                      className="text-sm font-medium text-red-700 underline"
                    >
                      Investigate
                    </Link>
                  </div>

                  <p className="text-sm text-red-700 mt-1">
                    {cycle.sterilizer} · Operator: {cycle.operator}
                  </p>

                  <p className="text-xs text-red-500 mt-2">
                    {new Date(cycle.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
          <h3 className="text-xl font-semibold mb-4">
            Latest Patient Traceability
          </h3>

          {latestPatientRecords.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No patient traceability records yet.
            </p>
          ) : (
            <div className="space-y-3">
              {latestPatientRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col md:flex-row md:justify-between gap-2">
                    <p className="font-medium">{record.patient_name}</p>
                    <span className="text-sm text-slate-500">
                      {record.pack_number}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 mt-1">
                    {record.provider} · {record.treatment_room} ·{" "}
                    {record.procedure}
                  </p>

                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(record.created_at).toLocaleString()}
                  </p>
                  <Link
  href={`/patient-history?patient=${record.patient_id}`}
  className="inline-block mt-3 text-sm font-medium text-blue-700 underline"
>
  View Patient History
</Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActionCard
          icon={<Activity />}
          title="Create Sterilization Cycle"
          description="Register a new autoclave cycle, operator, load details, and pass/fail status."
        />

        <ActionCard
          icon={<QrCode />}
          title="Generate QR Labels"
          description="Create unique QR codes for instrument pouches and cassette tracking."
        />

        <ActionCard
          icon={<PackageCheck />}
          title="Link Instruments to Patient"
          description="Scan or select a pouch QR code and connect it to a patient appointment."
        />

        <ActionCard
          icon={<FileText />}
          title="Export Audit Reports"
          description="Prepare clean compliance reports for internal review or inspection."
        />
      </div>
    </>
  );
}

function StatCard({
  icon,
  title,
  value,
  warning = false,
  pending = false,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  warning?: boolean;
  pending?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl shadow-sm p-6 border ${
        warning
          ? "bg-red-50 border-red-200"
          : pending
          ? "bg-yellow-50 border-yellow-200"
          : "bg-white border-slate-200"
      }`}
    >
      <div
        className={
          warning
            ? "text-red-600 mb-4"
            : pending
            ? "text-yellow-600 mb-4"
            : "text-blue-600 mb-4"
        }
      >
        {icon}
      </div>

      <p
        className={
          warning
            ? "text-sm text-red-700"
            : pending
            ? "text-sm text-yellow-700"
            : "text-sm text-slate-500"
        }
      >
        {title}
      </p>

      <p
        className={
          warning
            ? "text-3xl font-bold mt-1 text-red-700"
            : pending
            ? "text-3xl font-bold mt-1 text-yellow-700"
            : "text-3xl font-bold mt-1"
        }
      >
        {value}
      </p>
    </div>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-slate-950 text-white px-5 py-3 min-h-11 text-center text-sm font-medium cursor-pointer hover:bg-slate-800 active:scale-95 transition"
    >
      {label}
    </Link>
  );
}

function ActionCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 hover:shadow-md transition">
      <div className="text-blue-600 mb-4">{icon}</div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="text-slate-600 mt-2">{description}</p>
    </div>
  );
}