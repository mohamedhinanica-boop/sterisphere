import "server-only";

import type {
  DeploymentAssignmentTargetValidationRepository,
} from "./deployment-assignment-target-validation-repository";
import type {
  DeploymentAssignmentTargetValidationAssignment,
  DeploymentAssignmentTargetValidationCounts,
  DeploymentAssignmentTargetValidationIssue,
  DeploymentAssignmentTargetValidationIssueCode,
  DeploymentAssignmentTargetValidationResult,
  DeploymentAssignmentTargetValidationSterilizerTarget,
  DeploymentAssignmentTargetValidationTargetType,
  DeploymentAssignmentTargetValidationWorkstationTarget,
} from "./deployment-assignment-target-validation-types";

const WORKSTATION_KEY_PATTERN = /^workstation-\d{3}$/;
const STERILIZER_KEY_PATTERN = /^sterilizer-\d{3}$/;

export class DeploymentAssignmentTargetValidationService {
  constructor(
    private readonly repository: DeploymentAssignmentTargetValidationRepository,
  ) {}

  async validateAssignmentTargetsForClinic(
    clinicId: string,
  ): Promise<DeploymentAssignmentTargetValidationResult> {
    const normalizedClinicId = clinicId.trim();

    if (!normalizedClinicId) {
      return buildResult([], [
        buildIssue({
          deploymentHardwareKey: "",
          targetType: "unknown",
          targetDeploymentKey: null,
          code: "target_missing",
          message:
            "Assignment target validation requires a clinic id before reading planned relationships.",
        }),
      ]);
    }

    const assignments =
      await this.repository.listPlannedHardwareAssignments(normalizedClinicId);

    return this.validateAssignmentTargetsForClinicAssignments(
      normalizedClinicId,
      assignments,
    );
  }

  async validateAssignmentTargetsForClinicAssignments(
    clinicId: string,
    assignments: readonly DeploymentAssignmentTargetValidationAssignment[],
  ): Promise<DeploymentAssignmentTargetValidationResult> {
    const normalizedClinicId = clinicId.trim();

    if (!normalizedClinicId) {
      return buildResult([], [
        buildIssue({
          deploymentHardwareKey: "",
          targetType: "unknown",
          targetDeploymentKey: null,
          code: "target_missing",
          message:
            "Assignment target validation requires a clinic id before reading planned relationships.",
        }),
      ]);
    }

    const scopedAssignments = assignments.map((assignment) => ({
      ...assignment,
      clinicId: normalizedClinicId,
    }));
    const issues: DeploymentAssignmentTargetValidationIssue[] = [];

    for (const assignment of scopedAssignments) {
      issues.push(
        ...(await this.validateAssignment(normalizedClinicId, assignment)),
      );
    }

    return buildResult(scopedAssignments, issues);
  }

  private async validateAssignment(
    clinicId: string,
    assignment: DeploymentAssignmentTargetValidationAssignment,
  ): Promise<readonly DeploymentAssignmentTargetValidationIssue[]> {
    if (assignment.targetType === "unassigned") {
      if (assignment.targetDeploymentKey === null) {
        return [];
      }

      return [
        buildIssue({
          assignment,
          code: "unexpected_target_key",
          message:
            "Unassigned hardware assignments must not carry a target deployment key.",
        }),
      ];
    }

    if (assignment.targetType === "workstation") {
      return this.validateWorkstationAssignment(clinicId, assignment);
    }

    if (assignment.targetType === "sterilizer") {
      return this.validateSterilizerAssignment(clinicId, assignment);
    }

    return [
      buildIssue({
        assignment,
        code: "unsupported_target_type",
        message:
          "Hardware assignment target type is not supported by deployment target validation.",
      }),
    ];
  }

  private async validateWorkstationAssignment(
    clinicId: string,
    assignment: DeploymentAssignmentTargetValidationAssignment,
  ): Promise<readonly DeploymentAssignmentTargetValidationIssue[]> {
    const targetKey = assignment.targetDeploymentKey;

    if (!targetKey) {
      return [
        buildIssue({
          assignment,
          code: "missing_target_key",
          message:
            "Workstation hardware assignments must carry a logical workstation deployment key.",
        }),
      ];
    }

    if (!WORKSTATION_KEY_PATTERN.test(targetKey)) {
      return [
        buildIssue({
          assignment,
          code: "malformed_target_key",
          message:
            "Workstation hardware assignment target keys must use the workstation-### deterministic format.",
        }),
      ];
    }

    const target =
      await this.repository.findWorkstationTargetByDeploymentKey(
        clinicId,
        targetKey,
      );

    if (target) {
      if (isCompatibleWorkstationTarget(clinicId, targetKey, target)) {
        return [];
      }

      return [
        buildIssue({
          assignment,
          code: "target_incompatible",
          message:
            "Workstation target exists in the clinic but is not an inactive setup-draft planned shell.",
        }),
      ];
    }

    const anyTarget =
      await this.repository.findAnyWorkstationTargetByDeploymentKey(targetKey);

    if (anyTarget) {
      return [
        buildIssue({
          assignment,
          code: "target_cross_clinic_or_legacy",
          message:
            "Workstation target key exists outside the clinic-scoped planned shell boundary.",
        }),
      ];
    }

    return [
      buildIssue({
        assignment,
        code: "target_missing",
        message: "Workstation target key does not match a planned shell.",
      }),
    ];
  }

  private async validateSterilizerAssignment(
    clinicId: string,
    assignment: DeploymentAssignmentTargetValidationAssignment,
  ): Promise<readonly DeploymentAssignmentTargetValidationIssue[]> {
    const targetKey = assignment.targetDeploymentKey;

    if (!targetKey) {
      return [
        buildIssue({
          assignment,
          code: "missing_target_key",
          message:
            "Sterilizer hardware assignments must carry a logical sterilizer deployment key.",
        }),
      ];
    }

    if (!STERILIZER_KEY_PATTERN.test(targetKey)) {
      return [
        buildIssue({
          assignment,
          code: "malformed_target_key",
          message:
            "Sterilizer hardware assignment target keys must use the sterilizer-### deterministic format.",
        }),
      ];
    }

    const target =
      await this.repository.findSterilizerTargetByDeploymentKey(
        clinicId,
        targetKey,
      );

    if (target) {
      if (isCompatibleSterilizerTarget(clinicId, targetKey, target)) {
        return [];
      }

      return [
        buildIssue({
          assignment,
          code: "target_incompatible",
          message:
            "Sterilizer target exists in the clinic but is not an inactive setup-draft planned shell.",
        }),
      ];
    }

    const anyTarget =
      await this.repository.findAnySterilizerTargetByDeploymentKey(targetKey);

    if (anyTarget) {
      return [
        buildIssue({
          assignment,
          code: "target_cross_clinic_or_legacy",
          message:
            "Sterilizer target key exists outside the clinic-scoped planned shell boundary.",
        }),
      ];
    }

    return [
      buildIssue({
        assignment,
        code: "target_missing",
        message: "Sterilizer target key does not match a planned shell.",
      }),
    ];
  }
}

export function createDeploymentAssignmentTargetValidationService(
  repository: DeploymentAssignmentTargetValidationRepository,
): DeploymentAssignmentTargetValidationService {
  return new DeploymentAssignmentTargetValidationService(repository);
}

function isCompatibleWorkstationTarget(
  clinicId: string,
  targetKey: string,
  target: DeploymentAssignmentTargetValidationWorkstationTarget,
): boolean {
  return (
    target.clinicId === clinicId &&
    target.deploymentWorkstationKey === targetKey &&
    target.status === "planned" &&
    target.provisioningSource === "setup_draft" &&
    target.provisioningStatus === "planned" &&
    target.active === false
  );
}

function isCompatibleSterilizerTarget(
  clinicId: string,
  targetKey: string,
  target: DeploymentAssignmentTargetValidationSterilizerTarget,
): boolean {
  return (
    target.clinicId === clinicId &&
    target.deploymentSterilizerKey === targetKey &&
    target.provisioningSource === "setup_draft" &&
    target.provisioningStatus === "planned" &&
    target.active === false
  );
}

function buildResult(
  assignments: readonly DeploymentAssignmentTargetValidationAssignment[],
  issues: readonly DeploymentAssignmentTargetValidationIssue[],
): DeploymentAssignmentTargetValidationResult {
  const orderedIssues = [...issues].sort(compareIssues);
  const invalidAssignments = Math.min(
    assignments.length,
    countInvalidAssignments(orderedIssues),
  );
  const counts: DeploymentAssignmentTargetValidationCounts = {
    requested: assignments.length,
    valid: assignments.length - invalidAssignments,
    invalid: invalidAssignments,
    missingTargets: orderedIssues.filter((issue) =>
      isMissingTargetIssue(issue.code),
    ).length,
    incompatibleTargets: orderedIssues.filter((issue) =>
      isIncompatibleTargetIssue(issue.code),
    ).length,
  };

  return {
    ok: orderedIssues.length === 0,
    status: orderedIssues.length === 0 ? "valid" : "invalid",
    counts,
    downstream: {
      requested: 0,
      created: 0,
      reused: 0,
      skipped: 0,
      conflicts: 0,
    },
    issues: orderedIssues,
    message:
      orderedIssues.length === 0
        ? "Hardware assignment target validation passed for all planned relationships."
        : "Hardware assignment target validation found planned relationships that need correction before target resolution.",
  };
}

function countInvalidAssignments(
  issues: readonly DeploymentAssignmentTargetValidationIssue[],
): number {
  return new Set(issues.map((issue) => issue.deploymentHardwareKey)).size;
}

function isMissingTargetIssue(
  code: DeploymentAssignmentTargetValidationIssueCode,
): boolean {
  return code === "target_missing" || code === "missing_target_key";
}

function isIncompatibleTargetIssue(
  code: DeploymentAssignmentTargetValidationIssueCode,
): boolean {
  return (
    code === "target_incompatible" ||
    code === "target_cross_clinic_or_legacy" ||
    code === "unexpected_target_key" ||
    code === "unsupported_target_type" ||
    code === "malformed_target_key"
  );
}

function compareIssues(
  left: DeploymentAssignmentTargetValidationIssue,
  right: DeploymentAssignmentTargetValidationIssue,
): number {
  return (
    left.deploymentHardwareKey.localeCompare(right.deploymentHardwareKey) ||
    String(left.targetType).localeCompare(String(right.targetType)) ||
    String(left.targetDeploymentKey ?? "").localeCompare(
      String(right.targetDeploymentKey ?? ""),
    ) ||
    left.code.localeCompare(right.code)
  );
}

function buildIssue(input: {
  assignment?: DeploymentAssignmentTargetValidationAssignment;
  deploymentHardwareKey?: string;
  targetType?: DeploymentAssignmentTargetValidationTargetType;
  targetDeploymentKey?: string | null;
  code: DeploymentAssignmentTargetValidationIssueCode;
  message: string;
}): DeploymentAssignmentTargetValidationIssue {
  return {
    deploymentHardwareKey:
      input.assignment?.deploymentHardwareKey ??
      input.deploymentHardwareKey ??
      "",
    targetType: input.assignment?.targetType ?? input.targetType ?? "unknown",
    targetDeploymentKey:
      input.assignment?.targetDeploymentKey ??
      input.targetDeploymentKey ??
      null,
    code: input.code,
    message: input.message,
  };
}
