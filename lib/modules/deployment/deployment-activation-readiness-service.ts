import "server-only";

import type {
  DeploymentActivationReadinessRepository,
} from "./deployment-activation-readiness-repository";
import type {
  DeploymentActivationReadinessAssessmentCommand,
  DeploymentActivationReadinessEntityType,
  DeploymentActivationReadinessHardwareAssignment,
  DeploymentActivationReadinessHardwareShell,
  DeploymentActivationReadinessIssue,
  DeploymentActivationReadinessIssueCode,
  DeploymentActivationReadinessIssueSeverity,
  DeploymentActivationReadinessProviderShell,
  DeploymentActivationReadinessResult,
  DeploymentActivationReadinessSnapshot,
  DeploymentActivationReadinessSterilizerShell,
  DeploymentActivationReadinessWorkstationShell,
} from "./deployment-activation-readiness-types";

const FAILED_DEPLOYMENT_STATES = new Set([
  "failed",
  "blocked",
  "cancelled",
  "archived",
]);

export class DeploymentActivationReadinessService {
  constructor(
    private readonly repository: DeploymentActivationReadinessRepository,
  ) {}

  async assessDeploymentActivationReadiness(
    command: DeploymentActivationReadinessAssessmentCommand,
  ): Promise<DeploymentActivationReadinessResult> {
    try {
      const clinicId = command.clinicId.trim();
      const deploymentRunId = command.deploymentRunId.trim();

      if (!clinicId || !deploymentRunId) {
        return buildResult({
          checksPassed: 0,
          issues: [
            buildIssue({
              code: "deployment_run_missing",
              entityType: "deployment_run",
              deploymentKey: deploymentRunId || null,
              message:
                "Activation readiness requires a clinic id and deployment run id.",
            }),
          ],
        });
      }

      const snapshot = await this.repository.getReadinessSnapshot({
        ...command,
        clinicId,
        deploymentRunId,
      });

      return assessSnapshot(clinicId, deploymentRunId, command, snapshot);
    } catch {
      return {
        ok: false,
        status: "error",
        checksRequested: 0,
        checksPassed: 0,
        checksFailed: 0,
        blockers: 0,
        warnings: 0,
        issues: [],
        downstream: zeroDownstream(),
        message:
          "Deployment activation readiness could not be assessed because the readiness repository failed unexpectedly.",
      };
    }
  }
}

export function createDeploymentActivationReadinessService(
  repository: DeploymentActivationReadinessRepository,
): DeploymentActivationReadinessService {
  return new DeploymentActivationReadinessService(repository);
}

function assessSnapshot(
  clinicId: string,
  deploymentRunId: string,
  command: DeploymentActivationReadinessAssessmentCommand,
  snapshot: DeploymentActivationReadinessSnapshot,
): DeploymentActivationReadinessResult {
  let checksPassed = 0;
  const issues: DeploymentActivationReadinessIssue[] = [];

  const pass = () => {
    checksPassed += 1;
  };
  const block = (input: BuildIssueInput) => issues.push(buildIssue(input));

  assessDeploymentRun(snapshot, clinicId, deploymentRunId, pass, block);
  assessClinicRoot(snapshot, clinicId, pass, block);
  assessProviderShells(snapshot.providerShells, command.expected.providerKeys, clinicId, pass, block);
  assessSterilizerShells(snapshot.sterilizerShells, command.expected.sterilizerKeys, clinicId, pass, block);
  assessWorkstationShells(snapshot.workstationShells, command.expected.workstationKeys, clinicId, pass, block);
  assessHardwareShells(snapshot.hardwareShells, command.expected.hardwareKeys, clinicId, pass, block);
  assessHardwareAssignments(snapshot.hardwareAssignments, command.expected.hardwareKeys, clinicId, pass, block);
  assessAssignmentTargetValidation(snapshot, pass, block);
  assessPlannedAssignmentResolution(snapshot, pass, block);

  const warnings = (snapshot.warnings ?? []).map((issue) => ({
    ...issue,
    severity: "warning" as const,
  }));
  const orderedIssues = [...issues, ...warnings].sort(compareIssues);

  return buildResult({
    checksPassed,
    issues: orderedIssues,
  });
}

function assessDeploymentRun(
  snapshot: DeploymentActivationReadinessSnapshot,
  clinicId: string,
  deploymentRunId: string,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
): void {
  const run = snapshot.deploymentRun;

  if (!run || run.deploymentRunId !== deploymentRunId) {
    block({
      code: "deployment_run_missing",
      entityType: "deployment_run",
      deploymentKey: deploymentRunId,
      message: "Deployment run evidence is missing for activation readiness.",
    });
    return;
  }

  if (
    run.clinicId !== clinicId ||
    isFailedState(run.lifecycleState) ||
    isFailedState(run.deploymentStatus)
  ) {
    block({
      code: "deployment_run_incompatible",
      entityType: "deployment_run",
      deploymentKey: deploymentRunId,
      message:
        "Deployment run is not linked to the expected clinic or is in a failed deployment state.",
    });
    return;
  }

  pass();
}

function assessClinicRoot(
  snapshot: DeploymentActivationReadinessSnapshot,
  clinicId: string,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
): void {
  if (!snapshot.clinic || snapshot.clinic.id !== clinicId) {
    block({
      code: "clinic_missing",
      entityType: "clinic",
      deploymentKey: null,
      message: "Draft clinic root is missing for activation readiness.",
    });
  } else {
    pass();
  }

  if (!snapshot.clinicSettings || snapshot.clinicSettings.clinicId !== clinicId) {
    block({
      code: "clinic_settings_missing",
      entityType: "clinic_settings",
      deploymentKey: null,
      message: "Clinic settings are missing or are not owned by the expected clinic.",
    });
  } else {
    pass();
  }
}

function assessProviderShells(
  shells: readonly DeploymentActivationReadinessProviderShell[],
  expectedKeys: readonly string[],
  clinicId: string,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
): void {
  const byKey = mapByDeploymentKey(shells, (shell) => shell.deploymentProviderKey);
  checkDuplicateKeys(byKey.duplicates, "provider_shell", "provider_shell_missing", block);

  for (const key of expectedKeys) {
    const shell = byKey.items.get(key);

    if (!shell) {
      block({ code: "provider_shell_missing", entityType: "provider_shell", deploymentKey: key, message: "Expected provider shell is missing." });
      continue;
    }

    if (shell.clinicId !== clinicId) {
      block({ code: "provider_shell_missing", entityType: "provider_shell", deploymentKey: key, message: "Provider shell is not clinic-scoped to the expected clinic." });
      continue;
    }

    if (shell.active) {
      block({ code: "unexpected_active_record", entityType: "provider_shell", deploymentKey: key, message: "Provider shell is unexpectedly active before activation." });
      continue;
    }

    if (shell.provisioningSource !== "setup_draft") {
      block({ code: "provisioning_source_incompatible", entityType: "provider_shell", deploymentKey: key, message: "Provider shell provisioning source is not setup_draft." });
      continue;
    }

    if (shell.provisioningStatus !== "placeholder") {
      block({ code: "provisioning_status_incompatible", entityType: "provider_shell", deploymentKey: key, message: "Provider shell provisioning status is not placeholder." });
      continue;
    }

    pass();
  }
}

function assessSterilizerShells(
  shells: readonly DeploymentActivationReadinessSterilizerShell[],
  expectedKeys: readonly string[],
  clinicId: string,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
): void {
  const byKey = mapByDeploymentKey(shells, (shell) => shell.deploymentSterilizerKey);
  checkDuplicateKeys(byKey.duplicates, "sterilizer_shell", "sterilizer_shell_missing", block);

  for (const key of expectedKeys) {
    const shell = byKey.items.get(key);
    assessPlannedShell(shell, key, clinicId, "sterilizer_shell", "sterilizer_shell_missing", pass, block);
  }
}

function assessWorkstationShells(
  shells: readonly DeploymentActivationReadinessWorkstationShell[],
  expectedKeys: readonly string[],
  clinicId: string,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
): void {
  const byKey = mapByDeploymentKey(shells, (shell) => shell.deploymentWorkstationKey);
  checkDuplicateKeys(byKey.duplicates, "workstation_shell", "workstation_shell_missing", block);

  for (const key of expectedKeys) {
    const shell = byKey.items.get(key);
    assessPlannedShell(shell, key, clinicId, "workstation_shell", "workstation_shell_missing", pass, block);
  }
}

function assessHardwareShells(
  shells: readonly DeploymentActivationReadinessHardwareShell[],
  expectedKeys: readonly string[],
  clinicId: string,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
): void {
  const byKey = mapByDeploymentKey(shells, (shell) => shell.deploymentHardwareKey);
  checkDuplicateKeys(byKey.duplicates, "hardware_shell", "hardware_shell_missing", block);

  for (const key of expectedKeys) {
    const shell = byKey.items.get(key);

    if (!shell) {
      block({ code: "hardware_shell_missing", entityType: "hardware_shell", deploymentKey: key, message: "Expected hardware shell is missing." });
      continue;
    }

    if (!assessPlannedShell(shell, key, clinicId, "hardware_shell", "hardware_shell_missing", pass, block, false)) {
      continue;
    }

    if (shell.agentId || shell.defaultWorkstationId || shell.currentWorkstationId) {
      block({ code: "hardware_shell_bound", entityType: "hardware_shell", deploymentKey: key, message: "Hardware shell already has an operational agent or workstation binding." });
      continue;
    }

    pass();
  }
}

function assessHardwareAssignments(
  assignments: readonly DeploymentActivationReadinessHardwareAssignment[],
  expectedHardwareKeys: readonly string[],
  clinicId: string,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
): void {
  const byHardwareKey = mapByDeploymentKey(assignments, (assignment) => assignment.deploymentHardwareKey);
  const byAssignmentKey = mapByDeploymentKey(assignments, (assignment) => assignment.assignmentKey);
  checkDuplicateKeys(byHardwareKey.duplicates, "hardware_assignment", "assignment_duplicate", block);
  checkDuplicateKeys(byAssignmentKey.duplicates, "hardware_assignment", "assignment_duplicate", block);

  for (const hardwareKey of expectedHardwareKeys) {
    const assignment = byHardwareKey.items.get(hardwareKey);

    if (!assignment) {
      block({ code: "assignment_missing", entityType: "hardware_assignment", deploymentKey: hardwareKey, message: "Expected planned hardware assignment is missing." });
      continue;
    }

    if (assignment.clinicId !== clinicId) {
      block({ code: "assignment_missing", entityType: "hardware_assignment", deploymentKey: hardwareKey, message: "Hardware assignment is not clinic-scoped to the expected clinic." });
      continue;
    }

    if (assignment.active) {
      block({ code: "unexpected_active_record", entityType: "hardware_assignment", deploymentKey: hardwareKey, message: "Hardware assignment is unexpectedly active before activation." });
      continue;
    }

    if (assignment.assignmentSource !== "setup_draft") {
      block({ code: "provisioning_source_incompatible", entityType: "hardware_assignment", deploymentKey: hardwareKey, message: "Hardware assignment source is not setup_draft." });
      continue;
    }

    if (assignment.assignmentStatus !== "planned") {
      block({ code: "provisioning_status_incompatible", entityType: "hardware_assignment", deploymentKey: hardwareKey, message: "Hardware assignment status is not planned." });
      continue;
    }

    if (!isValidAssignmentTargetShape(assignment)) {
      block({ code: "assignment_target_invalid", entityType: "hardware_assignment", deploymentKey: hardwareKey, message: "Hardware assignment target shape is invalid." });
      continue;
    }

    pass();
  }
}

function assessAssignmentTargetValidation(
  snapshot: DeploymentActivationReadinessSnapshot,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
): void {
  const evidence = snapshot.assignmentTargetValidation;

  if (!evidence || evidence.invalid > 0 || evidence.missingTargets > 0 || evidence.incompatibleTargets > 0 || evidence.valid !== evidence.requested) {
    block({ code: "assignment_target_invalid", entityType: "assignment_target_validation", deploymentKey: null, message: "Assignment target validation evidence is missing or contains invalid targets." });
    return;
  }

  pass();
}

function assessPlannedAssignmentResolution(
  snapshot: DeploymentActivationReadinessSnapshot,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
): void {
  const evidence = snapshot.plannedAssignmentResolution;

  if (
    !evidence ||
    evidence.unresolved > 0 ||
    evidence.missingHardware > 0 ||
    evidence.missingTargets > 0 ||
    evidence.incompatibleHardware > 0 ||
    evidence.incompatibleTargets > 0 ||
    evidence.resolved !== evidence.requested
  ) {
    block({ code: "assignment_resolution_incomplete", entityType: "planned_assignment_resolution", deploymentKey: null, message: "Planned assignment resolution evidence is missing or incomplete." });
    return;
  }

  pass();
}

function assessPlannedShell<T extends { clinicId: string | null; provisioningSource: string | null; provisioningStatus: string | null; active: boolean }>(
  shell: T | undefined,
  key: string,
  clinicId: string,
  entityType: DeploymentActivationReadinessEntityType,
  missingCode: DeploymentActivationReadinessIssueCode,
  pass: () => void,
  block: (input: BuildIssueInput) => void,
  countPass = true,
): boolean {
  if (!shell) {
    block({ code: missingCode, entityType, deploymentKey: key, message: `Expected ${entityType.replace(/_/g, " ")} is missing.` });
    return false;
  }

  if (shell.clinicId !== clinicId) {
    block({ code: missingCode, entityType, deploymentKey: key, message: `${entityType.replace(/_/g, " ")} is not clinic-scoped to the expected clinic.` });
    return false;
  }

  if (shell.active) {
    block({ code: "unexpected_active_record", entityType, deploymentKey: key, message: `${entityType.replace(/_/g, " ")} is unexpectedly active before activation.` });
    return false;
  }

  if (shell.provisioningSource !== "setup_draft") {
    block({ code: "provisioning_source_incompatible", entityType, deploymentKey: key, message: `${entityType.replace(/_/g, " ")} provisioning source is not setup_draft.` });
    return false;
  }

  if (shell.provisioningStatus !== "planned") {
    block({ code: "provisioning_status_incompatible", entityType, deploymentKey: key, message: `${entityType.replace(/_/g, " ")} provisioning status is not planned.` });
    return false;
  }

  if (countPass) {
    pass();
  }

  return true;
}

function isValidAssignmentTargetShape(
  assignment: DeploymentActivationReadinessHardwareAssignment,
): boolean {
  if (assignment.targetType === "unassigned") {
    return assignment.targetDeploymentKey === null;
  }

  if (assignment.targetType === "workstation") {
    return Boolean(assignment.targetDeploymentKey?.match(/^workstation-\d{3}$/));
  }

  if (assignment.targetType === "sterilizer") {
    return Boolean(assignment.targetDeploymentKey?.match(/^sterilizer-\d{3}$/));
  }

  return false;
}

function mapByDeploymentKey<T>(
  items: readonly T[],
  getKey: (item: T) => string | null,
): { items: Map<string, T>; duplicates: Set<string> } {
  const mapped = new Map<string, T>();
  const duplicates = new Set<string>();

  for (const item of items) {
    const key = getKey(item);

    if (!key) {
      continue;
    }

    if (mapped.has(key)) {
      duplicates.add(key);
      continue;
    }

    mapped.set(key, item);
  }

  return { items: mapped, duplicates };
}

function checkDuplicateKeys(
  duplicates: Set<string>,
  entityType: DeploymentActivationReadinessEntityType,
  code: DeploymentActivationReadinessIssueCode,
  block: (input: BuildIssueInput) => void,
): void {
  [...duplicates].sort().forEach((key) =>
    block({
      code,
      entityType,
      deploymentKey: key,
      message: "Duplicate deterministic deployment key prevents activation readiness.",
    }),
  );
}

function buildResult(input: {
  checksPassed: number;
  issues: readonly DeploymentActivationReadinessIssue[];
}): DeploymentActivationReadinessResult {
  const orderedIssues = [...input.issues].sort(compareIssues);
  const blockers = orderedIssues.filter((issue) => issue.severity === "blocker").length;
  const warnings = orderedIssues.filter((issue) => issue.severity === "warning").length;
  const checksFailed = blockers;
  const checksRequested = input.checksPassed + checksFailed;
  const status = blockers > 0 ? "blocked" : "ready";

  return {
    ok: status === "ready",
    status,
    checksRequested,
    checksPassed: input.checksPassed,
    checksFailed,
    blockers,
    warnings,
    issues: orderedIssues,
    downstream: zeroDownstream(),
    message:
      status === "ready"
        ? "Deployment activation readiness checks passed. Activation remains unwired."
        : "Deployment activation readiness is blocked by missing or incompatible planned deployment evidence.",
  };
}

interface BuildIssueInput {
  code: DeploymentActivationReadinessIssueCode;
  entityType: DeploymentActivationReadinessEntityType;
  deploymentKey: string | null;
  severity?: DeploymentActivationReadinessIssueSeverity;
  message: string;
}

function buildIssue(input: BuildIssueInput): DeploymentActivationReadinessIssue {
  return {
    code: input.code,
    entityType: input.entityType,
    deploymentKey: input.deploymentKey,
    severity: input.severity ?? "blocker",
    message: input.message,
  };
}

function compareIssues(
  left: DeploymentActivationReadinessIssue,
  right: DeploymentActivationReadinessIssue,
): number {
  return (
    severityRank(left.severity) - severityRank(right.severity) ||
    left.entityType.localeCompare(right.entityType) ||
    String(left.deploymentKey ?? "").localeCompare(String(right.deploymentKey ?? "")) ||
    left.code.localeCompare(right.code)
  );
}

function severityRank(severity: DeploymentActivationReadinessIssueSeverity): number {
  return severity === "blocker" ? 0 : 1;
}

function isFailedState(value: string | null): boolean {
  return value ? FAILED_DEPLOYMENT_STATES.has(value) : false;
}

function zeroDownstream() {
  return {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  } as const;
}
