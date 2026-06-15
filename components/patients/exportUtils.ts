type TraceFilters = {
  patientName: string;
  provider: string;
  packNumber: string;
  procedure: string;
  dateFrom: string;
  dateTo: string;
};

export function escapeCsvValue(value: string) {
  const safeValue = value ?? "";
  const escaped = safeValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildExportFileName(
  filters: TraceFilters,
  quickSearch: string
) {
  const today = new Date().toISOString().slice(0, 10);
  const parts = ["traceability"];

  if (filters.provider) {
    parts.push(slugify(filters.provider));
  }

  if (filters.dateFrom && filters.dateTo) {
    parts.push(`${filters.dateFrom}-to-${filters.dateTo}`);
  } else if (filters.dateFrom) {
    parts.push(`from-${filters.dateFrom}`);
  } else if (filters.dateTo) {
    parts.push(`to-${filters.dateTo}`);
  }

  if (filters.patientName) {
    parts.push(slugify(filters.patientName));
  }

  if (filters.packNumber) {
    parts.push(slugify(filters.packNumber));
  }

  if (quickSearch) {
    parts.push("search");
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
