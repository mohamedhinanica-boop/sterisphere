import type { ReactNode } from "react";

type ReportSectionProps = {
  title: string;
  count: number;
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  children: ReactNode;
};

export default function ReportSection({
  title,
  count,
  page,
  totalPages,
  onPrevious,
  onNext,
  children,
}: ReportSectionProps) {
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
