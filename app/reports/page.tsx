"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import MetricCard from "@/components/reports/MetricCard";
import PackBadge from "@/components/reports/PackBadge";
import PrintTable from "@/components/reports/PrintTable";
import ReportSection from "@/components/reports/ReportSection";
import StatusBadge from "@/components/reports/StatusBadge";
import {
  getEffectivePackStatus,
  getRangeLabel,
  isExpiringSoon,
  paginate,
} from "@/components/reports/reportUtils";
import {
  type AuditLog,
  type Cycle,
  formatDate,
  formatDateTime,
  formatInitials,
  getReportsData,
  type Pack,
  type PatientTrace,
} from "@/lib/modules/reports";

const itemsPerPage = 5;
const reportTabs = [
  { id: "overview", label: "Overview" },
  { id: "compliance", label: "Compliance" },
  { id: "cycles", label: "Cycles" },
  { id: "packs", label: "Packs" },
  { id: "patient_traceability", label: "Patient Traceability" },
] as const;

type ReportTab = (typeof reportTabs)[number]["id"];

export default function ReportsPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [patientTraces, setPatientTraces] = useState<PatientTrace[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const [range, setRange] = useState("30");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");

  const [cyclesPage, setCyclesPage] = useState(1);
  const [packsPage, setPacksPage] = useState(1);
  const [tracesPage, setTracesPage] = useState(1);

  useEffect(() => {
    fetchReportsData();
  }, []);

  async function fetchReportsData() {
    setLoading(true);

    try {
      const data = await getReportsData();

      setCycles(data.cycles);
      setPacks(data.packs);
      setPatientTraces(data.patientTraces);
      setAuditLogs(data.auditLogs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error loading reports data.");
      console.error("Reports data load error:", error);
    } finally {
      setLoading(false);
    }
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
  const openInvestigations = rangedCycles.filter(
    (cycle) =>
      cycle.investigation_status === "Open" ||
      cycle.investigation_status === "In Review"
  );
  const closedInvestigations = rangedCycles.filter(
    (cycle) => cycle.investigation_status === "Closed"
  );
  const recentlyClosedInvestigations = [...closedInvestigations].sort(
    (a, b) =>
      new Date(b.investigation_closed_at || b.created_at).getTime() -
      new Date(a.investigation_closed_at || a.created_at).getTime()
  );

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
  const rootCauseBreakdown = getRootCauseBreakdown(rangedCycles);
  const topRootCauses = rootCauseBreakdown.slice(0, 5);
  const failedCyclesBySterilizer = getFailedCyclesBySterilizer(failedCycles);
  const investigationClosureRate = getInvestigationClosureRate(
    openInvestigations.length,
    closedInvestigations.length
  );

  const passRate =
    rangedCycles.length > 0
      ? ((passedCycles.length / rangedCycles.length) * 100).toFixed(1)
      : "0.0";

  const packUsageRate =
    rangedPacks.length > 0
      ? ((usedPacks.length / rangedPacks.length) * 100).toFixed(1)
      : "0.0";

  const paginatedCycles = paginate(filteredCycles, cyclesPage, itemsPerPage);
  const paginatedPacks = paginate(filteredPacks, packsPage, itemsPerPage);
  const paginatedTraces = paginate(filteredTraces, tracesPage, itemsPerPage);

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

        <ReportTabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "overview" && (
          <div className="space-y-8">
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

            <div className="space-y-6 border-t border-slate-200 pt-8">
              <ComplianceOverview
                failedCycles={failedCycles.length}
                openInvestigations={openInvestigations.length}
                closedInvestigations={closedInvestigations.length}
                expiredPacks={expiredPacks.length}
                patientTraces={rangedTraces.length}
                rootCauseBreakdown={rootCauseBreakdown}
              />

              <ComplianceAnalytics
                openInvestigations={openInvestigations.length}
                closedInvestigations={closedInvestigations.length}
                closureRate={investigationClosureRate}
                topRootCauses={topRootCauses}
                failedCyclesBySterilizer={failedCyclesBySterilizer}
              />
            </div>
          </div>
        )}

        {activeTab === "compliance" && (
        <ComplianceDetails
          openInvestigations={openInvestigations}
          recentlyClosedInvestigations={recentlyClosedInvestigations}
          failedCycles={failedCycles}
        />
        )}

        {activeTab === "cycles" && (
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
        )}

        {activeTab === "packs" && (
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
        )}

        {activeTab === "patient_traceability" && (
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
        )}
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

        <ComplianceOverview
          failedCycles={failedCycles.length}
          openInvestigations={openInvestigations.length}
          closedInvestigations={closedInvestigations.length}
          expiredPacks={expiredPacks.length}
          patientTraces={rangedTraces.length}
          rootCauseBreakdown={rootCauseBreakdown}
        />

        <ComplianceAnalytics
          openInvestigations={openInvestigations.length}
          closedInvestigations={closedInvestigations.length}
          closureRate={investigationClosureRate}
          topRootCauses={topRootCauses}
          failedCyclesBySterilizer={failedCyclesBySterilizer}
        />

        <ComplianceDetails
          openInvestigations={openInvestigations}
          recentlyClosedInvestigations={recentlyClosedInvestigations}
          failedCycles={failedCycles}
        />

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

type RootCauseBreakdownItem = {
  rootCause: string;
  count: number;
};

type SterilizerFailureItem = {
  sterilizer: string;
  count: number;
};

function ReportTabs({
  activeTab,
  onChange,
}: {
  activeTab: ReportTab;
  onChange: (tab: ReportTab) => void;
}) {
  return (
    <div className="mb-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex min-w-max gap-2">
        {reportTabs.map((tab) => {
          const selected = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`rounded-xl px-4 py-3 text-sm transition ${
                selected
                  ? "bg-slate-950 font-semibold text-white shadow-sm"
                  : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getRootCauseBreakdown(cycles: Cycle[]): RootCauseBreakdownItem[] {
  const counts = cycles.reduce<Record<string, number>>((breakdown, cycle) => {
    if (
      cycle.investigation_status !== "Open" &&
      cycle.investigation_status !== "In Review" &&
      cycle.investigation_status !== "Closed"
    ) {
      return breakdown;
    }

    const rootCause =
      cycle.investigation_root_cause || "Unknown / Under Investigation";

    breakdown[rootCause] = (breakdown[rootCause] || 0) + 1;
    return breakdown;
  }, {});

  return Object.entries(counts)
    .map(([rootCause, count]) => ({ rootCause, count }))
    .sort((a, b) => b.count - a.count || a.rootCause.localeCompare(b.rootCause));
}

function getFailedCyclesBySterilizer(cycles: Cycle[]): SterilizerFailureItem[] {
  const counts = cycles.reduce<Record<string, number>>((breakdown, cycle) => {
    const sterilizer = cycle.sterilizer || "Unknown sterilizer";

    breakdown[sterilizer] = (breakdown[sterilizer] || 0) + 1;
    return breakdown;
  }, {});

  return Object.entries(counts)
    .map(([sterilizer, count]) => ({ sterilizer, count }))
    .sort((a, b) => b.count - a.count || a.sterilizer.localeCompare(b.sterilizer));
}

function getInvestigationClosureRate(openCount: number, closedCount: number) {
  const total = openCount + closedCount;

  if (total === 0) {
    return "0.0";
  }

  return ((closedCount / total) * 100).toFixed(1);
}

function ComplianceOverview({
  failedCycles,
  openInvestigations,
  closedInvestigations,
  expiredPacks,
  patientTraces,
  rootCauseBreakdown,
}: {
  failedCycles: number;
  openInvestigations: number;
  closedInvestigations: number;
  expiredPacks: number;
  patientTraces: number;
  rootCauseBreakdown: RootCauseBreakdownItem[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold">Compliance Overview</h2>
        <p className="mt-1 text-sm text-slate-500">
          Management summary for investigation, pack, and traceability review.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Failed Cycles" value={failedCycles} danger={failedCycles > 0} />
        <MetricCard
          title="Open Investigations"
          value={openInvestigations}
          warning={openInvestigations > 0}
        />
        <MetricCard title="Closed Investigations" value={closedInvestigations} good />
        <MetricCard title="Expired Packs" value={expiredPacks} danger={expiredPacks > 0} />
        <MetricCard title="Patient Traces" value={patientTraces} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Root Cause</th>
              <th className="px-4 py-3 text-right font-medium">Count</th>
            </tr>
          </thead>
          <tbody>
            {rootCauseBreakdown.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={2}>
                  No investigation root causes found for this range.
                </td>
              </tr>
            ) : (
              rootCauseBreakdown.map((item) => (
                <tr key={item.rootCause} className="border-t border-slate-200">
                  <td className="px-4 py-3">{item.rootCause}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {item.count}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComplianceAnalytics({
  openInvestigations,
  closedInvestigations,
  closureRate,
  topRootCauses,
  failedCyclesBySterilizer,
}: {
  openInvestigations: number;
  closedInvestigations: number;
  closureRate: string;
  topRootCauses: RootCauseBreakdownItem[];
  failedCyclesBySterilizer: SterilizerFailureItem[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold">Compliance Analytics</h2>
        <p className="mt-1 text-sm text-slate-500">
          Closure rates and recurring failure patterns.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          title="Open Investigations"
          value={openInvestigations}
          warning={openInvestigations > 0}
        />
        <MetricCard title="Closed Investigations" value={closedInvestigations} good />
        <MetricCard title="Closure Rate" value={`${closureRate}%`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ComplianceRankedList
          title="Top Root Causes"
          emptyMessage="No root causes found for this range."
          labelHeader="Root Cause"
          valueHeader="Count"
          items={topRootCauses.map((item) => ({
            label: item.rootCause,
            value: item.count,
          }))}
        />

        <ComplianceRankedList
          title="Failed Cycles by Sterilizer"
          emptyMessage="No failed cycles found for this range."
          labelHeader="Sterilizer"
          valueHeader="Failed Cycles"
          items={failedCyclesBySterilizer.map((item) => ({
            label: item.sterilizer,
            value: item.count,
          }))}
        />
      </div>
    </section>
  );
}

function ComplianceRankedList({
  title,
  emptyMessage,
  labelHeader,
  valueHeader,
  items,
}: {
  title: string;
  emptyMessage: string;
  labelHeader: string;
  valueHeader: string;
  items: { label: string; value: number }[];
}) {
  return (
    <div>
      <h3 className="mb-3 text-lg font-semibold">{title}</h3>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{labelHeader}</th>
              <th className="px-4 py-3 text-right font-medium">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={2}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.label} className="border-t border-slate-200">
                  <td className="px-4 py-3">{item.label}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {item.value}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComplianceDetails({
  openInvestigations,
  recentlyClosedInvestigations,
  failedCycles,
}: {
  openInvestigations: Cycle[];
  recentlyClosedInvestigations: Cycle[];
  failedCycles: Cycle[];
}) {
  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold">Compliance Report Details</h2>
        <p className="mt-1 text-sm text-slate-500">
          Investigation and failed-cycle detail for audit review.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ComplianceTable
          title="Open Investigations"
          emptyMessage="No open investigations found for this range."
          headers={["Cycle Number", "Investigation Status", "Root Cause", "Created Date"]}
          rows={openInvestigations.map((cycle) => [
            cycle.cycle_number,
            cycle.investigation_status || "Open",
            cycle.investigation_root_cause || "Unknown / Under Investigation",
            formatDateTime(cycle.created_at),
          ])}
        />

        <ComplianceTable
          title="Recently Closed Investigations"
          emptyMessage="No closed investigations found for this range."
          headers={["Cycle Number", "Root Cause", "Closed Date"]}
          rows={recentlyClosedInvestigations.map((cycle) => [
            cycle.cycle_number,
            cycle.investigation_root_cause || "Unknown / Under Investigation",
            formatDateTime(cycle.investigation_closed_at),
          ])}
        />
      </div>

      <div className="mt-6">
        <ComplianceTable
          title="Failed Cycles"
          emptyMessage="No failed cycles found for this range."
          headers={["Cycle Number", "Sterilizer", "Status"]}
          rows={failedCycles.map((cycle) => [
            cycle.cycle_number,
            cycle.sterilizer || "N/A",
            cycle.status,
          ])}
        />
      </div>
    </section>
  );
}

function ComplianceTable({
  title,
  emptyMessage,
  headers,
  rows,
}: {
  title: string;
  emptyMessage: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
          {rows.length} record(s)
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 text-left font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={headers.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`} className="border-t border-slate-200">
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${rowIndex}-${cellIndex}`} className="px-4 py-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
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
