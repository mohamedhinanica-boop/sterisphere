"use client";

import type { Dispatch, SetStateAction } from "react";

type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  pack_number: string;
  procedure: string;
  created_at: string | null;
};

type TraceabilityRecordsListProps = {
  traceSearch: string;
  setTraceSearch: Dispatch<SetStateAction<string>>;
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  paginatedTraces: PatientTrace[];
  filteredTraces: PatientTrace[];
  selectedTraceId: string | null;
  totalPages: number;
  formatDateTime: (date: string | null) => string;
};

export default function TraceabilityRecordsList({
  traceSearch,
  setTraceSearch,
  currentPage,
  setCurrentPage,
  paginatedTraces,
  filteredTraces,
  selectedTraceId,
  totalPages,
  formatDateTime,
}: TraceabilityRecordsListProps) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Recent Patient Traces</h2>
          {selectedTraceId && (
            <p className="mt-1 text-sm text-blue-600">
              Opened from Pack Details. The linked trace is highlighted below.
            </p>
          )}
        </div>
      </div>

      <input
        value={traceSearch}
        onChange={(e) => {
          setTraceSearch(e.target.value);
          setCurrentPage(1);
        }}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 mb-4"
        placeholder="Quick search by patient, pack, provider, room, or procedure"
      />

      {filteredTraces.length === 0 ? (
        <p className="text-slate-500">No patient traces found.</p>
      ) : (
        <>
          <div className="space-y-3">
            {paginatedTraces.map((trace) => {
              const isSelected = trace.id === selectedTraceId;

              return (
                <div
                  id={`trace-${trace.id}`}
                  key={trace.id}
                  className={`rounded-xl border p-4 transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:justify-between gap-2">
                    <h3 className="font-semibold">{trace.patient_name}</h3>

                    <span
                      className={`text-sm ${
                        isSelected ? "text-blue-700" : "text-slate-500"
                      }`}
                    >
                      {trace.pack_number}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 mt-1">
                    {trace.provider} &middot; {trace.treatment_room}
                  </p>

                  <p className="text-sm text-slate-500 mt-2">
                    Procedure: {trace.procedure}
                  </p>

                  <p className="text-xs text-slate-400 mt-3">
                    Created: {formatDateTime(trace.created_at)}
                  </p>
                </div>
              );
            })}
          </div>

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
        </>
      )}
    </section>
  );
}
