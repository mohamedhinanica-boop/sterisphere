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

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [entityFilter, setEntityFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 10;

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  async function fetchAuditLogs() {
    setLoading(true);

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

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
      (log.user_email || "").toLowerCase().includes(search);

    const matchesAction =
      actionFilter === "All" || log.action === actionFilter;

    const matchesEntity =
      entityFilter === "All" || log.entity_type === entityFilter;

    return matchesSearch && matchesAction && matchesEntity;
  });

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  function getActionBadgeClass(action: string) {
    if (action.includes("created")) {
      return "border-green-200 bg-green-50 text-green-700";
    }

    if (action.includes("deactivated") || action.includes("failed")) {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (action.includes("updated") || action.includes("reviewed")) {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }

    if (action.includes("closed") || action.includes("used")) {
      return "border-slate-200 bg-slate-100 text-slate-700";
    }

    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Audit Logs</h1>
        <p className="mt-2 text-slate-600">
          Review system activity, user actions, and traceability events.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="md:col-span-2 rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Search by user, action, entity, or description"
          />
        </div>

        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-sm text-slate-500">
            Showing {filteredLogs.length} of {logs.length} audit event(s).
          </p>

          <button
            type="button"
            onClick={fetchAuditLogs}
            disabled={loading}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
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
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${getActionBadgeClass(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>

                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          {log.entity_type}
                        </span>
                      </div>

                      <h2 className="mt-3 font-semibold text-slate-900">
                        {log.description || log.action}
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        User: {log.user_email || "unknown"}
                      </p>

                      {log.entity_id && (
                        <p className="mt-1 text-xs text-slate-400">
                          Entity ID: {log.entity_id}
                        </p>
                      )}
                    </div>

                    <p className="text-xs text-slate-400">
                      {new Date(log.created_at).toLocaleString()}
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