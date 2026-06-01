"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);

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
        "id, cycle_number, sterilizer, operator, status, cycle_state, expected_pack_count, created_at"
      )
      .order("created_at", { ascending: false });

    const { data: packsData, error: packsError } = await supabase
      .from("packs")
      .select("id, pack_number, cycle_number, pack_type, status, created_at")
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
      .limit(5);

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

  const passedCycles = cycles.filter((cycle) => cycle.status === "Passed");
  const failedCycles = cycles.filter((cycle) => cycle.status === "Failed");
  const pendingCycles = cycles.filter((cycle) => cycle.status === "Pending");
  const openCycles = cycles.filter((cycle) => cycle.cycle_state === "Open");
  const closedCycles = cycles.filter((cycle) => cycle.cycle_state === "Closed");

  const availablePacks = packs.filter(
    (pack) => (pack.status || "Available") === "Available"
  );
  const usedPacks = packs.filter((pack) => pack.status === "Used");

  const passRate =
    cycles.length > 0
      ? ((passedCycles.length / cycles.length) * 100).toFixed(1)
      : "0.0";

  const failureRate =
    cycles.length > 0
      ? ((failedCycles.length / cycles.length) * 100).toFixed(1)
      : "0.0";

  const packUsageRate =
    packs.length > 0
      ? ((usedPacks.length / packs.length) * 100).toFixed(1)
      : "0.0";

  const search = searchTerm.toLowerCase();

  const filteredCycles = cycles.filter(
    (cycle) =>
      cycle.cycle_number.toLowerCase().includes(search) ||
      cycle.sterilizer.toLowerCase().includes(search) ||
      cycle.operator.toLowerCase().includes(search) ||
      cycle.status.toLowerCase().includes(search) ||
      (cycle.cycle_state || "").toLowerCase().includes(search)
  );

  const filteredPacks = packs.filter(
    (pack) =>
      pack.pack_number.toLowerCase().includes(search) ||
      pack.cycle_number.toLowerCase().includes(search) ||
      pack.pack_type.toLowerCase().includes(search) ||
      (pack.status || "").toLowerCase().includes(search)
  );

  const filteredPatientTraces = patientTraces.filter(
    (trace) =>
      trace.patient_name.toLowerCase().includes(search) ||
      trace.provider.toLowerCase().includes(search) ||
      trace.treatment_room.toLowerCase().includes(search) ||
      trace.pack_number.toLowerCase().includes(search) ||
      trace.procedure.toLowerCase().includes(search)
  );

  const paginatedCycles = paginate(filteredCycles, cyclesPage);
  const paginatedPacks = paginate(filteredPacks, packsPage);
  const paginatedTraces = paginate(filteredPatientTraces, tracesPage);

  const cycleTotalPages = Math.ceil(filteredCycles.length / itemsPerPage);
  const packTotalPages = Math.ceil(filteredPacks.length / itemsPerPage);
  const traceTotalPages = Math.ceil(filteredPatientTraces.length / itemsPerPage);

  function handleSearchChange(value: string) {
    setSearchTerm(value);
    setCyclesPage(1);
    setPacksPage(1);
    setTracesPage(1);
  }

  function printReport() {
    window.print();
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Reports</h1>
        <p className="mt-2 text-slate-600">
          Sterilization performance, pack usage, patient traceability, and audit
          summary.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <input
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full lg:max-w-xl rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Search reports by cycle, pack, patient, provider, or status"
          />

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={fetchReportsData}
              disabled={loading}
              className="rounded-xl border border-slate-300 px-5 py-3 font-medium cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={printReport}
              className="rounded-xl bg-slate-950 text-white px-5 py-3 font-medium cursor-pointer hover:bg-slate-800 transition"
            >
              Print / Save PDF
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <ReportCard title="Total Cycles" value={cycles.length} />
        <ReportCard title="Passed Cycles" value={passedCycles.length} />
        <ReportCard title="Failed Cycles" value={failedCycles.length} danger />
        <ReportCard title="Pending Cycles" value={pendingCycles.length} />
        <ReportCard title="Open Cycles" value={openCycles.length} />
        <ReportCard title="Closed Cycles" value={closedCycles.length} />
        <ReportCard title="Available Packs" value={availablePacks.length} />
        <ReportCard title="Used Packs" value={usedPacks.length} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <PerformanceCard title="Pass Rate" value={`${passRate}%`} good />
        <PerformanceCard title="Failure Rate" value={`${failureRate}%`} danger />
        <PerformanceCard title="Pack Usage Rate" value={`${packUsageRate}%`} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-2xl font-semibold mb-4">Failed Cycle Summary</h2>

          {failedCycles.length === 0 ? (
            <p className="text-slate-500">No failed cycles found.</p>
          ) : (
            <div className="space-y-3">
              {failedCycles.slice(0, 5).map((cycle) => (
                <div
                  key={cycle.id}
                  className="rounded-xl border border-red-200 bg-red-50 p-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <p className="font-semibold text-red-800">
                        {cycle.cycle_number}
                      </p>
                      <p className="text-sm text-red-700 mt-1">
                        {cycle.sterilizer} · Operator: {cycle.operator}
                      </p>
                    </div>

                    <StatusBadge value="Failed" />
                  </div>

                  <p className="text-xs text-red-500 mt-2">
                    Created: {new Date(cycle.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-2xl font-semibold mb-4">Recent Audit Events</h2>

          {auditLogs.length === 0 ? (
            <p className="text-slate-500">No audit events found.</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="border-b border-slate-100 pb-3 last:border-b-0"
                >
                  <p className="font-medium text-slate-900">
                    {log.description || log.action}
                  </p>

                  <p className="text-sm text-slate-500 mt-1">
                    {log.user_email || "unknown"} · {log.entity_type}
                  </p>

                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <ReportSection
        title={`Sterilization Cycles Report — ${filteredCycles.length} records`}
        currentPage={cyclesPage}
        totalPages={cycleTotalPages}
        setCurrentPage={setCyclesPage}
      >
        {paginatedCycles.length === 0 ? (
          <p className="text-slate-500">No matching cycles found.</p>
        ) : (
          <div className="space-y-3">
            {paginatedCycles.map((cycle) => (
              <div
                key={cycle.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-col md:flex-row md:justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{cycle.cycle_number}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {cycle.sterilizer} · Operator: {cycle.operator}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Expected packs: {cycle.expected_pack_count || "N/A"}
                    </p>
                    <p className="text-xs text-slate-400 mt-3">
                      Created: {new Date(cycle.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex flex-wrap md:justify-end gap-2 h-fit">
                    <StatusBadge value={cycle.status} />
                    <StateBadge value={cycle.cycle_state || "Open"} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection
        title={`Instrument Packs Report — ${filteredPacks.length} records`}
        currentPage={packsPage}
        totalPages={packTotalPages}
        setCurrentPage={setPacksPage}
      >
        {paginatedPacks.length === 0 ? (
          <p className="text-slate-500">No matching packs found.</p>
        ) : (
          <div className="space-y-3">
            {paginatedPacks.map((pack) => (
              <div
                key={pack.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-col md:flex-row md:justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{pack.pack_number}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {pack.pack_type} · Cycle: {pack.cycle_number}
                    </p>
                    <p className="text-xs text-slate-400 mt-3">
                      Created: {new Date(pack.created_at).toLocaleString()}
                    </p>
                  </div>

                  <PackStatusBadge value={pack.status || "Available"} />
                </div>
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection
        title={`Patient Traceability Report — ${filteredPatientTraces.length} records`}
        currentPage={tracesPage}
        totalPages={traceTotalPages}
        setCurrentPage={setTracesPage}
      >
        {paginatedTraces.length === 0 ? (
          <p className="text-slate-500">No matching patient traces found.</p>
        ) : (
          <div className="space-y-3">
            {paginatedTraces.map((trace) => (
              <div
                key={trace.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-col md:flex-row md:justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{trace.patient_name}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {trace.provider} · {trace.treatment_room}
                    </p>
                  </div>

                  <span className="text-sm text-slate-500">
                    {trace.pack_number}
                  </span>
                </div>

                <p className="text-sm text-slate-500 mt-2">
                  Procedure: {trace.procedure}
                </p>

                <p className="text-xs text-slate-400 mt-3">
                  Created: {new Date(trace.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </ReportSection>
    </>
  );
}

function paginate<T>(items: T[], page: number) {
  return items.slice((page - 1) * itemsPerPage, page * itemsPerPage);
}

function ReportSection({
  title,
  children,
  currentPage,
  totalPages,
  setCurrentPage,
}: {
  title: string;
  children: React.ReactNode;
  currentPage: number;
  totalPages: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>

      {children}

      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((page) => page - 1)}
            className="w-full sm:w-auto rounded-xl border border-slate-300 px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          <span className="text-sm text-slate-500">
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((page) => page + 1)}
            className="w-full sm:w-auto rounded-xl border border-slate-300 px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

function ReportCard({
  title,
  value,
  danger = false,
}: {
  title: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        danger ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className={danger ? "text-sm text-red-700" : "text-sm text-slate-500"}>
        {title}
      </p>
      <p
        className={
          danger
            ? "mt-2 text-3xl font-bold text-red-700"
            : "mt-2 text-3xl font-bold text-slate-900"
        }
      >
        {value}
      </p>
    </div>
  );
}

function PerformanceCard({
  title,
  value,
  good = false,
  danger = false,
}: {
  title: string;
  value: string;
  good?: boolean;
  danger?: boolean;
}) {
  const className = danger
    ? "border-red-200 bg-red-50 text-red-700"
    : good
    ? "border-green-200 bg-green-50 text-green-700"
    : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-2xl border p-6 shadow-sm ${className}`}>
      <p className="text-sm opacity-80">{title}</p>
      <p className="mt-2 text-4xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const classes =
    value === "Passed"
      ? "border-green-200 bg-green-50 text-green-700"
      : value === "Failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-yellow-200 bg-yellow-50 text-yellow-700";

  return (
    <span
      className={`inline-flex h-fit rounded-lg border px-3 py-1 text-xs font-medium ${classes}`}
    >
      {value}
    </span>
  );
}

function StateBadge({ value }: { value: string }) {
  const classes =
    value === "Closed"
      ? "border-slate-200 bg-slate-100 text-slate-700"
      : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <span
      className={`inline-flex h-fit rounded-lg border px-3 py-1 text-xs font-medium ${classes}`}
    >
      {value}
    </span>
  );
}

function PackStatusBadge({ value }: { value: string }) {
  const classes =
    value === "Used"
      ? "border-slate-200 bg-slate-100 text-slate-700"
      : "border-green-200 bg-green-50 text-green-700";

  return (
    <span
      className={`inline-flex h-fit rounded-lg border px-3 py-1 text-xs font-medium ${classes}`}
    >
      {value}
    </span>
  );
}