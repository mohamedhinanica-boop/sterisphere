export function isTraceWithinDateRange(createdAt: string | null, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;
  if (!createdAt) return false;

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
