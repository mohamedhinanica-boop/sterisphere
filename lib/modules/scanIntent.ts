export type ScanIntent =
  | {
      type: "pack_trace_candidate";
      normalizedValue: string;
    }
  | {
      type: "unknown_scan";
      normalizedValue: string;
    };

const PACK_CODE_PATTERN = /^PACK-\d{4}-\d{4,}$/;

export function normalizeScannedValue(value: string): string {
  return value.trim().toLocaleUpperCase();
}

export function getScanIntent(value: string): ScanIntent {
  const normalizedValue = normalizeScannedValue(value);

  if (PACK_CODE_PATTERN.test(normalizedValue)) {
    return {
      type: "pack_trace_candidate",
      normalizedValue,
    };
  }

  return {
    type: "unknown_scan",
    normalizedValue,
  };
}
