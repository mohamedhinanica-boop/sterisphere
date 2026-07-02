export const ScanIntent = {
  PACK_TRACE: "PACK_TRACE",
  UNKNOWN: "UNKNOWN",
} as const;

export type ScanIntent = (typeof ScanIntent)[keyof typeof ScanIntent];

const PACK_CODE_PATTERN = /^PACK-\d{4}-\d{4,}$/;

export function normalizeScanValue(value: string): string {
  return value.trim().toLocaleUpperCase();
}

export function identifyScanIntent(normalizedValue: string): ScanIntent {
  return PACK_CODE_PATTERN.test(normalizedValue)
    ? ScanIntent.PACK_TRACE
    : ScanIntent.UNKNOWN;
}
