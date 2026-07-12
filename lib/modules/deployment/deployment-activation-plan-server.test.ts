import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildActivationPlanForServerDeployment,
} from "./deployment-activation-plan-server";
import { createDeploymentActivationPlanService } from "./deployment-activation-plan-service";
import { InMemoryDeploymentActivationPlanTestRepository } from "./deployment-activation-plan-test-repository";
import { createEmptyDeploymentDraft } from "./deployment-draft";
import type {
  DeploymentActivationPlanCommand,
  DeploymentActivationPlanSnapshot,
} from "./deployment-activation-plan-types";
import type {
  ServerDeploymentActivationReadinessResult,
} from "./deployment-activation-readiness-server";
import type {
  ServerDeploymentPlannedAssignmentResolutionResult,
} from "./deployment-planned-assignment-resolution-server";

export interface DeploymentActivationPlanRuntimeHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationPlanRuntimeHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationPlanRuntimeHarnessScenario[];
}

const CLINIC_ID = "clinic-runtime-plan-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-runtime-plan-0001";

export async function runDeploymentActivationPlanRuntimeHarness(): Promise<DeploymentActivationPlanRuntimeHarnessResult> {
  const scenarios = [
    await scenarioReadyDeploymentGeneratesPlan(),
    await scenarioBlockedReadinessSkipsPlanning(),
    await scenarioErrorReadinessSkipsPlanning(),
    await scenarioPlanningBlockedPreservesUpstreamEvidence(),
    await scenarioPlanningErrorPreservesUpstreamEvidence(),
    await scenarioVerifyReuseGeneratesIdenticalPlan(),
    await scenarioPlanItemOrderingPreserved(),
    await scenarioPlanKeyDeterministic(),
    await scenarioSourceSnapshotRemainsUnmodified(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioReadyDeploymentGeneratesPlan(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const result = await plan();

  return expectScenario(
    "ready deployment generates activation plan",
    result.ok &&
      result.status === "ready" &&
      result.planItems.length > 0 &&
      result.planItems[0]?.entityType === "clinic",
    `status=${result.status}; items=${result.planItems.length}`,
  );
}

async function scenarioBlockedReadinessSkipsPlanning(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const result = await buildActivationPlanForServerDeployment(
    {} as SupabaseClient,
    serverCommand({ readiness: readiness({ ok: false, status: "blocked", blockers: 1 }) }),
  );

  return expectScenario(
    "blocked readiness skips activation planning",
    !result.ok &&
      result.status === "skipped" &&
      result.planItems.length === 0,
    `status=${result.status}; items=${result.planItems.length}`,
  );
}

async function scenarioErrorReadinessSkipsPlanning(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const result = await buildActivationPlanForServerDeployment(
    {} as SupabaseClient,
    serverCommand({ readiness: readiness({ ok: false, status: "error" }) }),
  );

  return expectScenario(
    "error readiness skips activation planning",
    !result.ok &&
      result.status === "skipped" &&
      result.planItems.length === 0,
    `status=${result.status}; items=${result.planItems.length}`,
  );
}

async function scenarioPlanningBlockedPreservesUpstreamEvidence(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const snapshot = readySnapshot({ workstationShells: [] });
  const result = await plan(snapshot);

  return expectScenario(
    "planning blocked preserves upstream evidence",
    !result.ok &&
      result.status === "blocked" &&
      snapshot.providerShells.length === 1 &&
      snapshot.hardwareAssignments.length === 1,
    `status=${result.status}; providerShells=${snapshot.providerShells.length}`,
  );
}

async function scenarioPlanningErrorPreservesUpstreamEvidence(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const snapshot = readySnapshot();
  const repository = new InMemoryDeploymentActivationPlanTestRepository({
    snapshot,
    shouldThrow: true,
  });
  const result = await createDeploymentActivationPlanService(
    repository,
  ).buildActivationPlan(command());

  return expectScenario(
    "planning error preserves upstream evidence",
    !result.ok &&
      result.status === "error" &&
      repository.downstreamWriteCount === 0 &&
      snapshot.hardwareShells.length === 1,
    `status=${result.status}; writes=${repository.downstreamWriteCount}`,
  );
}

async function scenarioVerifyReuseGeneratesIdenticalPlan(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const first = await plan();
  const second = await plan();

  return expectScenario(
    "verify reuse generates identical deterministic plan",
    JSON.stringify(first) === JSON.stringify(second),
    `first=${first.planKey}; second=${second.planKey}`,
  );
}

async function scenarioPlanItemOrderingPreserved(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const result = await plan();
  const ordered = result.planItems.every(
    (item, index) => item.sequence === index + 1,
  );

  return expectScenario(
    "plan item ordering is preserved",
    ordered &&
      result.planItems.map((item) => item.entityType).join(">") ===
        "clinic>provider_shell>sterilizer_shell>workstation_shell>hardware_shell>hardware_binding>hardware_assignment>deployment_run",
    result.planItems.map((item) => `${item.sequence}:${item.entityType}`).join(","),
  );
}

async function scenarioPlanKeyDeterministic(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const result = await plan();

  return expectScenario(
    "plan key is deterministic",
    result.planKey === `activation-plan-${DEPLOYMENT_RUN_ID}`,
    String(result.planKey),
  );
}

async function scenarioSourceSnapshotRemainsUnmodified(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const snapshot = readySnapshot();
  const before = JSON.stringify(snapshot);
  await plan(snapshot);

  return expectScenario(
    "source snapshot remains unmodified",
    before === JSON.stringify(snapshot),
    "source snapshot unchanged",
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationPlanRuntimeHarnessScenario> {
  const result = await plan();

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.requested === 0 &&
      result.downstream.created === 0 &&
      result.downstream.reused === 0 &&
      result.downstream.skipped === 0 &&
      result.downstream.conflicts === 0,
    JSON.stringify(result.downstream),
  );
}

async function plan(snapshot: DeploymentActivationPlanSnapshot = readySnapshot()) {
  return createDeploymentActivationPlanService(
    new InMemoryDeploymentActivationPlanTestRepository({ snapshot }),
  ).buildActivationPlan(command());
}

function command(): DeploymentActivationPlanCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    readiness: readiness(),
    resolvedAssignments: resolution().records,
    expected: {
      providerKeys: ["provider-001"],
      sterilizerKeys: ["sterilizer-001"],
      workstationKeys: ["workstation-001"],
      hardwareKeys: ["hardware-001"],
    },
  };
}

function serverCommand(input: {
  readiness?: ServerDeploymentActivationReadinessResult;
} = {}) {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    draft: createEmptyDeploymentDraft("2026-07-12T00:00:00.000Z"),
    deploymentActivationReadiness: input.readiness ?? readiness(),
    plannedAssignmentResolution: resolution(),
    createdAt: "2026-07-12T00:00:00.000Z",
  };
}

function readySnapshot(
  input: Partial<DeploymentActivationPlanSnapshot> = {},
): DeploymentActivationPlanSnapshot {
  return {
    deploymentRun:
      input.deploymentRun === undefined
        ? {
            deploymentRunId: DEPLOYMENT_RUN_ID,
            clinicId: CLINIC_ID,
            lifecycleState: "completed",
            deploymentStatus: "planned",
          }
        : input.deploymentRun,
    clinic: input.clinic === undefined ? { id: CLINIC_ID } : input.clinic,
    clinicSettings:
      input.clinicSettings === undefined
        ? { id: "clinic-settings-row-001", clinicId: CLINIC_ID }
        : input.clinicSettings,
    providerShells: input.providerShells ?? [
      {
        id: "provider-row-001",
        clinicId: CLINIC_ID,
        deploymentProviderKey: "provider-001",
        provisioningSource: "setup_draft",
        provisioningStatus: "placeholder",
        active: false,
      },
    ],
    sterilizerShells: input.sterilizerShells ?? [
      {
        id: "sterilizer-row-001",
        clinicId: CLINIC_ID,
        deploymentSterilizerKey: "sterilizer-001",
        provisioningSource: "setup_draft",
        provisioningStatus: "planned",
        active: false,
      },
    ],
    workstationShells: input.workstationShells ?? [
      {
        id: "workstation-row-001",
        clinicId: CLINIC_ID,
        deploymentWorkstationKey: "workstation-001",
        provisioningSource: "setup_draft",
        provisioningStatus: "planned",
        active: false,
      },
    ],
    hardwareShells: input.hardwareShells ?? [
      {
        id: "hardware-row-001",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        provisioningSource: "setup_draft",
        provisioningStatus: "planned",
        active: false,
        agentId: null,
        defaultWorkstationId: null,
        currentWorkstationId: null,
        status: "discovered",
      },
    ],
    hardwareAssignments: input.hardwareAssignments ?? [
      {
        id: "assignment-row-001",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        assignmentKey: "hardware-assignment-hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
        assignmentSource: "setup_draft",
        assignmentStatus: "planned",
        active: false,
      },
    ],
    assignmentTargetValidation: input.assignmentTargetValidation ?? null,
    plannedAssignmentResolution: input.plannedAssignmentResolution ?? null,
    warnings: input.warnings,
    existingActivationPlanKey: input.existingActivationPlanKey ?? null,
  };
}

function readiness(
  input: Partial<ServerDeploymentActivationReadinessResult> = {},
): ServerDeploymentActivationReadinessResult {
  return {
    ok: input.ok ?? true,
    status: input.status ?? "ready",
    clinicId: input.clinicId ?? CLINIC_ID,
    deploymentRunId: input.deploymentRunId ?? DEPLOYMENT_RUN_ID,
    checksRequested: input.checksRequested ?? 1,
    checksPassed: input.checksPassed ?? 1,
    checksFailed: input.checksFailed ?? 0,
    blockers: input.blockers ?? 0,
    warnings: input.warnings ?? 0,
    issues: input.issues ?? [],
    downstream: input.downstream ?? zeroDownstream(),
    message: input.message ?? "Activation readiness is ready.",
  };
}

function resolution(
  input: Partial<ServerDeploymentPlannedAssignmentResolutionResult> = {},
): ServerDeploymentPlannedAssignmentResolutionResult {
  return {
    ok: input.ok ?? true,
    status: input.status ?? "resolved",
    clinicId: input.clinicId ?? CLINIC_ID,
    requested: input.requested ?? 1,
    resolved: input.resolved ?? 1,
    unresolved: input.unresolved ?? 0,
    missingHardware: input.missingHardware ?? 0,
    missingTargets: input.missingTargets ?? 0,
    incompatibleHardware: input.incompatibleHardware ?? 0,
    incompatibleTargets: input.incompatibleTargets ?? 0,
    records: input.records ?? [
      {
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        hardwareId: "hardware-row-001",
        assignmentKey: "hardware-assignment-hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
        targetId: "workstation-row-001",
        resolutionStatus: "resolved",
        issues: [],
      },
    ],
    issues: input.issues ?? [],
    downstream: input.downstream ?? zeroDownstream(),
    message: input.message ?? "Planned assignment resolution passed.",
  };
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

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationPlanRuntimeHarnessScenario {
  return { name, passed, message };
}
