import {
  PrintIntent,
  PrintJobStatus,
  PrintSource,
  type PrintPayload,
  type ResolvePrintRequestInput,
  type ResolvePrintRequestResult,
} from "./print-types";

const PRINT_INTENTS = new Set<string>(Object.values(PrintIntent));
const PRINT_SOURCES = new Set<string>(Object.values(PrintSource));

export function resolvePrintRequest({
  intent,
  source,
  payload,
}: ResolvePrintRequestInput): ResolvePrintRequestResult {
  const normalizedIntent = normalizeIntent(intent);
  const normalizedSource = normalizeSource(source);
  const normalizedPayload = normalizePayload(payload);
  const errors = validatePayload(normalizedIntent, normalizedPayload, payload);

  if (normalizedIntent === PrintIntent.UNKNOWN) {
    errors.unshift("Print intent is not supported.");
  }

  if (normalizedSource === PrintSource.UNKNOWN) {
    errors.push("Print source is not recognized.");
  }

  const request = {
    intent: normalizedIntent,
    source: normalizedSource,
    payload: normalizedPayload,
    status:
      errors.length === 0 ? PrintJobStatus.PLANNED : PrintJobStatus.FAILED,
  };

  return errors.length === 0
    ? { ok: true, request, errors: [] }
    : { ok: false, request, errors };
}

function normalizeIntent(value: string): PrintIntent {
  const normalizedValue = value.trim().toLocaleUpperCase();

  return PRINT_INTENTS.has(normalizedValue)
    ? (normalizedValue as PrintIntent)
    : PrintIntent.UNKNOWN;
}

function normalizeSource(value: string): PrintSource {
  const normalizedValue = value.trim().toLocaleUpperCase();

  return PRINT_SOURCES.has(normalizedValue)
    ? (normalizedValue as PrintSource)
    : PrintSource.UNKNOWN;
}

function normalizePayload(payload: unknown): PrintPayload {
  if (!isPlainObject(payload)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ]),
  );
}

function validatePayload(
  intent: PrintIntent,
  payload: PrintPayload,
  rawPayload: unknown,
): string[] {
  if (!isPlainObject(rawPayload)) {
    return ["Print payload must be an object."];
  }

  if (intent === PrintIntent.PACK_LABEL) {
    return requireTextFields(payload, [
      ["packNumber", "Pack number"],
      ["cycleNumber", "Cycle number"],
      ["qrValue", "QR value"],
    ]);
  }

  if (intent === PrintIntent.REPORT) {
    return requireTextFields(payload, [["reportId", "Report ID"]]);
  }

  return [];
}

function requireTextFields(
  payload: PrintPayload,
  fields: ReadonlyArray<readonly [key: string, label: string]>,
): string[] {
  return fields.flatMap(([key, label]) =>
    typeof payload[key] === "string" && payload[key].length > 0
      ? []
      : [`${label} is required.`],
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
