import Link from "next/link";
import type { PatientTrace } from "./types";

type LatestPatientTraceabilityProps = {
  records: PatientTrace[];
};

export default function LatestPatientTraceability({
  records,
}: LatestPatientTraceabilityProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-xl font-semibold">Latest Patient Traceability</h3>

      {records.length === 0 ? (
        <p className="text-sm text-slate-500">No patient traceability records yet.</p>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:justify-between">
                <p className="font-medium">{record.patient_name}</p>
                <span className="text-sm text-slate-500">{record.pack_number}</span>
              </div>

              <p className="mt-1 text-sm text-slate-600">
                {record.provider} · {record.treatment_room} · {record.procedure}
              </p>

              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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
  );
}
