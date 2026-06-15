export type AuditFilters = {
  dateFrom: string;
  dateTo: string;
};

export function isWithinDateRange(
  createdAt: string,
  dateFrom: string,
  dateTo: string,
) {
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

export function escapeCsvValue(value: string) {
  const safeValue = value ?? "";
  const escaped = safeValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function stringifyMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return "";
  return JSON.stringify(metadata);
}

export function buildAuditExportFileName(
  actionFilter: string,
  entityFilter: string,
  filters: AuditFilters,
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

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatActionLabel(action: string) {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatDateTime(date: string) {
  return new Date(date).toLocaleString();
}

export function getActionBadgeClass(action: string) {
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
