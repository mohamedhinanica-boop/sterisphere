"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ClipboardCheck,
  FileText,
  PackageCheck,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [cyclesCount, setCyclesCount] = useState(0);
  const [packsCount, setPacksCount] = useState(0);
  const [patientRecordsCount, setPatientRecordsCount] = useState(0);
  const [failedCyclesCount, setFailedCyclesCount] = useState(0);

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

    setCyclesCount(cycles || 0);
    setPacksCount(packs || 0);
    setPatientRecordsCount(patientRecords || 0);
    setFailedCyclesCount(failedCycles || 0);
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard icon={<ClipboardCheck />} title="Total Cycles" value={cyclesCount} />
        <StatCard icon={<PackageCheck />} title="Instrument Packs" value={packsCount} />
        <StatCard icon={<FileText />} title="Patient Records" value={patientRecordsCount} />
        <StatCard
  icon={<ShieldCheck />}
  title="Failed Cycles"
  value={failedCyclesCount}
  warning={failedCyclesCount > 0}
/>
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
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl shadow-sm p-6 border ${
        warning
          ? "bg-red-50 border-red-200"
          : "bg-white border-slate-200"
      }`}
    >
      <div className={warning ? "text-red-600 mb-4" : "text-blue-600 mb-4"}>
        {icon}
      </div>
      <p className={warning ? "text-sm text-red-700" : "text-sm text-slate-500"}>
        {title}
      </p>
      <p className={warning ? "text-3xl font-bold mt-1 text-red-700" : "text-3xl font-bold mt-1"}>
        {value}
      </p>
    </div>
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