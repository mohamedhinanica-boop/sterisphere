import "server-only";

import type {
  DeploymentActivationPlanRepository,
} from "./deployment-activation-plan-repository";
import type {
  DeploymentActivationPlanCommand,
  DeploymentActivationPlanEntityType,
  DeploymentActivationPlanIssue,
  DeploymentActivationPlanIssueCode,
  DeploymentActivationPlanIssueSeverity,
  DeploymentActivationPlanItem,
  DeploymentActivationPlanResult,
  DeploymentActivationPlanSnapshot,
} from "./deployment-activation-plan-types";
import type {
  DeploymentActivationReadinessHardwareAssignment,
  DeploymentActivationReadinessHardwareShell,
  DeploymentActivationReadinessProviderShell,
  DeploymentActivationReadinessSterilizerShell,
  DeploymentActivationReadinessWorkstationShell,
} from "./deployment-activation-readiness-types";
import type {
  DeploymentPlannedAssignmentResolvedRecord,
} from "./deployment-planned-assignment-resolution-types";
import {
  buildClinicActivationCurrentState,
  buildDeploymentRunActivationCurrentState,
  buildHardwareAssignmentActivationCurrentState,
  buildHardwareBindingActivationCurrentState,
  buildHardwareShellActivationCurrentState,
  buildProviderShellActivationCurrentState,
  buildSterilizerShellActivationCurrentState,
  buildWorkstationShellActivationCurrentState,
} from "./deployment-activation-current-state";

const FINALIZED_RUN_STATES = new Set([
  "activated",
  "archived",
  "cancelled",
  "failed",
  "finalized",
]);

export class DeploymentActivationPlanService {
  constructor(private readonly repository: DeploymentActivationPlanRepository) {}

  async buildActivationPlan(
    command: DeploymentActivationPlanCommand,
  ): Promise<DeploymentActivationPlanResult> {
    try {
      const clinicId = command.clinicId.trim();
      const deploymentRunId = command.deploymentRunId.trim();
      const planKey = buildActivationPlanKey(deploymentRunId);

      if (!clinicId || !deploymentRunId) {
        return buildResult({
          planKey: planKey || null,
          clinicId: clinicId || null,
          deploymentRunId: deploymentRunId || null,
          issues: [
            issue({
              code: "deployment_run_missing",
              entityType: "deployment_run",
              entityId: null,
              deploymentKey: deploymentRunId || null,
              message:
                "Controlled activation planning requires a clinic id and deployment run id.",
            }),
          ],
          planItems: [],
        });
      }

      const snapshot = await this.repository.getActivationPlanSnapshot({
        ...command,
        clinicId,
        deploymentRunId,
      });

      return planFromSnapshot({
        command: {
          ...command,
          clinicId,
          deploymentRunId,
        },
        snapshot,
        planKey,
      });
    } catch {
      return {
        ok: false,
        status: "error",
        planKey: null,
        clinicId: command.clinicId || null,
        deploymentRunId: command.deploymentRunId || null,
        itemsRequested: 0,
        itemsPlanned: 0,
        itemsBlocked: 0,
        reversibleItems: 0,
        irreversibleItems: 0,
        blockers: 0,
        warnings: 0,
        issues: [],
        planItems: [],
        downstream: zeroDownstream(),
        message:
          "Controlled activation planning could not complete because the activation planning repository failed unexpectedly.",
      };
    }
  }
}

export function createDeploymentActivationPlanService(
  repository: DeploymentActivationPlanRepository,
): DeploymentActivationPlanService {
  return new DeploymentActivationPlanService(repository);
}

function planFromSnapshot(input: {
  command: DeploymentActivationPlanCommand;
  snapshot: DeploymentActivationPlanSnapshot;
  planKey: string;
}): DeploymentActivationPlanResult {
  const { command, snapshot, planKey } = input;
  const issues: DeploymentActivationPlanIssue[] = [];
  const warnings: DeploymentActivationPlanIssue[] = [];

  assessReadiness(command, issues);
  assessDeploymentIdentity(command, snapshot, issues);

  const providerShells = mapByKey(
    snapshot.providerShells,
    (shell) => shell.deploymentProviderKey,
  );
  const sterilizerShells = mapByKey(
    snapshot.sterilizerShells,
    (shell) => shell.deploymentSterilizerKey,
  );
  const workstationShells = mapByKey(
    snapshot.workstationShells,
    (shell) => shell.deploymentWorkstationKey,
  );
  const hardwareShells = mapByKey(
    snapshot.hardwareShells,
    (shell) => shell.deploymentHardwareKey,
  );
  const assignments = mapByKey(
    snapshot.hardwareAssignments,
    (assignment) => assignment.deploymentHardwareKey,
  );
  const resolvedAssignments = mapByKey(
    command.resolvedAssignments,
    (record) => record.deploymentHardwareKey,
  );

  assessRequiredShells({
    clinicId: command.clinicId,
    expectedKeys: command.expected.providerKeys,
    entityType: "provider_shell",
    shells: providerShells,
    provisioningStatus: "placeholder",
    issues,
  });
  assessRequiredShells({
    clinicId: command.clinicId,
    expectedKeys: command.expected.sterilizerKeys,
    entityType: "sterilizer_shell",
    shells: sterilizerShells,
    provisioningStatus: "planned",
    issues,
  });
  assessRequiredShells({
    clinicId: command.clinicId,
    expectedKeys: command.expected.workstationKeys,
    entityType: "workstation_shell",
    shells: workstationShells,
    provisioningStatus: "planned",
    issues,
  });
  assessHardwareShells({
    clinicId: command.clinicId,
    expectedKeys: command.expected.hardwareKeys,
    shells: hardwareShells,
    issues,
  });
  assessAssignments({
    clinicId: command.clinicId,
    expectedHardwareKeys: command.expected.hardwareKeys,
    assignments,
    resolvedAssignments,
    issues,
    warnings,
  });

  const blockers = issues.filter((current) => current.severity === "blocker");

  if (blockers.length > 0) {
    return buildResult({
      planKey,
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      issues: [...issues, ...warnings],
      planItems: [],
    });
  }

  const planItems = buildPlanItems({
    planKey,
    clinicId: command.clinicId,
    deploymentRunId: command.deploymentRunId,
    snapshot,
    expected: command.expected,
    providerShells,
    sterilizerShells,
    workstationShells,
    hardwareShells,
    assignments,
    resolvedAssignments,
    warnings,
  });

  return buildResult({
    planKey,
    clinicId: command.clinicId,
    deploymentRunId: command.deploymentRunId,
    issues: warnings,
    planItems,
  });
}

function assessReadiness(
  command: DeploymentActivationPlanCommand,
  issues: DeploymentActivationPlanIssue[],
): void {
  if (!command.readiness) {
    issues.push(
      issue({
        code: "readiness_evidence_missing",
        entityType: "activation_plan",
        entityId: null,
        deploymentKey: command.deploymentRunId,
        message: "Activation planning requires a readiness result.",
      }),
    );
    return;
  }

  if (
    command.readiness.status !== "ready" ||
    command.readiness.blockers > 0 ||
    command.readiness.checksFailed > 0
  ) {
    issues.push(
      issue({
        code: "readiness_not_ready",
        entityType: "activation_plan",
        entityId: null,
        deploymentKey: command.deploymentRunId,
        message:
          "Activation planning requires readiness status ready with zero blockers and zero failed checks.",
      }),
    );
  }
}

function assessDeploymentIdentity(
  command: DeploymentActivationPlanCommand,
  snapshot: DeploymentActivationPlanSnapshot,
  issues: DeploymentActivationPlanIssue[],
): void {
  if (snapshot.existingActivationPlanKey) {
    issues.push(
      issue({
        code: "duplicate_activation_identity",
        entityType: "activation_plan",
        entityId: null,
        deploymentKey: snapshot.existingActivationPlanKey,
        message:
          "An activation plan identity already exists for this deployment run.",
      }),
    );
  }

  if (!snapshot.deploymentRun) {
    issues.push(
      issue({
        code: "deployment_run_missing",
        entityType: "deployment_run",
        entityId: null,
        deploymentKey: command.deploymentRunId,
        message: "Deployment run evidence is missing.",
      }),
    );
    return;
  }

  if (snapshot.deploymentRun.clinicId !== command.clinicId) {
    issues.push(
      issue({
        code: "clinic_ownership_mismatch",
        entityType: "deployment_run",
        entityId: null,
        deploymentKey: command.deploymentRunId,
        message:
          "Deployment run is not owned by the clinic being planned for activation.",
      }),
    );
  }

  if (
    isFinalizedState(snapshot.deploymentRun.lifecycleState) ||
    isFinalizedState(snapshot.deploymentRun.deploymentStatus)
  ) {
    issues.push(
      issue({
        code: "deployment_run_incompatible",
        entityType: "deployment_run",
        entityId: null,
        deploymentKey: command.deploymentRunId,
        message:
          "Deployment run is already finalized, failed, archived, or otherwise incompatible with activation planning.",
      }),
    );
  }

  if (!snapshot.clinic || snapshot.clinic.id !== command.clinicId) {
    issues.push(
      issue({
        code: "entity_missing",
        entityType: "clinic",
        entityId: snapshot.clinic?.id ?? null,
        deploymentKey: null,
        message: "Clinic root is missing for activation planning.",
      }),
    );
  }
}

function assessRequiredShells<T extends {
  id: string;
  clinicId: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
}>(input: {
  clinicId: string;
  expectedKeys: readonly string[];
  entityType:
    | "provider_shell"
    | "sterilizer_shell"
    | "workstation_shell";
  shells: MapResult<T>;
  provisioningStatus: string;
  issues: DeploymentActivationPlanIssue[];
}): void {
  addDuplicateIssues(input.shells.duplicates, input.entityType, input.issues);

  for (const key of input.expectedKeys) {
    const shell = input.shells.items.get(key);

    if (!shell) {
      input.issues.push(
        issue({
          code: "entity_missing",
          entityType: input.entityType,
          entityId: null,
          deploymentKey: key,
          message: `${label(input.entityType)} is missing.`,
        }),
      );
      continue;
    }

    assessPlannedState({
      entityType: input.entityType,
      entityId: shell.id,
      deploymentKey: key,
      clinicId: input.clinicId,
      actualClinicId: shell.clinicId,
      provisioningSource: shell.provisioningSource,
      provisioningStatus: shell.provisioningStatus,
      expectedProvisioningStatus: input.provisioningStatus,
      active: shell.active,
      issues: input.issues,
    });
  }
}

function assessHardwareShells(input: {
  clinicId: string;
  expectedKeys: readonly string[];
  shells: MapResult<DeploymentActivationReadinessHardwareShell>;
  issues: DeploymentActivationPlanIssue[];
}): void {
  addDuplicateIssues(input.shells.duplicates, "hardware_shell", input.issues);

  for (const key of input.expectedKeys) {
    const shell = input.shells.items.get(key);

    if (!shell) {
      input.issues.push(
        issue({
          code: "entity_missing",
          entityType: "hardware_shell",
          entityId: null,
          deploymentKey: key,
          message: "Hardware shell is missing.",
        }),
      );
      continue;
    }

    assessPlannedState({
      entityType: "hardware_shell",
      entityId: shell.id,
      deploymentKey: key,
      clinicId: input.clinicId,
      actualClinicId: shell.clinicId,
      provisioningSource: shell.provisioningSource,
      provisioningStatus: shell.provisioningStatus,
      expectedProvisioningStatus: "planned",
      active: shell.active,
      issues: input.issues,
    });

    if (shell.agentId || shell.defaultWorkstationId || shell.currentWorkstationId) {
      input.issues.push(
        issue({
          code: "hardware_already_bound",
          entityType: "hardware_shell",
          entityId: shell.id,
          deploymentKey: key,
          message:
            "Hardware shell has operational binding drift and cannot be planned safely.",
        }),
      );
    }
  }
}

function assessAssignments(input: {
  clinicId: string;
  expectedHardwareKeys: readonly string[];
  assignments: MapResult<DeploymentActivationReadinessHardwareAssignment>;
  resolvedAssignments: MapResult<DeploymentPlannedAssignmentResolvedRecord>;
  issues: DeploymentActivationPlanIssue[];
  warnings: DeploymentActivationPlanIssue[];
}): void {
  addDuplicateIssues(input.assignments.duplicates, "hardware_assignment", input.issues);
  addDuplicateIssues(
    input.resolvedAssignments.duplicates,
    "hardware_assignment",
    input.issues,
  );

  for (const key of input.expectedHardwareKeys) {
    const assignment = input.assignments.items.get(key);
    const resolved = input.resolvedAssignments.items.get(key);

    if (!assignment) {
      input.issues.push(
        issue({
          code: "entity_missing",
          entityType: "hardware_assignment",
          entityId: null,
          deploymentKey: key,
          message: "Planned hardware assignment is missing.",
        }),
      );
      continue;
    }

    if (!resolved || !resolved.hardwareId) {
      input.issues.push(
        issue({
          code: "resolved_identity_missing",
          entityType: "hardware_assignment",
          entityId: assignment.id,
          deploymentKey: key,
          message:
            "Resolved hardware identity is missing from planned assignment resolution evidence.",
        }),
      );
      continue;
    }

    if (
      assignment.clinicId !== input.clinicId ||
      assignment.assignmentSource !== "setup_draft" ||
      assignment.assignmentStatus !== "planned" ||
      assignment.active
    ) {
      input.issues.push(
        issue({
          code: "provisioning_state_incompatible",
          entityType: "hardware_assignment",
          entityId: assignment.id,
          deploymentKey: key,
          message:
            "Planned hardware assignment state drifted from setup_draft planned inactive.",
        }),
      );
    }

    if (
      assignment.targetType !== resolved.targetType ||
      assignment.targetDeploymentKey !== resolved.targetDeploymentKey
    ) {
      input.issues.push(
        issue({
          code: "assignment_target_changed",
          entityType: "hardware_assignment",
          entityId: assignment.id,
          deploymentKey: key,
          message:
            "Planned hardware assignment target changed after readiness evidence was produced.",
        }),
      );
    }

    if (assignment.targetType === "unassigned") {
      input.warnings.push(
        issue({
          code: "rollback_not_supported",
          entityType: "hardware_binding",
          entityId: null,
          deploymentKey: key,
          severity: "warning",
          message:
            "Explicit unassigned hardware produces no operational binding plan item.",
        }),
      );
    } else if (!resolved.targetId) {
      input.issues.push(
        issue({
          code: "resolved_identity_missing",
          entityType: "hardware_binding",
          entityId: assignment.id,
          deploymentKey: assignment.targetDeploymentKey,
          message:
            "Resolved target identity is missing for the planned hardware binding.",
        }),
      );
    }
  }
}

function assessPlannedState(input: {
  entityType: DeploymentActivationPlanEntityType;
  entityId: string;
  deploymentKey: string;
  clinicId: string;
  actualClinicId: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  expectedProvisioningStatus: string;
  active: boolean;
  issues: DeploymentActivationPlanIssue[];
}): void {
  if (input.actualClinicId !== input.clinicId) {
    input.issues.push(
      issue({
        code: "clinic_ownership_mismatch",
        entityType: input.entityType,
        entityId: input.entityId,
        deploymentKey: input.deploymentKey,
        message: `${label(input.entityType)} belongs to a different clinic.`,
      }),
    );
  }

  if (input.active) {
    input.issues.push(
      issue({
        code: "unexpected_active_record",
        entityType: input.entityType,
        entityId: input.entityId,
        deploymentKey: input.deploymentKey,
        message: `${label(input.entityType)} is already active before controlled activation.`,
      }),
    );
  }

  if (
    input.provisioningSource !== "setup_draft" ||
    input.provisioningStatus !== input.expectedProvisioningStatus
  ) {
    input.issues.push(
      issue({
        code: "provisioning_state_incompatible",
        entityType: input.entityType,
        entityId: input.entityId,
        deploymentKey: input.deploymentKey,
        message: `${label(input.entityType)} provisioning state is incompatible with controlled activation planning.`,
      }),
    );
  }
}

function buildPlanItems(input: {
  planKey: string;
  clinicId: string;
  deploymentRunId: string;
  snapshot: DeploymentActivationPlanSnapshot;
  expected: DeploymentActivationPlanCommand["expected"];
  providerShells: MapResult<DeploymentActivationReadinessProviderShell>;
  sterilizerShells: MapResult<DeploymentActivationReadinessSterilizerShell>;
  workstationShells: MapResult<DeploymentActivationReadinessWorkstationShell>;
  hardwareShells: MapResult<DeploymentActivationReadinessHardwareShell>;
  assignments: MapResult<DeploymentActivationReadinessHardwareAssignment>;
  resolvedAssignments: MapResult<DeploymentPlannedAssignmentResolvedRecord>;
  warnings: DeploymentActivationPlanIssue[];
}): DeploymentActivationPlanItem[] {
  const items: DeploymentActivationPlanItem[] = [];
  const nextSequence = () => items.length + 1;
  const clinicItemKey = `${input.planKey}:clinic`;

  items.push(
    item({
      planItemKey: clinicItemKey,
      sequence: nextSequence(),
      entityType: "clinic",
      entityId: input.snapshot.clinic?.id ?? null,
      deploymentKey: null,
      clinicId: input.clinicId,
      action: "activate",
      currentState: buildClinicActivationCurrentState({
        clinicId: input.snapshot.clinic?.id ?? input.clinicId,
        deploymentStatus: "draft",
      }),
      targetState: { deploymentStatus: "deployed" },
      dependencyKeys: [],
      reversible: true,
      rollbackAction: "restore clinic deployment status to draft before operational activity starts",
    }),
  );

  for (const key of input.expected.providerKeys) {
    const shell = input.providerShells.items.get(key);
    items.push(
      providerActivationItem({
        planKey: input.planKey,
        sequence: nextSequence(),
        shell,
        deploymentKey: key,
        clinicId: input.clinicId,
        dependencyKeys: [clinicItemKey],
      }),
    );
  }

  for (const key of input.expected.sterilizerKeys) {
    const shell = input.sterilizerShells.items.get(key);
    items.push(
      sterilizerActivationItem({
        planKey: input.planKey,
        sequence: nextSequence(),
        shell,
        deploymentKey: key,
        clinicId: input.clinicId,
        dependencyKeys: [clinicItemKey],
      }),
    );
  }

  for (const key of input.expected.workstationKeys) {
    const shell = input.workstationShells.items.get(key);
    items.push(
      workstationActivationItem({
        planKey: input.planKey,
        sequence: nextSequence(),
        shell,
        deploymentKey: key,
        clinicId: input.clinicId,
        dependencyKeys: [clinicItemKey],
      }),
    );
  }

  for (const key of input.expected.hardwareKeys) {
    const shell = input.hardwareShells.items.get(key);
    items.push(
      hardwareActivationItem({
        planKey: input.planKey,
        sequence: nextSequence(),
        shell,
        deploymentKey: key,
        clinicId: input.clinicId,
        dependencyKeys: [clinicItemKey],
      }),
    );
  }

  for (const key of input.expected.hardwareKeys) {
    const assignment = input.assignments.items.get(key);
    const resolved = input.resolvedAssignments.items.get(key);

    if (!assignment || !resolved || resolved.targetType === "unassigned") {
      continue;
    }

    const hardwareActivationKey = `${input.planKey}:hardware_shell:${key}`;
    const targetActivationKey = `${input.planKey}:${resolved.targetType === "sterilizer" ? "sterilizer_shell" : "workstation_shell"}:${resolved.targetDeploymentKey}`;

    items.push(
      item({
        planItemKey: `${input.planKey}:hardware_binding:${key}`,
        sequence: nextSequence(),
        entityType: "hardware_binding",
        entityId: resolved.hardwareId,
        deploymentKey: key,
        clinicId: input.clinicId,
        action: "bind",
        currentState: buildHardwareBindingActivationCurrentState({
          hardwareId: resolved.hardwareId,
          deploymentHardwareKey: resolved.deploymentHardwareKey,
          targetType: resolved.targetType,
          targetDeploymentKey: resolved.targetDeploymentKey,
          targetId: null,
        }),
        targetState: {
          hardwareId: resolved.hardwareId,
          targetId: resolved.targetId,
          targetType: resolved.targetType,
          targetDeploymentKey: resolved.targetDeploymentKey,
        },
        dependencyKeys: [hardwareActivationKey, targetActivationKey],
        reversible: true,
        rollbackAction: "clear planned operational hardware binding before activation is finalized",
        warnings: [
          issue({
            code: "rollback_not_supported",
            entityType: "hardware_binding",
            entityId: resolved.hardwareId,
            deploymentKey: key,
            severity: "warning",
            message:
              "Operational binding execution is future work; this item is proposed only.",
          }),
        ],
      }),
    );
  }

  for (const key of input.expected.hardwareKeys) {
    const assignment = input.assignments.items.get(key);
    const bindingKey =
      assignment?.targetType === "unassigned"
        ? null
        : `${input.planKey}:hardware_binding:${key}`;

    items.push(
      item({
        planItemKey: `${input.planKey}:hardware_assignment:${key}`,
        sequence: nextSequence(),
        entityType: "hardware_assignment",
        entityId: assignment?.id ?? null,
        deploymentKey: key,
        clinicId: input.clinicId,
        action: "finalize",
        currentState: buildHardwareAssignmentActivationCurrentState({
          id: assignment?.id ?? null,
          clinicId: assignment?.clinicId ?? input.clinicId,
          deploymentHardwareKey: assignment?.deploymentHardwareKey ?? key,
          assignmentKey: assignment?.assignmentKey ?? null,
          targetType: assignment?.targetType ?? null,
          targetDeploymentKey: assignment?.targetDeploymentKey ?? null,
          assignmentSource: assignment?.assignmentSource ?? null,
          assignmentStatus: assignment?.assignmentStatus ?? null,
          active: assignment?.active ?? null,
        }),
        targetState: { assignmentStatus: "active", active: true },
        dependencyKeys: [
          `${input.planKey}:hardware_shell:${key}`,
          ...(bindingKey ? [bindingKey] : []),
        ],
        reversible: false,
        rollbackAction: null,
        warnings:
          assignment?.targetType === "unassigned"
            ? input.warnings.filter((warning) => warning.deploymentKey === key)
            : [],
      }),
    );
  }

  items.push(
    item({
      planItemKey: `${input.planKey}:deployment_run`,
      sequence: nextSequence(),
      entityType: "deployment_run",
      entityId: null,
      deploymentKey: input.deploymentRunId,
      clinicId: input.clinicId,
      action: "finalize",
      currentState: buildDeploymentRunActivationCurrentState({
        deploymentRunId:
          input.snapshot.deploymentRun?.deploymentRunId ??
          input.deploymentRunId,
        clinicId: input.snapshot.deploymentRun?.clinicId ?? input.clinicId,
        lifecycleState: input.snapshot.deploymentRun?.lifecycleState ?? null,
        deploymentStatus: input.snapshot.deploymentRun?.deploymentStatus ?? null,
      }),
      targetState: { deploymentStatus: "activated" },
      dependencyKeys: items.map((current) => current.planItemKey),
      reversible: false,
      rollbackAction: null,
      warnings: [
        issue({
          code: "rollback_not_supported",
          entityType: "deployment_run",
          entityId: null,
          deploymentKey: input.deploymentRunId,
          severity: "warning",
          message:
            "Deployment finalization rollback is not implemented in this planning foundation.",
        }),
      ],
    }),
  );

  return items;
}

function providerActivationItem(input: {
  planKey: string;
  sequence: number;
  shell: DeploymentActivationReadinessProviderShell | undefined;
  deploymentKey: string;
  clinicId: string;
  dependencyKeys: readonly string[];
}): DeploymentActivationPlanItem {
  return shellActivationItem({
    planKey: input.planKey,
    sequence: input.sequence,
    entityType: "provider_shell",
    entityId: input.shell?.id ?? null,
    deploymentKey: input.deploymentKey,
    clinicId: input.clinicId,
    dependencyKeys: input.dependencyKeys,
    currentState: buildProviderShellActivationCurrentState({
      id: input.shell?.id ?? null,
      clinicId: input.shell?.clinicId ?? input.clinicId,
      deploymentProviderKey:
        input.shell?.deploymentProviderKey ?? input.deploymentKey,
      provisioningSource: input.shell?.provisioningSource ?? null,
      provisioningStatus: input.shell?.provisioningStatus ?? null,
      active: input.shell?.active ?? null,
    }),
  });
}

function sterilizerActivationItem(input: {
  planKey: string;
  sequence: number;
  shell: DeploymentActivationReadinessSterilizerShell | undefined;
  deploymentKey: string;
  clinicId: string;
  dependencyKeys: readonly string[];
}): DeploymentActivationPlanItem {
  return shellActivationItem({
    planKey: input.planKey,
    sequence: input.sequence,
    entityType: "sterilizer_shell",
    entityId: input.shell?.id ?? null,
    deploymentKey: input.deploymentKey,
    clinicId: input.clinicId,
    dependencyKeys: input.dependencyKeys,
    currentState: buildSterilizerShellActivationCurrentState({
      id: input.shell?.id ?? null,
      clinicId: input.shell?.clinicId ?? input.clinicId,
      deploymentSterilizerKey:
        input.shell?.deploymentSterilizerKey ?? input.deploymentKey,
      provisioningSource: input.shell?.provisioningSource ?? null,
      provisioningStatus: input.shell?.provisioningStatus ?? null,
      active: input.shell?.active ?? null,
    }),
  });
}

function workstationActivationItem(input: {
  planKey: string;
  sequence: number;
  shell: DeploymentActivationReadinessWorkstationShell | undefined;
  deploymentKey: string;
  clinicId: string;
  dependencyKeys: readonly string[];
}): DeploymentActivationPlanItem {
  return shellActivationItem({
    planKey: input.planKey,
    sequence: input.sequence,
    entityType: "workstation_shell",
    entityId: input.shell?.id ?? null,
    deploymentKey: input.deploymentKey,
    clinicId: input.clinicId,
    dependencyKeys: input.dependencyKeys,
    currentState: buildWorkstationShellActivationCurrentState({
      id: input.shell?.id ?? null,
      clinicId: input.shell?.clinicId ?? input.clinicId,
      deploymentWorkstationKey:
        input.shell?.deploymentWorkstationKey ?? input.deploymentKey,
      provisioningSource: input.shell?.provisioningSource ?? null,
      provisioningStatus: input.shell?.provisioningStatus ?? null,
      active: input.shell?.active ?? null,
    }),
  });
}

function hardwareActivationItem(input: {
  planKey: string;
  sequence: number;
  shell: DeploymentActivationReadinessHardwareShell | undefined;
  deploymentKey: string;
  clinicId: string;
  dependencyKeys: readonly string[];
}): DeploymentActivationPlanItem {
  return shellActivationItem({
    planKey: input.planKey,
    sequence: input.sequence,
    entityType: "hardware_shell",
    entityId: input.shell?.id ?? null,
    deploymentKey: input.deploymentKey,
    clinicId: input.clinicId,
    dependencyKeys: input.dependencyKeys,
    currentState: buildHardwareShellActivationCurrentState({
      id: input.shell?.id ?? null,
      clinicId: input.shell?.clinicId ?? input.clinicId,
      deploymentHardwareKey:
        input.shell?.deploymentHardwareKey ?? input.deploymentKey,
      provisioningSource: input.shell?.provisioningSource ?? null,
      provisioningStatus: input.shell?.provisioningStatus ?? null,
      active: input.shell?.active ?? null,
      operationalStatus: input.shell?.status ?? null,
      agentId: input.shell?.agentId ?? null,
      defaultWorkstationId: input.shell?.defaultWorkstationId ?? null,
      currentWorkstationId: input.shell?.currentWorkstationId ?? null,
    }),
  });
}

function shellActivationItem(input: {
  planKey: string;
  sequence: number;
  entityType:
    | "provider_shell"
    | "sterilizer_shell"
    | "workstation_shell"
    | "hardware_shell";
  entityId: string | null;
  deploymentKey: string;
  clinicId: string;
  dependencyKeys: readonly string[];
  currentState: Record<string, unknown>;
}): DeploymentActivationPlanItem {
  return item({
    planItemKey: `${input.planKey}:${input.entityType}:${input.deploymentKey}`,
    sequence: input.sequence,
    entityType: input.entityType,
    entityId: input.entityId,
    deploymentKey: input.deploymentKey,
    clinicId: input.clinicId,
    action: "activate",
    currentState: input.currentState,
    targetState: {
      provisioningStatus: "active",
      active: true,
    },
    dependencyKeys: input.dependencyKeys,
    reversible: true,
    rollbackAction: `restore ${label(input.entityType)} to inactive setup_draft state before operational use`,
  });
}
function item(
  input: Omit<
    DeploymentActivationPlanItem,
    "status" | "blockers" | "warnings"
  > & {
    blockers?: readonly DeploymentActivationPlanIssue[];
    warnings?: readonly DeploymentActivationPlanIssue[];
  },
): DeploymentActivationPlanItem {
  return {
    ...input,
    status: "planned",
    blockers: input.blockers ?? [],
    warnings: input.warnings ?? [],
  };
}

function buildResult(input: {
  planKey: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  issues: readonly DeploymentActivationPlanIssue[];
  planItems: readonly DeploymentActivationPlanItem[];
}): DeploymentActivationPlanResult {
  const orderedIssues = [...input.issues].sort(compareIssues);
  const blockers = orderedIssues.filter((current) => current.severity === "blocker").length;
  const warnings = orderedIssues.filter((current) => current.severity === "warning").length;
  const status = blockers > 0 ? "blocked" : "ready";
  const reversibleItems = input.planItems.filter((current) => current.reversible).length;
  const irreversibleItems = input.planItems.length - reversibleItems;

  return {
    ok: status === "ready",
    status,
    planKey: input.planKey,
    clinicId: input.clinicId,
    deploymentRunId: input.deploymentRunId,
    itemsRequested: input.planItems.length + blockers,
    itemsPlanned: input.planItems.length,
    itemsBlocked: blockers,
    reversibleItems,
    irreversibleItems,
    blockers,
    warnings,
    issues: orderedIssues,
    planItems: [...input.planItems].sort((left, right) => left.sequence - right.sequence),
    downstream: zeroDownstream(),
    message:
      status === "ready"
        ? "Controlled activation plan is ready. No activation has been executed."
        : "Controlled activation planning is blocked by readiness, drift, or identity issues.",
  };
}

function issue(input: {
  code: DeploymentActivationPlanIssueCode;
  entityType: DeploymentActivationPlanEntityType;
  entityId: string | null;
  deploymentKey: string | null;
  severity?: DeploymentActivationPlanIssueSeverity;
  message: string;
}): DeploymentActivationPlanIssue {
  return {
    code: input.code,
    entityType: input.entityType,
    entityId: input.entityId,
    deploymentKey: input.deploymentKey,
    severity: input.severity ?? "blocker",
    message: input.message,
  };
}

function addDuplicateIssues(
  duplicates: Set<string>,
  entityType: DeploymentActivationPlanEntityType,
  issues: DeploymentActivationPlanIssue[],
): void {
  [...duplicates].sort().forEach((key) =>
    issues.push(
      issue({
        code: "duplicate_activation_identity",
        entityType,
        entityId: null,
        deploymentKey: key,
        message:
          "Duplicate deterministic identity prevents controlled activation planning.",
      }),
    ),
  );
}

interface MapResult<T> {
  items: Map<string, T>;
  duplicates: Set<string>;
}

function mapByKey<T>(
  items: readonly T[],
  getKey: (item: T) => string | null,
): MapResult<T> {
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

function buildActivationPlanKey(deploymentRunId: string): string {
  const normalized = deploymentRunId.trim();

  return normalized ? `activation-plan-${normalized}` : "";
}

function isFinalizedState(value: string | null): boolean {
  return value ? FINALIZED_RUN_STATES.has(value) : false;
}

function compareIssues(
  left: DeploymentActivationPlanIssue,
  right: DeploymentActivationPlanIssue,
): number {
  return (
    severityRank(left.severity) - severityRank(right.severity) ||
    left.entityType.localeCompare(right.entityType) ||
    String(left.deploymentKey ?? "").localeCompare(String(right.deploymentKey ?? "")) ||
    left.code.localeCompare(right.code)
  );
}

function severityRank(severity: DeploymentActivationPlanIssueSeverity): number {
  return severity === "blocker" ? 0 : 1;
}

function label(entityType: DeploymentActivationPlanEntityType): string {
  return entityType.replace(/_/g, " ");
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
