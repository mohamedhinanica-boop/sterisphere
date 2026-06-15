"use client";

type Provider = {
  id: string;
  full_name: string;
  role: string | null;
  active: boolean;
};

type TraceFilters = {
  patientName: string;
  provider: string;
  packNumber: string;
  procedure: string;
  dateFrom: string;
  dateTo: string;
};

type TraceabilityFiltersProps = {
  filters: TraceFilters;
  providers: Provider[];
  filteredTraceCount: number;
  totalTraceCount: number;
  exporting: boolean;
  onClearFilters: () => void;
  onExportFilteredCsv: () => void;
  onUpdateFilter: (field: keyof TraceFilters, value: string) => void;
};

export default function TraceabilityFilters({
  filters,
  providers,
  filteredTraceCount,
  totalTraceCount,
  exporting,
  onClearFilters,
  onExportFilteredCsv,
  onUpdateFilter,
}: TraceabilityFiltersProps) {
  return (
    <section className="mb-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">
            Traceability Filters & Export
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Filter records for audits, provider reviews, pack investigations,
            or monthly reporting.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium hover:bg-slate-50"
          >
            Clear Filters
          </button>

          <button
            type="button"
            onClick={onExportFilteredCsv}
            disabled={exporting || filteredTraceCount === 0}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? "Exporting..." : "Export Filtered CSV"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <FilterInput
          label="Patient Name"
          value={filters.patientName}
          onChange={(value) => onUpdateFilter("patientName", value)}
          placeholder="Example: John Smith"
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Provider
          </label>
          <select
            value={filters.provider}
            onChange={(e) => onUpdateFilter("provider", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="">All providers</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.full_name}>
                {provider.full_name}
              </option>
            ))}
          </select>
        </div>

        <FilterInput
          label="Pack Number"
          value={filters.packNumber}
          onChange={(value) => onUpdateFilter("packNumber", value)}
          placeholder="Example: PACK-2026"
        />

        <FilterInput
          label="Procedure"
          value={filters.procedure}
          onChange={(value) => onUpdateFilter("procedure", value)}
          placeholder="Example: Cleaning"
        />

        <FilterInput
          label="Date From"
          type="date"
          value={filters.dateFrom}
          onChange={(value) => onUpdateFilter("dateFrom", value)}
        />

        <FilterInput
          label="Date To"
          type="date"
          value={filters.dateTo}
          onChange={(value) => onUpdateFilter("dateTo", value)}
        />
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Showing{" "}
        <span className="font-semibold text-slate-900">
          {filteredTraceCount}
        </span>{" "}
        of{" "}
        <span className="font-semibold text-slate-900">{totalTraceCount}</span>{" "}
        traceability record(s).
      </div>
    </section>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3"
        placeholder={placeholder}
      />
    </div>
  );
}
