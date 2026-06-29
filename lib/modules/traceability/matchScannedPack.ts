export type ScannablePack = {
  pack_number: string;
};

export type PackScanMatchResult<T extends ScannablePack> =
  | {
      ok: true;
      normalizedValue: string;
      pack: T;
    }
  | {
      ok: false;
      normalizedValue: string;
      error: string;
    };

export function normalizeScannedPackValue(value: string): string {
  return value.trim();
}

export function matchScannedPack<T extends ScannablePack>(
  scannedValue: string,
  usablePacks: readonly T[],
): PackScanMatchResult<T> {
  const normalizedValue = normalizeScannedPackValue(scannedValue);

  if (!normalizedValue) {
    return {
      ok: false,
      normalizedValue,
      error: "The scanner did not return a pack value.",
    };
  }

  const normalizedLookupValue = normalizedValue.toLocaleUpperCase();
  const pack = usablePacks.find(
    (candidate) =>
      normalizeScannedPackValue(candidate.pack_number).toLocaleUpperCase() ===
      normalizedLookupValue,
  );

  if (!pack) {
    return {
      ok: false,
      normalizedValue,
      error: `Pack ${normalizedValue} is not usable. It may already be used, be expired or unavailable, or belong to a cycle that did not pass.`,
    };
  }

  return {
    ok: true,
    normalizedValue,
    pack,
  };
}
