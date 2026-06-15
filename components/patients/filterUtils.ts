export function isTraceWithinDateRange(
  createdAt: string | null,
  dateFrom: string,
  dateTo: string
) {
  if (!dateFrom && !dateTo) return true;
  if (!createdAt) return false;

  const traceDate = new Date(createdAt);
  const traceLocalDate = [
    traceDate.getFullYear(),
    String(traceDate.getMonth() + 1).padStart(2, "0"),
    String(traceDate.getDate()).padStart(2, "0"),
  ].join("-");

  if (dateFrom && traceLocalDate < dateFrom) return false;
  if (dateTo && traceLocalDate > dateTo) return false;

  return true;
}

export function formatDate(date: string | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString();
}

export function formatDateTime(date: string | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleString();
}
