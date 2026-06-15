import type {
  InvestigationCycle,
  InvestigationLoadItem,
} from "@/lib/modules/investigation";

export function getRiskLevel(
  cycle: InvestigationCycle | null,
  packCount: number,
  patientCount: number,
) {
  if (!cycle) return "N/A";

  if (cycle.status === "Failed" && patientCount > 0) {
    return "High";
  }

  if (cycle.status === "Failed" && packCount > 0) {
    return "Medium";
  }

  if (cycle.status === "Failed") {
    return "Review";
  }

  return "Low";
}

export function getValue(
  item: InvestigationLoadItem,
  ...keys: string[]
): string | number | null {
  const record = item as unknown as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" || typeof value === "number") {
      return value;
    }
  }

  return null;
}
