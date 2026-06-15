"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import ChecklistItem from "@/components/investigation/ChecklistItem";
import DetailCard from "@/components/investigation/DetailCard";
import ReportBlock from "@/components/investigation/ReportBlock";
import RiskCard from "@/components/investigation/RiskCard";
import StatusBadge from "@/components/investigation/StatusBadge";
import SummaryCard from "@/components/investigation/SummaryCard";
import {
  getRiskLevel,
  getValue,
} from "@/components/investigation/investigationUtils";
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
  const [cycleDetails, setCycleDetails] =
    useState<InvestigationCycle | null>(null);
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
      toast.error("Error loading investigation data.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function printReport() {
    window.print();
  }

  const affectedPackNumbers = new Set(
    patients.map((patient) => patient.pack_number)
  );

  const usedAffectedPacks = packs.filter((pack) =>
    affectedPackNumbers.has(pack.pack_number)
  );

  const unusedPacks = packs.filter(
    (pack) => !affectedPackNumbers.has(pack.pack_number)
  );

  const providersInvolved = Array.from(
    new Set(patients.map((patient) => patient.provider).filter(Boolean))
  );

  const riskLevel = getRiskLevel(cycleDetails, packs.length, patients.length);

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
        <h1 className="text-4xl font-bold">Investigation Center</h1>
        <p className="mt-2 text-slate-600">
          Investigate sterilization cycles, affected packs, linked patients,
          providers, and corrective follow-up.
        </p>
      </header>

      <section className="mb-8 grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)] gap-6 no-print">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">Investigate Cycle</h2>
          <p className="mt-1 text-sm text-slate-500">
            Enter a sterilization cycle number to review all linked packs and
            patient traceability records.
          </p>

          <div className="mt-5 flex flex-col md:flex-row gap-4">
            <input
              value={cycleNumber}
              onChange={(e) => setCycleNumber(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: STERI-2026-0001"
            />

            <button
              type="button"
              onClick={() => investigateCycle()}
              disabled={loading}
              className="rounded-xl bg-slate-950 px-6 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Investigating..." : "Investigate"}
            </button>

            <button
              type="button"
              onClick={loadFailedCycles}
              className="rounded-xl border border-slate-300 px-6 py-3 font-medium hover:bg-slate-50"
            >
              Load Failed Cycles
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Investigation Snapshot</h2>
          <p className="mt-1 text-sm text-slate-500">
            Current investigation risk and impact summary.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <SummaryCard title="Risk Level" value={riskLevel} />
            <SummaryCard title="Affected Packs" value={String(packs.length)} />
            <SummaryCard
              title="Used Packs"
              value={String(usedAffectedPacks.length)}
            />
            <SummaryCard
              title="Patient Traces"
              value={String(patients.length)}
            />
          </div>
        </div>
      </section>

      {failedCycles.length > 0 && (
        <section className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-6 no-print">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-red-900">
              Failed Cycles Requiring Review
            </h2>
            <p className="mt-1 text-sm text-red-700">
              Select a failed cycle to investigate it directly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {failedCycles.map((cycle) => (
              <button
                key={cycle.id}
                type="button"
                onClick={() => {
                  setCycleNumber(cycle.cycle_number);
                  investigateCycle(cycle.cycle_number);
                }}
                className="rounded-xl border border-red-200 bg-white p-4 text-left hover:bg-red-50"
              >
                <p className="font-semibold text-red-900">
                  {cycle.cycle_number}
                </p>
                <p className="mt-1 text-sm text-red-700">
                  {cycle.sterilizer || "Unknown sterilizer"}
                </p>
                <p className="mt-2 text-xs text-red-500">
                  Created: {formatDateTime(cycle.created_at)}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {searched && !cycleDetails && !loading && (
        <section className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6">
          <h2 className="text-xl font-semibold text-yellow-900">
            No Cycle Found
          </h2>
          <p className="mt-2 text-sm text-yellow-700">
            No sterilization cycle matched the cycle number entered.
          </p>
        </section>
      )}

      {cycleDetails && (
        <section
          id="investigation-report"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">
                Investigation Report: {cycleDetails.cycle_number}
              </h2>
              <p className="mt-2 text-slate-600">
                Generated from SteriSphere investigation workflow.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 no-print">
              <button
                type="button"
                onClick={printReport}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                Print Report
              </button>
            </div>
          </div>

          {investigationNotice && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
              {investigationNotice}
            </div>
          )}

          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard title="Cycle Status" value={cycleDetails.status} />
            <SummaryCard title="Risk Level" value={riskLevel} />
            <SummaryCard title="Affected Packs" value={String(packs.length)} />
            <SummaryCard
              title="Linked Patients"
              value={String(patients.length)}
            />
          </div>

          <ReportBlock title="Cycle Details">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <DetailCard
                label="Cycle Number"
                value={cycleDetails.cycle_number}
              />
              <DetailCard label="Status" value={cycleDetails.status} />
              <DetailCard
                label="Sterilizer"
                value={cycleDetails.sterilizer || "N/A"}
              />
              <DetailCard
                label="Started By"
                value={formatInitials(cycleDetails.operator)}
              />
              <DetailCard
                label="Completed By"
                value={formatInitials(cycleDetails.released_by)}
              />
              <DetailCard
                label="Created"
                value={formatDateTime(cycleDetails.created_at)}
              />
              <DetailCard
                label="Released"
                value={formatDateTime(cycleDetails.released_at)}
              />
              <DetailCard
                label="Reviewed"
                value={formatDateTime(cycleDetails.reviewed_at)}
              />
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Status Badge
                </p>
                <div className="mt-2">
                  <StatusBadge status={cycleDetails.status} />
                </div>
              </div>
            </div>
          </ReportBlock>

          <ReportBlock title="Risk Summary">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <RiskCard
                title="Affected Packs"
                value={packs.length}
                description="Total packs connected to this sterilization cycle."
              />
              <RiskCard
                title="Used on Patients"
                value={patients.length}
                description="Patient traceability records linked to packs from this cycle."
              />
              <RiskCard
                title="Providers Involved"
                value={providersInvolved.length}
                description="Treatment providers connected to affected patient traces."
              />
            </div>

            {cycleDetails.status === "Failed" && patients.length > 0 && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                High priority: this failed cycle has packs linked to patient
                care records. Review affected patients, providers, and
                corrective actions immediately.
              </div>
            )}

            {cycleDetails.status === "Failed" && patients.length === 0 && (
              <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
                This failed cycle has no linked patient traceability records.
                Confirm whether any generated packs were quarantined or
                discarded.
              </div>
            )}
          </ReportBlock>

          <ReportBlock title="Load Composition">
            {loadItems.length === 0 ? (
              <p className="text-sm text-slate-500">
                No load composition details were found for this cycle.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {loadItems.map((item, index) => (
                  <div
                    key={`${getValue(item, "pack_type", "type", "name")}-${index}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="font-semibold text-slate-900">
                      {getValue(item, "pack_type", "type", "name") || "Load Item"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Quantity: {getValue(item, "quantity", "count", "total") || "N/A"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </ReportBlock>

          <ReportBlock title="Affected Packs">
            {packs.length === 0 ? (
              <p className="text-sm text-slate-500">
                No packs were found for this cycle.
              </p>
            ) : (
              <div className="space-y-3">
                {packs.map((pack) => {
                  const linkedToPatient = affectedPackNumbers.has(
                    pack.pack_number
                  );

                  return (
                    <div
                      key={pack.id}
                      className={`rounded-xl border p-4 ${
                        linkedToPatient
                          ? "border-red-200 bg-red-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900">
                              {pack.pack_number}
                            </h3>

                            {linkedToPatient ? (
                              <span className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700">
                                Linked to Patient
                              </span>
                            ) : (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                No Patient Link
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-sm text-slate-600">
                            {pack.pack_type || "Instrument Pack"}
                          </p>

                          <p className="mt-2 text-sm text-slate-500">
                            Status: {pack.status || "N/A"} · Expires:{" "}
                            {formatDate(pack.expires_at)}
                          </p>
                        </div>

                        <p className="text-xs text-slate-400">
                          Created: {formatDateTime(null)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ReportBlock>

          <ReportBlock title="Affected Patient Traceability">
            {patients.length === 0 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                No patient traceability records were linked to packs from this
                cycle.
              </div>
            ) : (
              <div className="space-y-3">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className="rounded-xl border border-red-200 bg-red-50 p-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-red-900">
                          {patient.patient_name}
                        </h3>

                        <p className="mt-1 text-sm text-red-700">
                          {patient.provider} · {patient.treatment_room}
                        </p>

                        <p className="mt-2 text-sm text-red-700">
                          Procedure: {patient.procedure}
                        </p>

                        <p className="mt-2 text-sm text-red-700">
                          Pack: {patient.pack_number}
                        </p>
                      </div>

                      <p className="text-xs text-red-500">
                       Used: {formatDateTime(patient.created_at ?? null)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ReportBlock>

          <ReportBlock title="Providers Involved">
            {providersInvolved.length === 0 ? (
              <p className="text-sm text-slate-500">
                No providers were linked to this investigation.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {providersInvolved.map((provider) => (
                  <span
                    key={provider}
                    className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    {provider}
                  </span>
                ))}
              </div>
            )}
          </ReportBlock>

          <ReportBlock title="Corrective Action Notes">
            <div className="min-h-32 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-400">
              Notes, corrective actions, biological indicator results, staff
              follow-up, or quarantine confirmation can be written here after
              printing.
            </div>
          </ReportBlock>

          <ReportBlock title="Investigation Checklist">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <ChecklistItem text="Cycle reviewed and marked for investigation." />
              <ChecklistItem text="Affected packs identified." />
              <ChecklistItem text="Patient traceability records reviewed." />
              <ChecklistItem text="Providers involved notified if required." />
              <ChecklistItem text="Corrective action documented." />
              <ChecklistItem text="Final report printed or saved." />
            </div>
          </ReportBlock>
        </section>
      )}
    </>
  );
}
