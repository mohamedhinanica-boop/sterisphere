import type { ScanIntent } from "./scan-intent";
import type { ScanSource } from "./scan-source";

export interface ResolveScanInput {
  source: ScanSource;
  rawValue: string;
}

export interface ResolvedScan {
  source: ScanSource;
  rawValue: string;
  normalizedValue: string;
  intent: ScanIntent;
}
