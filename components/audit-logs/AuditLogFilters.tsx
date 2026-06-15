import type { AuditFilters } from "./auditLogUtils";

type AuditLogFiltersProps = {
  actionFilter: string;
  entityFilter: string;
  searchTerm: string;
  filters: AuditFilters;
  actionOptions: string[];
  entityOptions: string[];
  filteredCount: number;
  totalCount: number;
  loading: boolean;
  exporting: boolean;
  onActionFilterChange: (value: string) => void;
  onEntityFilterChange: (value: string) => void;
  onSearchTermChange: (value: string) => void;
  onDateFilterChange: (field: keyof AuditFilters, value: string) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onExportCsv: () => void;
};

export default function AuditLogFilters({
  actionFilter,
  entityFilter,
  searchTerm,
  filters,
  actionOptions,
  entityOptions,
  filteredCount,
  totalCount,
  loading,
  exporting,
  onActionFilterChange,
  onEntityFilterChange,
  onSearchTermChange,
  onDateFilterChange,
  onClearFilters,
  onRefresh,
  onExportCsv,
}: AuditLogFiltersProps) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
        <div>
          <h2 className="text-2xl font-semibold">Audit Filters</h2>
          <p className="mt-1 text-sm text-slate-500">
            Filter by action, entity, date range, user, description, or
            metadata.
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
            onClick={onExportCsv}
            disabled={exporting || filteredCount === 0}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? "Exporting..." : "Export Filtered CSV"}
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <select
          value={actionFilter}
          onChange={(event) => onActionFilterChange(event.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-3"
        >
          {actionOptions.map((action) => (
            <option key={action} value={action}>
              {action === "All" ? "All Actions" : action}
            </option>
          ))}
        </select>

        <select
          value={entityFilter}
          onChange={(event) => onEntityFilterChange(event.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-3"
        >
          {entityOptions.map((entity) => (
            <option key={entity} value={entity}>
              {entity === "All" ? "All Entities" : entity}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filters.dateFrom}
          onChange={(event) =>
            onDateFilterChange("dateFrom", event.target.value)
          }
          className="rounded-xl border border-slate-300 px-4 py-3"
        />

        <input
          type="date"
          value={filters.dateTo}
          onChange={(event) => onDateFilterChange("dateTo", event.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-3"
        />

        <input
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          className="md:col-span-2 xl:col-span-4 rounded-xl border border-slate-300 px-4 py-3"
          placeholder="Search by user, action, entity, description, ID, or metadata"
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Showing{" "}
        <span className="font-semibold text-slate-900">{filteredCount}</span> of{" "}
        <span className="font-semibold text-slate-900">{totalCount}</span>{" "}
        audit event(s).
      </div>
    </section>
  );
}
