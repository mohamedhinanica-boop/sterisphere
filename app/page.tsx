"use client";

import toast from "react-hot-toast";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  PackageCheck,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  description: string | null;
  user_email: string | null;
  created_at: string;
};

type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  status: string;
  cycle_state?: string | null;
  duration_minutes?: number | null;
  expected_finish_at?: string | null;
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

type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  status: string | null;
  expires_at: string | null;
  created_at: string;
};

export default function Home() {
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [cyclesCount, setCyclesCount] = useState(0);
  const [packsCount, setPacksCount] = useState(0);
  const [patientRecordsCount, setPatientRecordsCount] = useState(0);
  const [failedCyclesCount, setFailedCyclesCount] = useState(0);
  const [unreviewedFailedCyclesCount, setUnreviewedFailedCyclesCount] =
    useState(0);
  const [pendingCyclesCount, setPendingCyclesCount] = useState(0);
  const [openCyclesCount, setOpenCyclesCount] = useState(0);
  const [closedCyclesCount, setClosedCyclesCount] = useState(0);
  const [availablePacksCount, setAvailablePacksCount] = useState(0);
  const [usedPacksCount, setUsedPacksCount] = useState(0);
  const [expiredPacksCount, setExpiredPacksCount] = useState(0);
  const [expiringSoonPacksCount, setExpiringSoonPacksCount] = useState(0);

  const [latestFailedCycles, setLatestFailedCycles] = useState<Cycle[]>([]);
  const [latestPatientRecords, setLatestPatientRecords] = useState<
    PatientTrace[]
  >([]);
  const [recentPacks, setRecentPacks] = useState<Pack[]>([]);
  const [pendingCycleAlerts, setPendingCycleAlerts] = useState<Cycle[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

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

    const { count: unreviewedFailedCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("status", "Failed")
      .is("reviewed_at", null);

    const { count: pendingCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("status", "Pending");

    const { count: openCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("cycle_state", "Open");

    const { count: closedCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("cycle_state", "Closed");

    const { count: availablePacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .eq("status", "Available");

    const { count: usedPacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .eq("status", "Used");

    const { count: expiredPacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .lt("expires_at", now.toISOString())
      .neq("status", "Used");

    const { count: expiringSoonPacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .gte("expires_at", now.toISOString())
      .lte("expires_at", thirtyDaysFromNow.toISOString())
      .eq("status", "Available");

    const { data: auditLogs, error: auditError } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, description, user_email, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (auditError) {
      toast.error("Error loading recent activity.");
      console.error(auditError);
    } else {
      setRecentActivity(auditLogs || []);
    }

    const { data: failedData } = await supabase
      .from("cycles")
      .select("id, cycle_number, sterilizer, operator, status, created_at")
      .eq("status", "Failed")
      .order("created_at", { ascending: false })
      .limit(3);

    const { data: pendingData } = await supabase
      .from("cycles")
      .select(
        "id, cycle_number, sterilizer, operator, status, cycle_state, duration_minutes, expected_finish_at, created_at"
      )
      .eq("status", "Pending")
      .order("created_at", { ascending: false })
      .limit(6);

    const { data: patientData } = await supabase
      .from("patient_traces")
      .select(
        "id, patient_id, patient_name, provider, treatment_room, pack_number, procedure, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(3);

    const { data: packData } = await supabase
      .from("packs")
      .select(
        "id, pack_number, cycle_number, pack_type, status, expires_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(5);

    setCyclesCount(cycles || 0);
    setPacksCount(packs || 0);
    setPatientRecordsCount(patientRecords || 0);
    setFailedCyclesCount(failedCycles || 0);
    setUnreviewedFailedCyclesCount(unreviewedFailedCycles || 0);
    setPendingCyclesCount(pendingCycles || 0);
    setOpenCyclesCount(openCycles || 0);
    setClosedCyclesCount(closedCycles || 0);
    setAvailablePacksCount(availablePacks || 0);
    setUsedPacksCount(usedPacks || 0);
    setExpiredPacksCount(expiredPacks || 0);
    setExpiringSoonPacksCount(expiringSoonPacks || 0);
    setLatestFailedCycles(failedData || []);
    setPendingCycleAlerts(pendingData || []);
    setLatestPatientRecords(patientData || []);
    setRecentPacks(packData || []);
  }

  const runningCycles = pendingCycleAlerts.filter(
    (cycle) => !isCycleOverdue(cycle)
  );

  const overdueCycles = pendingCycleAlerts.filter((cycle) =>
    isCycleOverdue(cycle)
  );

  return (
    <>
      <header className="mb-8">
        <p className="text-sm text-slate-500">Dentaria Internal System</p>
        <h2 className="text-4xl font-bold mt-1">Sterilization Dashboard</h2>
        <p className="text-slate-600 mt-2">
          Daily control center for sterilization cycles, auto-generated packs,
          patient traceability, and compliance alerts.
        </p>
      </header>

      {overdueCycles.length > 0 && (
        <section className="mb-8 rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex gap-3">
              <Timer className="text-yellow-700 shrink-0" />
              <div>
                <h3 className="font-semibold text-yellow-900">
                  Cycles awaiting confirmation
                </h3>
                <p className="text-sm text-yellow-800 mt-1">
                  {overdueCycles.length} cycle(s) reached their expected finish
                  time and need an operator to confirm Passed or Failed.
                </p>
              </div>
            </div>

            <Link
              href="/cycles"
              className="rounded-xl bg-yellow-600 text-white px-5 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-yellow-700 active:scale-95 transition text-center"
            >
              Review Cycles
            </Link>
          </div>
        </section>
      )}

      {unreviewedFailedCyclesCount > 0 && (
        <section className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex gap-3">
              <AlertTriangle className="text-red-600 shrink-0" />
              <div>
                <h3 className="font-semibold text-red-800">
                  Failed sterilization cycles need attention
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  There are {unreviewedFailedCyclesCount} new failed cycle(s).
                  Review linked packs and patient traceability.
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

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
        <StatCard
          icon={<ClipboardCheck />}
          title="Total Cycles"
          value={cyclesCount}
        />

        <StatCard
          icon={<Timer />}
          title="Pending Cycles"
          value={pendingCyclesCount}
          pending={pendingCyclesCount > 0}
        />

        <StatCard
          icon={<AlertTriangle />}
          title="Awaiting Confirmation"
          value={overdueCycles.length}
          pending={overdueCycles.length > 0}
        />

        <StatCard
          icon={<PackageCheck />}
          title="Available Packs"
          value={availablePacksCount}
          good
        />

        <StatCard
          icon={<FileText />}
          title="Patient Records"
          value={patientRecordsCount}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard
          icon={<PackageCheck />}
          title="Total Packs"
          value={packsCount}
        />

        <StatCard icon={<FileText />} title="Used Packs" value={usedPacksCount} />

        <StatCard
          icon={<AlertTriangle />}
          title="Expired Packs"
          value={expiredPacksCount}
          warning={expiredPacksCount > 0}
        />

        <StatCard
          icon={<Timer />}
          title="Expiring Soon"
          value={expiringSoonPacksCount}
          pending={expiringSoonPacksCount > 0}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
        <QuickAction href="/cycles" label="Start Cycle" />
        <QuickAction href="/packs" label="Pack Inventory" />
        <QuickAction href="/patients" label="Trace Patient Pack" />
        <QuickAction href="/reports" label="View Reports" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <section className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-xl font-semibold">Running Cycles</h3>

            <Link
              href="/cycles"
              className="text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              View Cycles →
            </Link>
          </div>

          {runningCycles.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No running cycles currently detected.
            </p>
          ) : (
            <div className="space-y-3">
              {runningCycles.map((cycle) => (
                <CycleTimingCard key={cycle.id} cycle={cycle} />
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-xl font-semibold">Awaiting Confirmation</h3>

            <Link
              href="/cycles"
              className="text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              Review →
            </Link>
          </div>

          {overdueCycles.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No cycles are currently overdue.
            </p>
          ) : (
            <div className="space-y-3">
              {overdueCycles.map((cycle) => (
                <CycleTimingCard key={cycle.id} cycle={cycle} overdue />
              ))}
            </div>
          )}
        </section>
      </div>

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
                    {cycle.sterilizer} · Started by:{" "}
                    {formatInitials(cycle.operator)}
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
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-xl font-semibold">Recent Generated Packs</h3>

            <Link
              href="/packs"
              className="text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              View Inventory →
            </Link>
          </div>

          {recentPacks.length === 0 ? (
            <p className="text-slate-500 text-sm">No packs generated yet.</p>
          ) : (
            <div className="space-y-3">
              {recentPacks.map((pack) => (
                <div
                  key={pack.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col md:flex-row md:justify-between gap-2">
                    <div>
                      <p className="font-medium">{pack.pack_number}</p>
                      <p className="text-sm text-slate-600 mt-1">
                        {pack.pack_type} · Cycle: {pack.cycle_number}
                      </p>
                    </div>

                    <PackBadge status={getEffectivePackStatus(pack)} />
                  </div>

                  <p className="text-xs text-slate-400 mt-2">
                    Created: {new Date(pack.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
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

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-2">
                    <p className="text-xs text-slate-400">
                      {new Date(record.created_at).toLocaleString()}
                    </p>

                    <Link
                      href={`/patient-history?patient=${record.patient_id}`}
                      className="text-sm font-medium text-blue-700 underline"
                    >
                      View History
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Activity</h2>

            <Link
              href="/audit-logs"
              className="text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              View All →
            </Link>
          </div>

          {recentActivity.length === 0 ? (
            <p className="text-slate-500">No recent activity yet.</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="border-b border-slate-100 py-3 last:border-b-0"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {activity.description || activity.action}
                      </p>

                      <p className="text-sm text-slate-500 mt-1">
                        {activity.user_email || "unknown"} ·{" "}
                        {activity.entity_type}
                      </p>
                    </div>

                    <span className="text-xs text-slate-400">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">
          Sterilization Performance
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <StatCard
            icon={<ClipboardCheck size={28} />}
            title="Open Cycles"
            value={openCyclesCount}
          />

          <StatCard
            icon={<ShieldCheck size={28} />}
            title="Closed Cycles"
            value={closedCyclesCount}
          />

          <StatCard
            icon={<PackageCheck size={28} />}
            title="Available Packs"
            value={availablePacksCount}
            good
          />

          <StatCard
            icon={<FileText size={28} />}
            title="Used Packs"
            value={usedPacksCount}
          />
        </div>
      </section>
    </>
  );
}

function getEffectivePackStatus(pack: Pack) {
  if (pack.status === "Used") return "Used";

  if (pack.expires_at && new Date(pack.expires_at) < new Date()) {
    return "Expired";
  }

  return pack.status || "Available";
}

function isCycleOverdue(cycle: Cycle) {
  if (!cycle.expected_finish_at) return false;
  return new Date(cycle.expected_finish_at) < new Date();
}

function getCycleTimingText(cycle: Cycle) {
  if (!cycle.expected_finish_at) {
    return "No expected finish time";
  }

  const now = new Date();
  const expectedFinish = new Date(cycle.expected_finish_at);
  const diffMinutes = Math.round(
    (expectedFinish.getTime() - now.getTime()) / (1000 * 60)
  );

  if (diffMinutes > 0) {
    return `${diffMinutes} min remaining`;
  }

  if (diffMinutes === 0) {
    return "Expected to finish now";
  }

  return `${Math.abs(diffMinutes)} min overdue`;
}

function formatInitials(value: string | null | undefined) {
  if (!value) return "N/A";

  const emailName = value.split("@")[0] || value;
  const parts = emailName
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return emailName.slice(0, 2).toUpperCase();
}

function formatDateTime(date: string | null | undefined) {
  if (!date) return "N/A";
  return new Date(date).toLocaleString();
}

function StatCard({
  icon,
  title,
  value,
  warning = false,
  pending = false,
  good = false,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  warning?: boolean;
  pending?: boolean;
  good?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl shadow-sm p-6 border ${
        warning
          ? "bg-red-50 border-red-200"
          : pending
          ? "bg-yellow-50 border-yellow-200"
          : good
          ? "bg-green-50 border-green-200"
          : "bg-white border-slate-200"
      }`}
    >
      <div
        className={
          warning
            ? "text-red-600 mb-4"
            : pending
            ? "text-yellow-600 mb-4"
            : good
            ? "text-green-600 mb-4"
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
            : good
            ? "text-sm text-green-700"
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
            : good
            ? "text-3xl font-bold mt-1 text-green-700"
            : "text-3xl font-bold mt-1"
        }
      >
        {value}
      </p>
    </div>
  );
}

function CycleTimingCard({
  cycle,
  overdue = false,
}: {
  cycle: Cycle;
  overdue?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        overdue
          ? "border-yellow-200 bg-yellow-50"
          : "border-blue-200 bg-blue-50"
      }`}
    >
      <div className="flex flex-col md:flex-row md:justify-between gap-2">
        <div>
          <p
            className={`font-medium ${
              overdue ? "text-yellow-900" : "text-blue-900"
            }`}
          >
            {cycle.cycle_number}
          </p>

          <p
            className={`text-sm mt-1 ${
              overdue ? "text-yellow-800" : "text-blue-800"
            }`}
          >
            {cycle.sterilizer} · Started by: {formatInitials(cycle.operator)}
          </p>
        </div>

        <span
          className={`w-fit rounded-lg border px-3 py-1 text-xs font-medium ${
            overdue
              ? "border-yellow-300 bg-white text-yellow-800"
              : "border-blue-300 bg-white text-blue-800"
          }`}
        >
          {overdue ? "Awaiting Confirmation" : "Running"}
        </span>
      </div>

      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-sm ${
          overdue ? "text-yellow-800" : "text-blue-800"
        }`}
      >
        <p>
          Duration:{" "}
          <span className="font-medium">
            {cycle.duration_minutes ? `${cycle.duration_minutes} min` : "N/A"}
          </span>
        </p>

        <p>
          Expected finish:{" "}
          <span className="font-medium">
            {formatDateTime(cycle.expected_finish_at)}
          </span>
        </p>
      </div>

      <p
        className={`mt-3 text-sm font-semibold ${
          overdue ? "text-yellow-900" : "text-blue-900"
        }`}
      >
        {getCycleTimingText(cycle)}
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

function PackBadge({ status }: { status: string }) {
  if (status === "Available") {
    return (
      <span className="w-fit rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
        Available
      </span>
    );
  }

  if (status === "Used") {
    return (
      <span className="w-fit rounded-lg border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
        Used
      </span>
    );
  }

  if (status === "Expired") {
    return (
      <span className="w-fit rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
        Expired
      </span>
    );
  }

  return (
    <span className="w-fit rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700">
      {status}
    </span>
  );
}