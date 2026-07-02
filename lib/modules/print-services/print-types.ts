export const PrintSource = {
  BROWSER: "BROWSER",
  CLINIC_AGENT: "CLINIC_AGENT",
  SYSTEM: "SYSTEM",
  UNKNOWN: "UNKNOWN",
} as const;

export type PrintSource = (typeof PrintSource)[keyof typeof PrintSource];

export const PrintIntent = {
  PACK_LABEL: "PACK_LABEL",
  TEST_LABEL: "TEST_LABEL",
  REPORT: "REPORT",
  UNKNOWN: "UNKNOWN",
} as const;

export type PrintIntent = (typeof PrintIntent)[keyof typeof PrintIntent];

export const PrintJobStatus = {
  PLANNED: "planned",
  QUEUED: "queued",
  SENT: "sent",
  PRINTED: "printed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type PrintJobStatus =
  (typeof PrintJobStatus)[keyof typeof PrintJobStatus];

export type PrintPayload = Readonly<Record<string, unknown>>;

export interface ResolvePrintRequestInput {
  intent: PrintIntent | string;
  source: PrintSource | string;
  payload?: unknown;
}

export interface ResolvedPrintRequest {
  intent: PrintIntent;
  source: PrintSource;
  payload: PrintPayload;
  status: PrintJobStatus;
}

export type ResolvePrintRequestResult =
  | {
      ok: true;
      request: ResolvedPrintRequest;
      errors: [];
    }
  | {
      ok: false;
      request: ResolvedPrintRequest;
      errors: string[];
    };
