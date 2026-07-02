import { identifyScanIntent, normalizeScanValue } from "./scan-intent";
import type { ResolveScanInput, ResolvedScan } from "./scan-types";

export function resolveScan({
  source,
  rawValue,
}: ResolveScanInput): ResolvedScan {
  const normalizedValue = normalizeScanValue(rawValue);

  return {
    source,
    rawValue,
    normalizedValue,
    intent: identifyScanIntent(normalizedValue),
  };
}
