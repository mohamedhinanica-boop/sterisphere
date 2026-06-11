"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  user_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AuditFilters = {
  dateFrom: string;
  dateTo: string;
};

const itemsPerPage = 10;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [entityFilter, setEntityFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const [filters, setFilters] = useState<AuditFilters>({
    dateFrom: "",
    dateTo: "",
  });

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  async function fetchAuditLogs() {
    setLoading(true);

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      toast.error("Error loading audit logs.");
      console.error(error);
      setLoading(false);
      return;
    }

    setLogs(data || []);
    setLoading(false);
  }

  const actionOptions = useMemo(() => {
    const uniqueActions = Array.from(new Set(logs.map((log) => log.action)));
    return ["All", ...uniqueActions];
  }, [logs]);

  const entityOptions = useMemo(() => {
    const uniqueEntities = Array.from(
      new Set(logs.map((log) => log.entity_type))
    );
    return ["All", ...uniqueEntities];
  }, [logs]);

  const filteredLogs = logs.filter((log) => {
    const search = searchTerm.toLowerCase();

    const matchesSearch =
      log.action.toLowerCase().includes(search) ||
      log.entity_type.toLowerCase().includes(search) ||
      (log.entity_id || "").toLowerCase().includes(search) ||
      (log.description || "").toLowerCase().includes(search) ||
      (log.user_email || "").toLowerCase().includes(search) ||
      JSON.stringify(log.metadata || {}).toLowerCase().includes(search);

    const matchesAction =
      actionFilter === "All" || log.action === actionFilter;

    const matchesEntity =
      entityFilter === "All" || log.entity_type === entityFilter;

    const matchesDate = isWithinDateRange(
      log.created_at,
      filters.dateFrom,
      filters.dateTo
    );

    return matchesSearch && matchesAction && matchesEntity && matchesDate;
  });

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  function updateDateFilter(field: keyof AuditFilters, value: string) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
    setCurrentPage(1);
  }

  function clearFilters() {
    setSearchTerm("");
    setActionFilter("All");
    setEntityFilter("All");
    setFilters({
      dateFrom: "",
      dateTo: "",
    });
    setCurrentPage(1);
  }

  function getActionBadgeClass(action: string) {
    if (action.includes("created")) {
      return "border-green-200 bg-green-50 text-green-700";
    }

    if (
      action.includes("deactivated") ||
      action.includes("failed") ||
      action.includes("deleted")
    ) {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (
      action.includes("updated") ||
      action.includes("reviewed") ||
      action.includes("exported")
    ) {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }

    if (
      action.includes("closed") ||
      action.includes("used") ||
      action.includes("printed")
    ) {
      return "border-slate-200 bg-slate-100 text-slate-700";
    }

    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }

  async function exportFilteredCsv() {
    if (filteredLogs.length === 0) {
      toast.error("No audit logs to export.");
      return;
    }

    setExporting(true);

    try {
      const generatedAt = new Date();

      const metadataRows = [
        ["SteriSphere Audit Logs Export"],
        ["Generated At", generatedAt.toLocaleString()],
        ["Records Exported", String(filteredLogs.length)],
        ["Search", searchTerm || "All"],
        ["Action Filter", actionFilter],
        ["Entity Filter", entityFilter],
        ["Date From", filters.dateFrom || "All"],
        ["Date To", filters.dateTo || "All"],
        [],
      ];

      const header = [
        "Created At",
        "User",
        "Action",
        "Entity Type",
        "Entity ID",
        "Description",
        "Metadata",
      ];

      const rows = filteredLogs.map((log) => [
        formatDateTime(log.created_at),
        log.user_email || "unknown",
        log.action,
        log.entity_type,
        log.entity_id || "",
        log.description || "",
        stringifyMetadata(log.metadata),
      ]);

      const csv = [...metadataRows, header, ...rows]
        .map((row) => row.map(escapeCsvValue).join(","))
        .join("\n");

      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = buildAuditExportFileName(
        actionFilter,
        entityFilter,
        filters
      );

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Audit logs CSV exported.");
    } catch (error) {
      toast.error("Error exporting audit logs.");
      console.error(error);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Audit Logs</h1>
        <p className="mt-2 text-slate-600">
          Review system activity, user actions, traceability events, and export
          audit evidence.
        </p>
      </header>

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
              onClick={clearFilters}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium hover:bg-slate-50"
            >
              Clear Filters
            </button>

            <button
              type="button"
              onClick={exportFilteredCsv}
              disabled={exporting || filteredLogs.length === 0}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? "Exporting..." : "Export Filtered CSV"}
            </button>

            <button
              type="button"
              onClick={fetchAuditLogs}
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
            onChange={(e) => {
              setActionFilter(e.target.value);
              setCurrentPage(1);
            }}
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
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setCurrentPage(1);
            }}
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
            onChange={(e) => updateDateFilter("dateFrom", e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3"
          />

          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => updateDateFilter("dateTo", e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3"
          />

          <input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="md:col-span-2 xl:col-span-4 rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Search by user, action, entity, description, ID, or metadata"
          />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Showing{" "}
          <span className="font-semibold text-slate-900">
            {filteredLogs.length}
          </span>{" "}
          of{" "}
          <span className="font-semibold text-slate-900">{logs.length}</span>{" "}
          audit event(s).
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {loading ? (
          <p className="text-slate-500">Loading audit logs...</p>
        ) : filteredLogs.length === 0 ? (
          <p className="text-slate-500">No audit logs found.</p>
        ) : (
          <>
            <div className="space-y-3">
              {paginatedLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${getActionBadgeClass(
                            log.action
                          )}`}
                        >
                          {formatActionLabel(log.action)}
                        </span>

                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          {log.entity_type}
                        </span>
                      </div>

                      <h2 className="mt-3 font-semibold text-slate-900">
                        {log.description || formatActionLabel(log.action)}
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        User: {log.user_email || "unknown"}
                      </p>

                      {log.entity_id && (
                        <p className="mt-1 break-all text-xs text-slate-400">
                          Entity ID: {log.entity_id}
                        </p>
                      )}

                      {log.metadata && (
                        <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <summary className="cursor-pointer text-sm font-medium text-slate-700">
                            View metadata
                          </summary>

                          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>

                    <p className="shrink-0 text-xs text-slate-400">
                      {formatDateTime(log.created_at)}
                    </p>
                  </div>
                </div>
              ))}
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
    </>
  );
}

function isWithinDateRange(createdAt: string, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;

  const createdDate = new Date(createdAt);

  if (dateFrom) {
    const from = new Date(`${dateFrom}T00:00:00`);
    if (createdDate < from) return false;
  }

  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59`);
    if (createdDate > to) return false;
  }

  return true;
}

function escapeCsvValue(value: string) {
  const safeValue = value ?? "";
  const escaped = safeValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

function stringifyMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return "";
  return JSON.stringify(metadata);
}

function buildAuditExportFileName(
  actionFilter: string,
  entityFilter: string,
  filters: AuditFilters
) {
  const today = new Date().toISOString().slice(0, 10);
  const parts = ["audit-logs"];

  if (actionFilter !== "All") {
    parts.push(slugify(actionFilter));
  }

  if (entityFilter !== "All") {
    parts.push(slugify(entityFilter));
  }

  if (filters.dateFrom && filters.dateTo) {
    parts.push(`${filters.dateFrom}-to-${filters.dateTo}`);
  } else if (filters.dateFrom) {
    parts.push(`from-${filters.dateFrom}`);
  } else if (filters.dateTo) {
    parts.push(`to-${filters.dateTo}`);
  }

  parts.push(today);

  return `${parts.join("-")}.csv`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatActionLabel(action: string) {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString();
}