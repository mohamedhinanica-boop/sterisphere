import {
  createDeploymentProvisionCounts,
  findDuplicateDeploymentKeys,
  resolveDeploymentProvisionStatus,
} from "./deployment-provisioning-utils";

export interface DeploymentProvisioningUtilsHarnessResult {
  scenario: string;
  passed: boolean;
  details?: string;
}

export function runDeploymentProvisioningUtilsHarness(): DeploymentProvisioningUtilsHarnessResult[] {
  const counts = createDeploymentProvisionCounts(3);
  const duplicateKeys = findDuplicateDeploymentKeys([
    "shell-001",
    "shell-002",
    "shell-001",
    "shell-003",
    "shell-002",
  ]);

  return [
    {
      scenario: "count envelope initializes downstream counters at zero",
      passed:
        counts.requested === 3 &&
        counts.created === 0 &&
        counts.reused === 0 &&
        counts.skipped === 0 &&
        counts.conflicts === 0,
    },
    {
      scenario: "duplicate key detection is deterministic",
      passed:
        duplicateKeys.size === 2 &&
        duplicateKeys.has("shell-001") &&
        duplicateKeys.has("shell-002"),
    },
    {
      scenario: "status resolves created",
      passed:
        resolveDeploymentProvisionStatus({
          requested: 1,
          created: 1,
          reused: 0,
          skipped: 0,
          conflicts: 0,
        }) === "created",
    },
    {
      scenario: "status resolves reused",
      passed:
        resolveDeploymentProvisionStatus({
          requested: 1,
          created: 0,
          reused: 1,
          skipped: 0,
          conflicts: 0,
        }) === "reused",
    },
    {
      scenario: "status resolves partial for mixed success",
      passed:
        resolveDeploymentProvisionStatus({
          requested: 2,
          created: 1,
          reused: 1,
          skipped: 0,
          conflicts: 0,
        }) === "partial",
    },
    {
      scenario: "status resolves conflict when all requested shells conflict",
      passed:
        resolveDeploymentProvisionStatus({
          requested: 1,
          created: 0,
          reused: 0,
          skipped: 1,
          conflicts: 1,
        }) === "conflict",
    },
    {
      scenario: "status resolves partial when conflict follows success",
      passed:
        resolveDeploymentProvisionStatus({
          requested: 2,
          created: 1,
          reused: 0,
          skipped: 1,
          conflicts: 1,
        }) === "partial",
    },
  ];
}