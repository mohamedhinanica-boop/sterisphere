"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  released_by: string | null;
  released_at: string | null;
  status: string;
  cycle_state: string | null;
  expected_pack_count: number | null;
  created_at: string;
};

type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  status: string | null;
  sterilized_at: string | null;
  expires_at: string | null;
  load_item_index: number | null;
  load_item_total: number | null;
  cycle_pack_total: number | null;
  cycle_load_summary: string | null;
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

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  description: string | null;
  user_email: string | null;
  created_at: string;
};

const itemsPerPage = 5;

export default function ReportsPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [patientTraces, setPatientTraces] = useState<PatientTrace[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const [range, setRange] = useState("30");
  const [searchTerm, setSearchTerm] = useState("");

  const [cyclesPage, setCyclesPage] = useState(1);
  const [packsPage, setPacksPage] = useState(1);
  const [tracesPage, setTracesPage] = useState(1);

  useEffect(() => {
    fetchReportsData();
  }, []);

  async function fetchReportsData() {
    setLoading(true);

    const { data: cyclesData, error: cyclesError } = await supabase
      .from("cycles")
      .select(
        "id, cycle_number, sterilizer, operator, released_by, released_at, status, cycle_state, expected_pack_count, created_at"
      )
      .order("created_at", { ascending: false });

    const { data: packsData, error: packsError } = await supabase
      .from("packs")
      .select(
        "id, pack_number, cycle_number, pack_type, status, sterilized_at, expires_at, load_item_index, load_item_total, cycle_pack_total, cycle_load_summary, created_at"
      )
      .order("created_at", { ascending: false });

    const { data: tracesData, error: tracesError } = await supabase
      .from("patient_traces")
      .select(
        "id, patient_name, provider, treatment_room, pack_number, procedure, created_at"
      )
      .order("created_at", { ascending: false });

    const { data: auditData, error: auditError } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, description, user_email, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (cyclesError || packsError || tracesError || auditError) {
      toast.error("Error loading reports data.");
      console.error({ cyclesError, packsError, tracesError, auditError });
      setLoading(false);
      return;
    }

    setCycles(cyclesData || []);
    setPacks(packsData || []);
    setPatientTraces(tracesData || []);
    setAuditLogs(auditData || []);
    setLoading(false);
  }

  function getRangeStart() {
    if (range === "all") return null;

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (range === "today") return start;

    start.setDate(start.getDate() - Number(range));
    return start;
  }

  function inSelectedRange(date: string) {
    const start = getRangeStart();
    if (!start) return true;

    return new Date(date) >= start;
  }

  function getEffectivePackStatus(pack: Pack) {
    if (pack.status === "Used") return "Used";

    if (pack.expires_at && new Date(pack.expires_at) < new Date()) {
      return "Expired";
    }

    return pack.status || "Available";
  }

  function isExpiringSoon(pack: Pack) {
    if (!pack.expires_at || getEffectivePackStatus(pack) !== "Available") {
      return false;
    }

    const today = new Date();
    const expiry = new Date(pack.expires_at);
    const diffInDays = Math.ceil(
      (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return diffInDays >= 0 && diffInDays <= 30;
  }

  const rangedCycles = cycles.filter((cycle) => inSelectedRange(cycle.created_at));
  const rangedPacks = packs.filter((pack) => inSelectedRange(pack.created_at));
  const rangedTraces = patientTraces.filter((trace) =>
    inSelectedRange(trace.created_at)
  );
  const rangedAudits = auditLogs.filter((log) => inSelectedRange(log.created_at));

  const search = searchTerm.toLowerCase();

  const filteredCycles = rangedCycles.filter(
    (cycle) =>
      cycle.cycle_number.toLowerCase().includes(search) ||
      cycle.sterilizer.toLowerCase().includes(search) ||
      cycle.operator.toLowerCase().includes(search) ||
      (cycle.released_by || "").toLowerCase().includes(search) ||
      cycle.status.toLowerCase().includes(search)
  );

  const filteredPacks = rangedPacks.filter(
    (pack) =>
      pack.pack_number.toLowerCase().includes(search) ||
      pack.cycle_number.toLowerCase().includes(search) ||
      pack.pack_type.toLowerCase().includes(search) ||
      getEffectivePackStatus(pack).toLowerCase().includes(search)
  );

  const filteredTraces = rangedTraces.filter(
    (trace) =>
      trace.patient_name.toLowerCase().includes(search) ||
      trace.provider.toLowerCase().includes(search) ||
      trace.pack_number.toLowerCase().includes(search) ||
      trace.procedure.toLowerCase().includes(search)
  );

  const passedCycles = rangedCycles.filter((cycle) => cycle.status === "Passed");
  const failedCycles = rangedCycles.filter((cycle) => cycle.status === "Failed");
  const pendingCycles = rangedCycles.filter((cycle) => cycle.status === "Pending");

  const availablePacks = rangedPacks.filter(
    (pack) => getEffectivePackStatus(pack) === "Available"
  );
  const usedPacks = rangedPacks.filter(
    (pack) => getEffectivePackStatus(pack) === "Used"
  );
  const expiredPacks = rangedPacks.filter(
    (pack) => getEffectivePackStatus(pack) === "Expired"
  );
  const expiringSoonPacks = rangedPacks.filter((pack) => isExpiringSoon(pack));

  const passRate =
    rangedCycles.length > 0
      ? ((passedCycles.length / rangedCycles.length) * 100).toFixed(1)
      : "0.0";

  const packUsageRate =
    rangedPacks.length > 0
      ? ((usedPacks.length / rangedPacks.length) * 100).toFixed(1)
      : "0.0";

  const paginatedCycles = paginate(filteredCycles, cyclesPage);
  const paginatedPacks = paginate(filteredPacks, packsPage);
  const paginatedTraces = paginate(filteredTraces, tracesPage);

  function printFullReport() {
    window.print();
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          #reports-print-area,
          #reports-print-area * {
            visibility: visible !important;
          }

          #reports-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 24px !important;
          }

          .no-print {
            display: none !important;
          }

          .print-break {
            page-break-before: always;
          }
        }
      `}</style>

      <div className="no-print">
        <header className="mb-8">
          <h1 className="text-4xl font-bold">Reports</h1>
          <p className="mt-2 text-slate-600">
            Operational reports for cycles, generated packs, patient
            traceability, and audit activity.
          </p>
        </header>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto_auto] gap-3">
            <select
              value={range}
              onChange={(e) => {
                setRange(e.target.value);
                setCyclesPage(1);
                setPacksPage(1);
                setTracesPage(1);
              }}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="today">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>

            <input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCyclesPage(1);
                setPacksPage(1);
                setTracesPage(1);
              }}
              className="rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Search cycle, pack, patient, provider, sterilizer..."
            />

            <button
              type="button"
              onClick={fetchReportsData}
              disabled={loading}
              className="rounded-xl border border-slate-300 px-5 py-3 font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={printFullReport}
              className="rounded-xl bg-slate-950 text-white px-5 py-3 font-medium hover:bg-slate-800"
            >
              Print Full Report
            </button>
          </div>
        </section>

        <SummaryGrid
          cycles={rangedCycles.length}
          passed={passedCycles.length}
          failed={failedCycles.length}
          pending={pendingCycles.length}
          packs={rangedPacks.length}
          available={availablePacks.length}
          used={usedPacks.length}
          expired={expiredPacks.length}
          expiringSoon={expiringSoonPacks.length}
          traces={rangedTraces.length}
          passRate={passRate}
          packUsageRate={packUsageRate}
        />

        <ReportSection
          title="Cycle Reports"
          count={filteredCycles.length}
          page={cyclesPage}
          totalPages={Math.ceil(filteredCycles.length / itemsPerPage)}
          onPrevious={() => setCyclesPage((page) => page - 1)}
          onNext={() => setCyclesPage((page) => page + 1)}
        >
          {paginatedCycles.map((cycle) => (
            <div key={cycle.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row md:justify-between gap-2">
                <div>
                  <p className="font-semibold">{cycle.cycle_number}</p>
                  <p className="text-sm text-slate-600 mt-1">
                    {cycle.sterilizer} · Started by:{" "}
                    {formatInitials(cycle.operator)}
                  </p>
                </div>

                <StatusBadge status={cycle.status} />
              </div>

              <p className="text-sm text-slate-500 mt-2">
                Generated packs: {cycle.expected_pack_count || "N/A"} ·
                Completed by: {formatInitials(cycle.released_by)}
              </p>
            </div>
          ))}
        </ReportSection>

        <ReportSection
          title="Pack Reports"
          count={filteredPacks.length}
          page={packsPage}
          totalPages={Math.ceil(filteredPacks.length / itemsPerPage)}
          onPrevious={() => setPacksPage((page) => page - 1)}
          onNext={() => setPacksPage((page) => page + 1)}
        >
          {paginatedPacks.map((pack) => (
            <div key={pack.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row md:justify-between gap-2">
                <div>
                  <p className="font-semibold">{pack.pack_number}</p>
                  <p className="text-sm text-slate-600 mt-1">
                    {pack.pack_type}
                    {pack.load_item_index && pack.load_item_total
                      ? ` · ${pack.load_item_index} of ${pack.load_item_total}`
                      : ""}{" "}
                    · Cycle: {pack.cycle_number}
                  </p>
                </div>

                <PackBadge status={getEffectivePackStatus(pack)} />
              </div>

              <p className="text-sm text-slate-500 mt-2">
                Sterilized: {formatDate(pack.sterilized_at)} · Expires:{" "}
                {formatDate(pack.expires_at)}
              </p>
            </div>
          ))}
        </ReportSection>

        <ReportSection
          title="Patient Traceability Reports"
          count={filteredTraces.length}
          page={tracesPage}
          totalPages={Math.ceil(filteredTraces.length / itemsPerPage)}
          onPrevious={() => setTracesPage((page) => page - 1)}
          onNext={() => setTracesPage((page) => page + 1)}
        >
          {paginatedTraces.map((trace) => (
            <div key={trace.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row md:justify-between gap-2">
                <p className="font-semibold">{trace.patient_name}</p>
                <p className="text-sm text-slate-500">{trace.pack_number}</p>
              </div>

              <p className="text-sm text-slate-600 mt-1">
                {trace.provider} · {trace.treatment_room} · {trace.procedure}
              </p>
            </div>
          ))}
        </ReportSection>
      </div>

      <section id="reports-print-area" className="hidden print:block">
        <h1 className="text-3xl font-bold">SteriSphere Full Report</h1>
        <p className="mt-2 text-slate-600">
          Generated: {new Date().toLocaleString()}
        </p>
        <p className="text-slate-600">Range: {getRangeLabel(range)}</p>

        <div className="mt-6">
          <SummaryGrid
            cycles={rangedCycles.length}
            passed={passedCycles.length}
            failed={failedCycles.length}
            pending={pendingCycles.length}
            packs={rangedPacks.length}
            available={availablePacks.length}
            used={usedPacks.length}
            expired={expiredPacks.length}
            expiringSoon={expiringSoonPacks.length}
            traces={rangedTraces.length}
            passRate={passRate}
            packUsageRate={packUsageRate}
          />
        </div>

        <PrintTable title="Cycles" rows={filteredCycles.length}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Cycle</th>
                <th className="text-left py-2">Sterilizer</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Packs</th>
                <th className="text-left py-2">Started</th>
                <th className="text-left py-2">Completed</th>
              </tr>
            </thead>
            <tbody>
              {filteredCycles.map((cycle) => (
                <tr key={cycle.id} className="border-b">
                  <td className="py-2">{cycle.cycle_number}</td>
                  <td className="py-2">{cycle.sterilizer}</td>
                  <td className="py-2">{cycle.status}</td>
                  <td className="py-2">{cycle.expected_pack_count || "N/A"}</td>
                  <td className="py-2">{formatInitials(cycle.operator)}</td>
                  <td className="py-2">{formatInitials(cycle.released_by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintTable>

        <PrintTable title="Packs" rows={filteredPacks.length}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Pack</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Cycle</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Sterilized</th>
                <th className="text-left py-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {filteredPacks.map((pack) => (
                <tr key={pack.id} className="border-b">
                  <td className="py-2">{pack.pack_number}</td>
                  <td className="py-2">
                    {pack.pack_type}
                    {pack.load_item_index && pack.load_item_total
                      ? ` ${pack.load_item_index}/${pack.load_item_total}`
                      : ""}
                  </td>
                  <td className="py-2">{pack.cycle_number}</td>
                  <td className="py-2">{getEffectivePackStatus(pack)}</td>
                  <td className="py-2">{formatDate(pack.sterilized_at)}</td>
                  <td className="py-2">{formatDate(pack.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintTable>

        <PrintTable title="Patient Traceability" rows={filteredTraces.length}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Patient</th>
                <th className="text-left py-2">Pack</th>
                <th className="text-left py-2">Provider</th>
                <th className="text-left py-2">Room</th>
                <th className="text-left py-2">Procedure</th>
              </tr>
            </thead>
            <tbody>
              {filteredTraces.map((trace) => (
                <tr key={trace.id} className="border-b">
                  <td className="py-2">{trace.patient_name}</td>
                  <td className="py-2">{trace.pack_number}</td>
                  <td className="py-2">{trace.provider}</td>
                  <td className="py-2">{trace.treatment_room}</td>
                  <td className="py-2">{trace.procedure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintTable>

        <PrintTable title="Recent Audit Activity" rows={rangedAudits.length}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Date</th>
                <th className="text-left py-2">Action</th>
                <th className="text-left py-2">Description</th>
                <th className="text-left py-2">User</th>
              </tr>
            </thead>
            <tbody>
              {rangedAudits.map((log) => (
                <tr key={log.id} className="border-b">
                  <td className="py-2">{formatDateTime(log.created_at)}</td>
                  <td className="py-2">{log.action}</td>
                  <td className="py-2">{log.description || "N/A"}</td>
                  <td className="py-2">{log.user_email || "unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintTable>
      </section>
    </>
  );
}

function paginate<T>(items: T[], page: number) {
  return items.slice((page - 1) * itemsPerPage, page * itemsPerPage);
}

function getRangeLabel(range: string) {
  if (range === "today") return "Today";
  if (range === "7") return "Last 7 days";
  if (range === "30") return "Last 30 days";
  if (range === "90") return "Last 90 days";
  return "All time";
}

function SummaryGrid({
  cycles,
  passed,
  failed,
  pending,
  packs,
  available,
  used,
  expired,
  expiringSoon,
  traces,
  passRate,
  packUsageRate,
}: {
  cycles: number;
  passed: number;
  failed: number;
  pending: number;
  packs: number;
  available: number;
  used: number;
  expired: number;
  expiringSoon: number;
  traces: number;
  passRate: string;
  packUsageRate: string;
}) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
      <MetricCard title="Cycles" value={cycles} />
      <MetricCard title="Passed" value={passed} good />
      <MetricCard title="Failed" value={failed} danger={failed > 0} />
      <MetricCard title="Pending" value={pending} warning={pending > 0} />
      <MetricCard title="Pass Rate" value={`${passRate}%`} />

      <MetricCard title="Packs" value={packs} />
      <MetricCard title="Available" value={available} good />
      <MetricCard title="Used" value={used} />
      <MetricCard title="Expired" value={expired} danger={expired > 0} />
      <MetricCard title="Expiring Soon" value={expiringSoon} warning={expiringSoon > 0} />

      <MetricCard title="Patient Traces" value={traces} />
      <MetricCard title="Pack Usage" value={`${packUsageRate}%`} />
    </section>
  );
}

function MetricCard({
  title,
  value,
  good = false,
  danger = false,
  warning = false,
}: {
  title: string;
  value: string | number;
  good?: boolean;
  danger?: boolean;
  warning?: boolean;
}) {
  const className = danger
    ? "border-red-200 bg-red-50 text-red-700"
    : warning
    ? "border-yellow-200 bg-yellow-50 text-yellow-700"
    : good
    ? "border-green-200 bg-green-50 text-green-700"
    : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${className}`}>
      <p className="text-sm opacity-80">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function ReportSection({
  title,
  count,
  page,
  totalPages,
  onPrevious,
  onNext,
  children,
}: {
  title: string;
  count: number;
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="text-sm text-slate-500 mt-1">{count} record(s)</p>
        </div>
      </div>

      <div className="space-y-3">{children}</div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 mt-6">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={page === 1}
              onClick={onPrevious}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Previous
            </button>

            <button
              type="button"
              disabled={page === totalPages}
              onClick={onNext}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PrintTable({
  title,
  rows,
  children,
}: {
  title: string;
  rows: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-2">
        {title} ({rows})
      </h2>
      {rows === 0 ? <p>No records.</p> : children}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Passed") {
    return (
      <span className="w-fit rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
        Passed
      </span>
    );
  }

  if (status === "Failed") {
    return (
      <span className="w-fit rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
        Failed
      </span>
    );
  }

  return (
    <span className="w-fit rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700">
      {status}
    </span>
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

function formatDate(date: string | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString();
}

function formatDateTime(date: string | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleString();
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