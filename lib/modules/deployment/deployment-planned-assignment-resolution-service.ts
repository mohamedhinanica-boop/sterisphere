import "server-only";

import type {
  DeploymentPlannedAssignmentResolutionRepository,
} from "./deployment-planned-assignment-resolution-repository";
import type {
  DeploymentPlannedAssignmentResolutionAssignment,
  DeploymentPlannedAssignmentResolutionCounts,
  DeploymentPlannedAssignmentResolutionHardwareShell,
  DeploymentPlannedAssignmentResolutionIssue,
  DeploymentPlannedAssignmentResolutionIssueCode,
  DeploymentPlannedAssignmentResolutionResult,
  DeploymentPlannedAssignmentResolvedRecord,
  DeploymentPlannedAssignmentResolutionSterilizerShell,
  DeploymentPlannedAssignmentResolutionTargetType,
  DeploymentPlannedAssignmentResolutionWorkstationShell,
} from "./deployment-planned-assignment-resolution-types";

const HARDWARE_KEY_PATTERN = /^hardware-\d{3}$/;
const WORKSTATION_KEY_PATTERN = /^workstation-\d{3}$/;
const STERILIZER_KEY_PATTERN = /^sterilizer-\d{3}$/;

export class DeploymentPlannedAssignmentResolutionService {
  constructor(
    private readonly repository: DeploymentPlannedAssignmentResolutionRepository,
  ) {}

  async resolveAssignmentsForClinic(
    clinicId: string,
  ): Promise<DeploymentPlannedAssignmentResolutionResult> {
    const normalizedClinicId = clinicId.trim();

    if (!normalizedClinicId) {
      return buildResult([], [
        buildIssue({
          deploymentHardwareKey: "",
          assignmentKey: null,
          targetType: "unknown",
          targetDeploymentKey: null,
          code: "hardware_missing",
          message:
            "Planned assignment resolution requires a clinic id before reading planned relationships.",
        }),
      ]);
    }

    const assignments =
      await this.repository.listPlannedHardwareAssignments(normalizedClinicId);

    return this.resolveAssignmentsForClinicAssignments(
      normalizedClinicId,
      assignments,
    );
  }

  async resolveAssignmentsForClinicAssignments(
    clinicId: string,
    assignments: readonly DeploymentPlannedAssignmentResolutionAssignment[],
  ): Promise<DeploymentPlannedAssignmentResolutionResult> {
    const normalizedClinicId = clinicId.trim();

    if (!normalizedClinicId) {
      return buildResult([], [
        buildIssue({
          deploymentHardwareKey: "",
          assignmentKey: null,
          targetType: "unknown",
          targetDeploymentKey: null,
          code: "hardware_missing",
          message:
            "Planned assignment resolution requires a clinic id before resolving planned relationships.",
        }),
      ]);
    }

    const records: DeploymentPlannedAssignmentResolvedRecord[] = [];
    const scopedAssignments = assignments.map((assignment) => ({
      ...assignment,
      clinicId: normalizedClinicId,
    }));

    for (const assignment of scopedAssignments) {
      records.push(await this.resolveAssignment(normalizedClinicId, assignment));
    }

    return buildResult(records);
  }

  private async resolveAssignment(
    clinicId: string,
    assignment: DeploymentPlannedAssignmentResolutionAssignment,
  ): Promise<DeploymentPlannedAssignmentResolvedRecord> {
    const issues: DeploymentPlannedAssignmentResolutionIssue[] = [];
    const hardwareResolution = await this.resolveHardware(clinicId, assignment);
    issues.push(...hardwareResolution.issues);

    const targetResolution = await this.resolveTarget(clinicId, assignment);
    issues.push(...targetResolution.issues);

    const orderedIssues = issues.sort(compareIssues);

    return {
      clinicId,
      deploymentHardwareKey: assignment.deploymentHardwareKey,
      hardwareId: hardwareResolution.id,
      assignmentKey: assignment.assignmentKey,
      targetType: assignment.targetType,
      targetDeploymentKey: assignment.targetDeploymentKey,
      targetId: targetResolution.id,
      resolutionStatus: orderedIssues.length === 0 ? "resolved" : "unresolved",
      issues: orderedIssues,
    };
  }

  private async resolveHardware(
    clinicId: string,
    assignment: DeploymentPlannedAssignmentResolutionAssignment,
  ): Promise<{
    id: string | null;
    issues: readonly DeploymentPlannedAssignmentResolutionIssue[];
  }> {
    const hardwareKey = assignment.deploymentHardwareKey;

    if (!HARDWARE_KEY_PATTERN.test(hardwareKey)) {
      return {
        id: null,
        issues: [
          buildIssue({
            assignment,
            code: "malformed_hardware_key",
            message:
              "Hardware assignment resolution requires hardware-### deterministic hardware keys.",
          }),
        ],
      };
    }

    const hardware = await this.repository.findHardwareShellByDeploymentKey(
      clinicId,
      hardwareKey,
    );

    if (hardware) {
      if (isOperationallyBoundHardwareShell(hardware)) {
        return {
          id: null,
          issues: [
            buildIssue({
              assignment,
              code: "hardware_operationally_bound",
              message:
                "Hardware shell is already operationally bound and cannot be used for planned assignment resolution.",
            }),
          ],
        };
      }

      if (isCompatibleHardwareShell(clinicId, hardwareKey, hardware)) {
        return { id: hardware.id, issues: [] };
      }

      return {
        id: null,
        issues: [
          buildIssue({
            assignment,
            code: "hardware_incompatible",
            message:
              "Hardware shell exists in the clinic but is not an inactive setup-draft planned shell.",
          }),
        ],
      };
    }

    const anyHardware =
      await this.repository.findAnyHardwareShellByDeploymentKey(hardwareKey);

    if (anyHardware) {
      return {
        id: null,
        issues: [
          buildIssue({
            assignment,
            code: "hardware_cross_clinic_or_legacy",
            message:
              "Hardware deployment key exists outside the clinic-scoped planned shell boundary.",
          }),
        ],
      };
    }

    return {
      id: null,
      issues: [
        buildIssue({
          assignment,
          code: "hardware_missing",
          message:
            "Hardware deployment key does not match a planned hardware shell.",
        }),
      ],
    };
  }

  private async resolveTarget(
    clinicId: string,
    assignment: DeploymentPlannedAssignmentResolutionAssignment,
  ): Promise<{
    id: string | null;
    issues: readonly DeploymentPlannedAssignmentResolutionIssue[];
  }> {
    if (assignment.targetType === "unassigned") {
      if (assignment.targetDeploymentKey === null) {
        return { id: null, issues: [] };
      }

      return {
        id: null,
        issues: [
          buildIssue({
            assignment,
            code: "unexpected_target_key",
            message:
              "Unassigned planned hardware relationships must not carry a target deployment key.",
          }),
        ],
      };
    }

    if (assignment.targetType === "workstation") {
      return this.resolveWorkstationTarget(clinicId, assignment);
    }

    if (assignment.targetType === "sterilizer") {
      return this.resolveSterilizerTarget(clinicId, assignment);
    }

    return {
      id: null,
      issues: [
        buildIssue({
          assignment,
          code: "unsupported_target_type",
          message:
            "Planned hardware assignment target type is not supported by assignment resolution.",
        }),
      ],
    };
  }

  private async resolveWorkstationTarget(
    clinicId: string,
    assignment: DeploymentPlannedAssignmentResolutionAssignment,
  ): Promise<{
    id: string | null;
    issues: readonly DeploymentPlannedAssignmentResolutionIssue[];
  }> {
    const targetKey = assignment.targetDeploymentKey;

    if (!targetKey) {
      return targetIssue(
        assignment,
        "missing_target_key",
        "Workstation planned hardware relationships require a logical workstation deployment key.",
      );
    }

    if (!WORKSTATION_KEY_PATTERN.test(targetKey)) {
      return targetIssue(
        assignment,
        "malformed_target_key",
        "Workstation target keys must use the workstation-### deterministic format.",
      );
    }

    const target = await this.repository.findWorkstationShellByDeploymentKey(
      clinicId,
      targetKey,
    );

    if (target) {
      if (isCompatibleWorkstationShell(clinicId, targetKey, target)) {
        return { id: target.id, issues: [] };
      }

      return targetIssue(
        assignment,
        "target_incompatible",
        "Workstation target exists in the clinic but is not an inactive setup-draft planned shell.",
      );
    }

    const anyTarget =
      await this.repository.findAnyWorkstationShellByDeploymentKey(targetKey);

    if (anyTarget) {
      return targetIssue(
        assignment,
        "target_cross_clinic_or_legacy",
        "Workstation target key exists outside the clinic-scoped planned shell boundary.",
      );
    }

    return targetIssue(
      assignment,
      "target_missing",
      "Workstation target key does not match a planned shell.",
    );
  }

  private async resolveSterilizerTarget(
    clinicId: string,
    assignment: DeploymentPlannedAssignmentResolutionAssignment,
  ): Promise<{
    id: string | null;
    issues: readonly DeploymentPlannedAssignmentResolutionIssue[];
  }> {
    const targetKey = assignment.targetDeploymentKey;

    if (!targetKey) {
      return targetIssue(
        assignment,
        "missing_target_key",
        "Sterilizer planned hardware relationships require a logical sterilizer deployment key.",
      );
    }

    if (!STERILIZER_KEY_PATTERN.test(targetKey)) {
      return targetIssue(
        assignment,
        "malformed_target_key",
        "Sterilizer target keys must use the sterilizer-### deterministic format.",
      );
    }

    const target = await this.repository.findSterilizerShellByDeploymentKey(
      clinicId,
      targetKey,
    );

    if (target) {
      if (isCompatibleSterilizerShell(clinicId, targetKey, target)) {
        return { id: target.id, issues: [] };
      }

      return targetIssue(
        assignment,
        "target_incompatible",
        "Sterilizer target exists in the clinic but is not an inactive setup-draft planned shell.",
      );
    }

    const anyTarget =
      await this.repository.findAnySterilizerShellByDeploymentKey(targetKey);

    if (anyTarget) {
      return targetIssue(
        assignment,
        "target_cross_clinic_or_legacy",
        "Sterilizer target key exists outside the clinic-scoped planned shell boundary.",
      );
    }

    return targetIssue(
      assignment,
      "target_missing",
      "Sterilizer target key does not match a planned shell.",
    );
  }
}

export function createDeploymentPlannedAssignmentResolutionService(
  repository: DeploymentPlannedAssignmentResolutionRepository,
): DeploymentPlannedAssignmentResolutionService {
  return new DeploymentPlannedAssignmentResolutionService(repository);
}

function isCompatibleHardwareShell(
  clinicId: string,
  hardwareKey: string,
  hardware: DeploymentPlannedAssignmentResolutionHardwareShell,
): boolean {
  return (
    hardware.clinicId === clinicId &&
    hardware.deploymentHardwareKey === hardwareKey &&
    hardware.status === "planned" &&
    hardware.provisioningSource === "setup_draft" &&
    hardware.provisioningStatus === "planned" &&
    hardware.active === false &&
    !isOperationallyBoundHardwareShell(hardware)
  );
}

function isOperationallyBoundHardwareShell(
  hardware: DeploymentPlannedAssignmentResolutionHardwareShell,
): boolean {
  return Boolean(
    hardware.agentId ||
      hardware.defaultWorkstationId ||
      hardware.currentWorkstationId,
  );
}

function isCompatibleWorkstationShell(
  clinicId: string,
  targetKey: string,
  target: DeploymentPlannedAssignmentResolutionWorkstationShell,
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

function isCompatibleSterilizerShell(
  clinicId: string,
  targetKey: string,
  target: DeploymentPlannedAssignmentResolutionSterilizerShell,
): boolean {
  return (
    target.clinicId === clinicId &&
    target.deploymentSterilizerKey === targetKey &&
    target.provisioningSource === "setup_draft" &&
    target.provisioningStatus === "planned" &&
    target.active === false
  );
}

function targetIssue(
  assignment: DeploymentPlannedAssignmentResolutionAssignment,
  code: DeploymentPlannedAssignmentResolutionIssueCode,
  message: string,
): {
  id: string | null;
  issues: readonly DeploymentPlannedAssignmentResolutionIssue[];
} {
  return {
    id: null,
    issues: [buildIssue({ assignment, code, message })],
  };
}

function buildResult(
  input:
    | readonly DeploymentPlannedAssignmentResolvedRecord[]
    | readonly DeploymentPlannedAssignmentResolutionIssue[],
  issues: readonly DeploymentPlannedAssignmentResolutionIssue[] = [],
): DeploymentPlannedAssignmentResolutionResult {
  const inputIsRecordList = isRecordList(input) && issues.length === 0;
  const records = inputIsRecordList ? [...input].sort(compareRecords) : [];
  const orderedIssues = inputIsRecordList
    ? records.flatMap((record) => record.issues).sort(compareIssues)
    : [...(input as readonly DeploymentPlannedAssignmentResolutionIssue[]), ...issues].sort(compareIssues);
  const counts: DeploymentPlannedAssignmentResolutionCounts = {
    requested: records.length,
    resolved: records.filter((record) => record.resolutionStatus === "resolved")
      .length,
    unresolved: records.filter(
      (record) => record.resolutionStatus === "unresolved",
    ).length,
    missingHardware: orderedIssues.filter((issue) =>
      isMissingHardwareIssue(issue.code),
    ).length,
    missingTargets: orderedIssues.filter((issue) =>
      isMissingTargetIssue(issue.code),
    ).length,
    incompatibleHardware: orderedIssues.filter((issue) =>
      isIncompatibleHardwareIssue(issue.code),
    ).length,
    incompatibleTargets: orderedIssues.filter((issue) =>
      isIncompatibleTargetIssue(issue.code),
    ).length,
  };

  return {
    ok: orderedIssues.length === 0,
    status: orderedIssues.length === 0 ? "resolved" : "unresolved",
    records,
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
        ? "Planned hardware assignment resolution completed in memory for all relationships."
        : "Planned hardware assignment resolution found relationships that cannot be safely resolved.",
  };
}

function isRecordList(
  input:
    | readonly DeploymentPlannedAssignmentResolvedRecord[]
    | readonly DeploymentPlannedAssignmentResolutionIssue[],
): input is readonly DeploymentPlannedAssignmentResolvedRecord[] {
  return input.every((item) => "resolutionStatus" in item);
}

function isMissingHardwareIssue(
  code: DeploymentPlannedAssignmentResolutionIssueCode,
): boolean {
  return code === "hardware_missing";
}

function isMissingTargetIssue(
  code: DeploymentPlannedAssignmentResolutionIssueCode,
): boolean {
  return code === "target_missing" || code === "missing_target_key";
}

function isIncompatibleHardwareIssue(
  code: DeploymentPlannedAssignmentResolutionIssueCode,
): boolean {
  return (
    code === "malformed_hardware_key" ||
    code === "hardware_cross_clinic_or_legacy" ||
    code === "hardware_incompatible" ||
    code === "hardware_operationally_bound"
  );
}

function isIncompatibleTargetIssue(
  code: DeploymentPlannedAssignmentResolutionIssueCode,
): boolean {
  return (
    code === "unexpected_target_key" ||
    code === "unsupported_target_type" ||
    code === "malformed_target_key" ||
    code === "target_cross_clinic_or_legacy" ||
    code === "target_incompatible"
  );
}

function compareRecords(
  left: DeploymentPlannedAssignmentResolvedRecord,
  right: DeploymentPlannedAssignmentResolvedRecord,
): number {
  return (
    left.deploymentHardwareKey.localeCompare(right.deploymentHardwareKey) ||
    String(left.assignmentKey ?? "").localeCompare(
      String(right.assignmentKey ?? ""),
    )
  );
}

function compareIssues(
  left: DeploymentPlannedAssignmentResolutionIssue,
  right: DeploymentPlannedAssignmentResolutionIssue,
): number {
  return (
    left.deploymentHardwareKey.localeCompare(right.deploymentHardwareKey) ||
    String(left.assignmentKey ?? "").localeCompare(
      String(right.assignmentKey ?? ""),
    ) ||
    String(left.targetType).localeCompare(String(right.targetType)) ||
    String(left.targetDeploymentKey ?? "").localeCompare(
      String(right.targetDeploymentKey ?? ""),
    ) ||
    left.code.localeCompare(right.code)
  );
}

function buildIssue(input: {
  assignment?: DeploymentPlannedAssignmentResolutionAssignment;
  deploymentHardwareKey?: string;
  assignmentKey?: string | null;
  targetType?: DeploymentPlannedAssignmentResolutionTargetType;
  targetDeploymentKey?: string | null;
  code: DeploymentPlannedAssignmentResolutionIssueCode;
  message: string;
}): DeploymentPlannedAssignmentResolutionIssue {
  return {
    deploymentHardwareKey:
      input.assignment?.deploymentHardwareKey ??
      input.deploymentHardwareKey ??
      "",
    assignmentKey:
      input.assignment?.assignmentKey ?? input.assignmentKey ?? null,
    targetType: input.assignment?.targetType ?? input.targetType ?? "unknown",
    targetDeploymentKey:
      input.assignment?.targetDeploymentKey ??
      input.targetDeploymentKey ??
      null,
    code: input.code,
    message: input.message,
  };
}
