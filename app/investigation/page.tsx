"use client";

import { useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  formatDate,
  formatDateTime,
  formatInitials,
  getFailedCycles,
  getInvestigationData,
  markCycleAsReviewed,
  type FailedCycle,
  type InvestigationCycle,
  type InvestigationLoadItem,
  type InvestigationPack,
  type InvestigationPatientTrace,
} from "@/lib/modules/investigation";

export default function InvestigationPage() {
  const [cycleNumber, setCycleNumber] = useState("");
  const [packs, setPacks] = useState<InvestigationPack[]>([]);
  const [patients, setPatients] = useState<InvestigationPatientTrace[]>([]);
  const [loadItems, setLoadItems] = useState<InvestigationLoadItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cycleDetails, setCycleDetails] = useState<InvestigationCycle | null>(null);
  const [failedCycles, setFailedCycles] = useState<FailedCycle[]>([]);
  const [investigationNotice, setInvestigationNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cycle = params.get("cycle");
    const filter = params.get("filter");

    if (cycle) {
      setCycleNumber(cycle);
      investigateCycle(cycle);
    }

    if (filter === "failed") {
      loadFailedCycles();
    }
  }, []);

  async function loadFailedCycles() {
    try {
      const data = await getFailedCycles();
      setFailedCycles(data);
    } catch (error) {
      toast.error("Error loading failed cycles.");
      console.error(error);
    }
  }

  async function investigateCycle(selectedCycle?: string) {
    const cycleToInvestigate = selectedCycle || cycleNumber;

    if (!cycleToInvestigate.trim()) {
      toast.error("Please enter a cycle number.");
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const result = await getInvestigationData(cycleToInvestigate);

      setCycleDetails(result.cycle);
      setPacks(result.packs);
      setPatients(result.patients);
      setLoadItems(result.loadItems);
      setInvestigationNotice(result.notice);

      if (!result.cycle) {
        toast.error("Cycle not found.");
        return;
      }

      if (result.cycle.status === "Failed" && !result.cycle.reviewed_at) {
        try {
          const reviewedAt = await markCycleAsReviewed(result.cycle.id);

          setCycleDetails({
            ...result.cycle,
            reviewed_at: reviewedAt,
          });

          await loadFailedCycles();
        } catch (reviewError) {
          toast.error("Cycle loaded, but review status was not updated.");
          console.error(reviewError);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error loading investigation data.";

      if (message === "Please enter a cycle number.") {
        toast.error(message);
      } else {
        toast.error("Error loading investigation data.");
        console.error(error);
      }
    } finally {
      setLoading(false);
    }
  }

  function printReport() {
    window.print();
  }

  const affectedPackNumbers = new Set(patients.map((patient) => patient.pack_number));

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          #investigation-report,
          #investigation-report * {
            visibility: visible !important;
          }

          #investigation-report {
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
        }
      `}</style>

      <header className="mb-8 no-print">
        <h1 className="text-4xl font-bold">Investigation</h1>

        <p className="mt-2 text-slate-600">
          Investigate sterilization cycles and trace linked packs, patients,
          sterilizer, and operators.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8 no-print">
        <h2 className="text-2xl font-semibold mb-6">
          Investigate Sterilization Cycle
        </h2>

        <div className="flex flex-col md:flex-row gap-4">
          <input
            value={cycleNumber}
            onChange={(e) => setCycleNumber(e.target.value)}
            className="w-full md:flex-1 rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Example: STERI-2026-0001"
          />

          <button
            onClick={() => investigateCycle()}
            disabled={loading}
            className="rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Investigating..." : "Investigate"}
          </button>

          <button
            onClick={printReport}
            disabled={!cycleDetails}
            className="rounded-xl border border-slate-300 px-6 py-3 font-medium cursor-pointer hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Print Report
          </button>
        </div>
      </section>

      {failedCycles.length > 0 && (
        <section className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 mb-8 no-print">
          <h2 className="text-2xl font-semibold mb-4 text-red-700">
            Failed Sterilization Cycles
          </h2>

          <div className="space-y-3">
            {failedCycles.map((cycle) => (
              <button
                key={cycle.id}
                type="button"
                onClick={() => {
                  setCycleNumber(cycle.cycle_number);
                  investigateCycle(cycle.cycle_number);
                }}
                className={`w-full rounded-xl border p-4 text-left cursor-pointer transition hover:bg-red-50 ${
                  cycle.reviewed_at
                    ? "border-slate-200 bg-slate-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex flex-col md:flex-row md:justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{cycle.cycle_number}</h3>

                      <span
                        className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                          cycle.reviewed_at
                            ? "border-slate-200 bg-white text-slate-600"
                            : "border-red-200 bg-white text-red-700"
                        }`}
                      >
                        {cycle.reviewed_at ? "Reviewed" : "New"}
                      </span>
                    </div>

                    <p className="text-sm text-slate-600 mt-1">
                      {cycle.sterilizer} · Started by:{" "}
                      {formatInitials(cycle.operator)}
                    </p>
                  </div>

                  <p className="text-sm text-slate-500">
                    {formatDateTime(cycle.created_at)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {searched && !cycleDetails && !loading && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <p className="text-slate-500">No cycle found.</p>
        </section>
      )}

      {cycleDetails && investigationNotice && !loading && (
        <section className="mb-6 bg-blue-50 rounded-2xl border border-blue-200 p-4 no-print">
          <p className="text-sm font-medium text-blue-800">{investigationNotice}</p>
        </section>
      )}

      {cycleDetails && (
        <section
          id="investigation-report"
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
        >
          <div className="border-b border-slate-200 pb-5 mb-6">
            <p className="text-sm uppercase tracking-wide text-slate-500">
              SteriSphere Investigation Report
            </p>

            <div className="mt-2 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold">
                  {cycleDetails.cycle_number}
                </h2>

                <p className="mt-2 text-slate-600">
                  Generated: {new Date().toLocaleString()}
                </p>
              </div>

              <StatusBadge status={cycleDetails.status} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            <SummaryCard title="Sterilizer" value={cycleDetails.sterilizer} />
            <SummaryCard
              title="Started By"
              value={formatInitials(cycleDetails.operator)}
              subtitle={cycleDetails.operator}
            />
            <SummaryCard
              title="Completed By"
              value={formatInitials(cycleDetails.released_by)}
              subtitle={cycleDetails.released_by || "N/A"}
            />
            <SummaryCard
              title="Completed At"
              value={formatDateTime(cycleDetails.released_at)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <SummaryCard
              title="Cycle Started"
              value={formatDateTime(cycleDetails.created_at)}
            />
            <SummaryCard
  title={
    cycleDetails.status === "Failed"
      ? "Investigation Review"
      : "Investigation Review"
  }
  value={
    cycleDetails.status === "Failed"
      ? cycleDetails.reviewed_at
        ? "Reviewed"
        : "Pending Review"
      : "Not Required"
  }
  subtitle={
    cycleDetails.status === "Failed"
      ? cycleDetails.reviewed_at
        ? formatDateTime(cycleDetails.reviewed_at)
        : "Failed cycle requires investigation review"
      : "Passed cycle does not require failed-cycle review"
  }
/>

<SummaryCard
  title="Generated Packs"
  value={String(packs.length || cycleDetails.expected_pack_count || "N/A")}
  subtitle={
    cycleDetails.expected_pack_count
      ? `Planned load: ${cycleDetails.expected_pack_count} pack(s)`
      : undefined
  }
/>
          </div>

          <ReportBlock title="Load Composition">
            {loadItems.length > 0 ? (
              <ul className="space-y-2">
                {loadItems.map((item) => (
                  <li key={item.id} className="text-slate-700">
                    • {item.pack_type} × {item.quantity}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-600">{cycleDetails.load_contents}</p>
            )}
          </ReportBlock>

          <ReportBlock title={`Generated Packs (${packs.length})`}>
            {packs.length === 0 ? (
              <p className="text-slate-500">No packs linked to this cycle.</p>
            ) : (
              <div className="space-y-3">
                {packs.map((pack) => (
                  <div
                    key={pack.id}
                    className={`rounded-xl border p-4 ${
                      affectedPackNumbers.has(pack.pack_number)
                        ? "border-red-200 bg-red-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{pack.pack_number}</h3>

                          {affectedPackNumbers.has(pack.pack_number) && (
                            <span className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700">
                              Patient Linked
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-slate-600 mt-1">
                          {pack.pack_type}
                          {pack.load_item_index && pack.load_item_total
                            ? ` · ${pack.load_item_index} of ${pack.load_item_total}`
                            : ""}
                        </p>

                        {pack.cycle_pack_total && (
                          <p className="text-sm text-slate-500 mt-1">
                            Part of a {pack.cycle_pack_total}-pack sterilization
                            load
                          </p>
                        )}
                      </div>

                      <div className="text-sm text-slate-500 md:text-right">
                        <p>Sterilized: {formatDate(pack.sterilized_at)}</p>
                        <p>Expires: {formatDate(pack.expires_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ReportBlock>

          <ReportBlock title={`Affected Patients (${patients.length})`}>
            {patients.length === 0 ? (
              <p className="text-slate-500">
                No patient records linked to packs from this cycle.
              </p>
            ) : (
              <div className="space-y-3">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className="rounded-xl border border-red-200 bg-red-50 p-4"
                  >
                    <div className="flex flex-col md:flex-row md:justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-red-800">
                          {patient.patient_name}
                        </h3>

                        <p className="text-sm text-red-700 mt-1">
                          {patient.provider} · {patient.treatment_room}
                        </p>

                        <p className="text-sm text-red-700 mt-1">
                          Procedure: {patient.procedure}
                        </p>
                      </div>

                      <p className="text-sm font-medium text-red-700">
                        {patient.pack_number}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ReportBlock>

          <ReportBlock title="Investigation Notes">
            <div className="min-h-32 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-400">
              Notes, corrective actions, biological indicator results, or follow-up
              steps can be written here after printing.
            </div>
          </ReportBlock>
        </section>
      )}
    </>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

function ReportBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Failed") {
    return (
      <span className="w-fit rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
        Failed
      </span>
    );
  }

  if (status === "Passed") {
    return (
      <span className="w-fit rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
        Passed
      </span>
    );
  }

  return (
    <span className="w-fit rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700">
      {status}
    </span>
  );
}




