export interface DeploymentProvisionCounts {
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
}

export type DeploymentProvisionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected";

export function createDeploymentProvisionCounts(
  requested: number,
): DeploymentProvisionCounts {
  return {
    requested,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  };
}

export function findDuplicateDeploymentKeys(
  keys: readonly string[],
): Set<string> {
  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();

  keys.forEach((key) => {
    if (seenKeys.has(key)) {
      duplicateKeys.add(key);
      return;
    }

    seenKeys.add(key);
  });

  return duplicateKeys;
}

export function resolveDeploymentProvisionStatus<
  TStatus extends DeploymentProvisionStatus = DeploymentProvisionStatus,
>(counts: DeploymentProvisionCounts): TStatus {
  if (counts.conflicts > 0) {
    return (counts.created > 0 || counts.reused > 0
      ? "partial"
      : "conflict") as TStatus;
  }

  if (counts.created > 0) {
    return (counts.reused > 0 ? "partial" : "created") as TStatus;
  }

  return "reused" as TStatus;
}
