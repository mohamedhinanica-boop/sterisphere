import {
  buildClinicActivationCurrentState,
  canonicalizeActivationCurrentState,
  compareActivationCurrentStates,
  formatActivationCurrentStateDifferences,
} from "./deployment-activation-current-state";
import type {
  DeploymentClinicActivationRepository,
} from "./deployment-clinic-activation-repository";
import {
  cloneRecord,
  type DeploymentClinicActivationClinicSnapshot,
  type DeploymentClinicActivationCommand,
  type DeploymentClinicActivationDownstreamCounts,
  type DeploymentClinicActivationIssue,
  type DeploymentClinicActivationIssueCode,
  type DeploymentClinicActivationIssueSeverity,
  type DeploymentClinicActivationItemSnapshot,
  type DeploymentClinicActivationResult,
  type DeploymentClinicActivationSessionSnapshot,
  type DeploymentClinicActivationSnapshot,
  type DeploymentClinicActivationStatus,
} from "./deployment-clinic-activation-types";

const SUPPORTED_TARGET_PATCH = canonicalizeActivationCurrentState({
  deploymentStatus: "active",
});

export class DeploymentClinicActivationService {
  constructor(
    private readonly repository: DeploymentClinicActivationRepository,
  ) {}

  async assessClinicActivation(
    command: DeploymentClinicActivationCommand,
  ): Promise<DeploymentClinicActivationResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        currentClinicState: null,
        proposedClinicState: null,
        issues: commandIssues,
        message:
          "Clinic activation assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = await this.repository.loadClinicActivationSnapshot({
        clinicId: command.clinicId,
        deploymentRunId: command.deploymentRunId,
        sessionId: command.sessionId,
        executionKey: command.executionKey,
        itemId: command.itemId,
        executionItemKey: command.executionItemKey,
        planItemKey: command.planItemKey,
      });

      return assessSnapshot(command, snapshot);
    } catch {
      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        currentClinicState: null,
        proposedClinicState: null,
        issues: [
          commandIssue(
            "repository_error",
            command,
            "Clinic activation repository failed safely.",
          ),
        ],
        message:
          "Clinic activation assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentClinicActivationService(
  repository: DeploymentClinicActivationRepository,
): DeploymentClinicActivationService {
  return new DeploymentClinicActivationService(repository);
}

function assessSnapshot(
  command: DeploymentClinicActivationCommand,
  snapshot: DeploymentClinicActivationSnapshot,
): DeploymentClinicActivationResult {
  const missingIssues = validatePresence(command, snapshot);

  if (hasBlocker(missingIssues)) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      currentClinicState: null,
      proposedClinicState: null,
      issues: missingIssues,
      message:
        "Clinic activation assessment found missing session, item, or clinic evidence.",
    });
  }

  const session = snapshot.session as DeploymentClinicActivationSessionSnapshot;
  const item = snapshot.item as DeploymentClinicActivationItemSnapshot;
  const clinic = snapshot.clinic as DeploymentClinicActivationClinicSnapshot;
  const currentClinicState = buildCurrentClinicState(clinic);
  const proposedClinicState = buildProposedClinicState(currentClinicState);
  const issues = [
    ...validateSession(command, session),
    ...validateItem(command, session, item, clinic),
    ...validateClinic(command, item, clinic, currentClinicState, proposedClinicState),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      snapshot,
      currentClinicState,
      proposedClinicState,
      issues,
      message:
        "Clinic activation assessment blocked because durable evidence is not activation-safe.",
    });
  }

  if (
    compareActivationCurrentStates(proposedClinicState, currentClinicState)
      .equivalent
  ) {
    return buildResult({
      status: "already_activated",
      command,
      snapshot,
      currentClinicState,
      proposedClinicState,
      issues: [],
      message:
        "Clinic already matches the planned activation target. No clinic mutation was performed.",
    });
  }

  return buildResult({
    status: "activation_ready",
    command,
    snapshot,
    currentClinicState,
    proposedClinicState,
    issues: standardWarnings(command, item),
    message:
      "Clinic activation is eligible. No clinic activation was persisted.",
  });
}

function validateCommand(
  command: DeploymentClinicActivationCommand,
): DeploymentClinicActivationIssue[] {
  const issues: DeploymentClinicActivationIssue[] = [];

  if (!command.claimantId.trim()) {
    issues.push(commandIssue("claimant_invalid", command, "Claimant id is required."));
  }

  if (!command.ownershipToken.trim()) {
    issues.push(commandIssue("ownership_token_invalid", command, "Ownership token is required."));
  }

  if (!isValidTimestamp(command.assessmentTimestamp)) {
    issues.push(commandIssue("assessment_timestamp_invalid", command, "Assessment timestamp must be valid."));
  }

  return issues.sort(compareIssues);
}

function validatePresence(
  command: DeploymentClinicActivationCommand,
  snapshot: DeploymentClinicActivationSnapshot,
): DeploymentClinicActivationIssue[] {
  const issues: DeploymentClinicActivationIssue[] = [];

  if (!snapshot.session) {
    issues.push(commandIssue("missing_session", command, "Activation execution session was not found."));
  }

  if (!snapshot.item) {
    issues.push(commandIssue("missing_item", command, "Running clinic activation item was not found."));
  }

  if (!snapshot.clinic) {
    issues.push(commandIssue("missing_clinic", command, "Clinic activation target was not found."));
  }

  return issues.sort(compareIssues);
}

function validateSession(
  command: DeploymentClinicActivationCommand,
  session: DeploymentClinicActivationSessionSnapshot,
): DeploymentClinicActivationIssue[] {
  const issues: DeploymentClinicActivationIssue[] = [];

  addIdentityIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the activation request.");
  addIdentityIssue(issues, session.deploymentRunId !== command.deploymentRunId, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the activation request.");
  addIdentityIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the activation request.");
  addIdentityIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the activation request.");

  if (session.executionStatus !== "running") {
    issues.push(blocker("session_not_running", command, "Execution session is not running."));
  }

  if (!session.startedAt || !isValidTimestamp(session.startedAt)) {
    issues.push(blocker("session_timestamp_missing", command, "Execution session is missing valid started_at evidence."));
  }

  if (session.completedAt !== null || session.failedAt !== null) {
    issues.push(blocker("terminal_session_timestamp_present", command, "Execution session has terminal lifecycle timestamps."));
  }

  if (!session.executionOwner || !session.ownershipToken) {
    issues.push(blocker("ownership_shape_inconsistent", command, "Execution session requires owner and token evidence."));
  }

  if (!session.leaseExpiresAt) {
    issues.push(blocker("lease_missing", command, "Execution session requires active lease evidence."));
    return issues;
  }

  if (!isValidTimestamp(session.leaseExpiresAt)) {
    issues.push(blocker("lease_timestamp_malformed", command, "Execution session lease expiration is malformed."));
    return issues;
  }

  if (session.executionOwner && session.executionOwner !== command.claimantId) {
    issues.push(blocker("session_owned_by_another_executor", command, "Execution session is owned by another executor."));
  }

  if (session.ownershipToken && session.ownershipToken !== command.ownershipToken) {
    issues.push(blocker("ownership_token_mismatch", command, "Execution session ownership token does not match the activation request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.assessmentTimestamp)) {
    issues.push(blocker("lease_expired", command, "Execution session lease is not active."));
  }

  return issues;
}

function validateItem(
  command: DeploymentClinicActivationCommand,
  session: DeploymentClinicActivationSessionSnapshot,
  item: DeploymentClinicActivationItemSnapshot,
  clinic: DeploymentClinicActivationClinicSnapshot,
): DeploymentClinicActivationIssue[] {
  const issues: DeploymentClinicActivationIssue[] = [];

  addIdentityIssue(issues, item.itemId !== command.itemId, "item_identity_mismatch", command, "Clinic activation item id does not match the activation request.");
  addIdentityIssue(issues, item.executionItemKey !== command.executionItemKey, "item_identity_mismatch", command, "Clinic activation item key does not match the activation request.");
  addIdentityIssue(issues, item.planItemKey !== command.planItemKey, "item_identity_mismatch", command, "Clinic activation plan item key does not match the activation request.");

  if (item.sessionId !== session.sessionId) {
    issues.push(blocker("item_session_mismatch", command, "Clinic activation item does not belong to the execution session."));
  }

  if (item.sequence !== 1 || item.entityType !== "clinic" || item.action !== "activate") {
    issues.push(blocker("item_entity_mismatch", command, "Execution item is not the first clinic activation item."));
  }

  if (item.entityId !== clinic.id && item.entityId !== command.clinicId) {
    issues.push(blocker("item_entity_mismatch", command, "Clinic activation item entity does not match the clinic."));
  }

  if (item.executionStatus !== "running") {
    issues.push(blocker("item_not_running", command, "Clinic activation item is not running."));
  }

  if (item.attemptCount !== 1) {
    issues.push(blocker("item_attempt_invalid", command, "Clinic activation item must have exactly one attempt."));
  }

  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("item_timestamp_missing", command, "Clinic activation item is missing valid started_at evidence."));
  }

  if (item.completedAt !== null || item.rolledBackAt !== null) {
    issues.push(blocker("item_terminal_evidence_present", command, "Clinic activation item has terminal or rollback evidence."));
  }

  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("item_error_present", command, "Clinic activation item has error evidence."));
  }

  if (item.dependencyKeys.length > 0) {
    issues.push(blocker("item_dependency_present", command, "Clinic activation item must not depend on earlier items."));
  }

  if (!item.expectedCurrentState) {
    issues.push(blocker("item_expected_state_missing", command, "Clinic activation item is missing expected current state evidence."));
  }

  if (!item.targetState) {
    issues.push(blocker("item_target_state_missing", command, "Clinic activation item is missing target state evidence."));
  } else if (!isSupportedTargetPatch(item.targetState)) {
    issues.push(blocker("unsupported_target_state", command, "Clinic activation item target state is not a supported activation transition."));
  }

  return issues;
}

function validateClinic(
  command: DeploymentClinicActivationCommand,
  item: DeploymentClinicActivationItemSnapshot,
  clinic: DeploymentClinicActivationClinicSnapshot,
  currentClinicState: Record<string, unknown>,
  proposedClinicState: Record<string, unknown>,
): DeploymentClinicActivationIssue[] {
  const issues: DeploymentClinicActivationIssue[] = [];
  const alreadyMatchesTarget =
    compareActivationCurrentStates(proposedClinicState, currentClinicState)
      .equivalent;

  if (clinic.id !== command.clinicId && clinic.clinicId !== command.clinicId) {
    issues.push(blocker("clinic_identity_mismatch", command, "Clinic row does not match the activation request."));
  }

  if (clinic.deploymentRunId !== command.deploymentRunId) {
    issues.push(blocker("clinic_deployment_ownership_mismatch", command, "Clinic does not belong to the deployment run."));
  }

  if (clinic.archivedAt !== null || clinic.deletedAt !== null) {
    issues.push(blocker("clinic_archived_or_deleted", command, "Clinic is archived or deleted."));
  }

  if (!alreadyMatchesTarget) {
    if (clinic.active !== false) {
      issues.push(blocker("clinic_lifecycle_incompatible", command, "Clinic is not an inactive planned shell."));
    }

    if (
      clinic.provisioningSource !== "setup_draft" ||
      clinic.provisioningStatus !== "planned"
    ) {
      issues.push(blocker("clinic_provisioning_incompatible", command, "Clinic provisioning evidence is not setup-draft planned."));
    }
  } else if (clinic.active !== true && clinic.deploymentStatus !== "active") {
    issues.push(blocker("clinic_already_active_conflict", command, "Clinic current state matches the target without compatible active evidence."));
  }

  if (item.expectedCurrentState) {
    const comparison = compareActivationCurrentStates(
      item.expectedCurrentState,
      currentClinicState,
    );

    if (!comparison.equivalent && !alreadyMatchesTarget) {
      issues.push(blocker(
        "clinic_state_mismatch",
        command,
        `Clinic current state drifted from item evidence: ${formatActivationCurrentStateDifferences(comparison.differences)}.`,
      ));
    }
  }

  if (clinic.active === true && !alreadyMatchesTarget) {
    issues.push(blocker("clinic_already_active_conflict", command, "Clinic is active but does not match the planned target state."));
  }

  return issues;
}

function buildCurrentClinicState(
  clinic: DeploymentClinicActivationClinicSnapshot,
): Record<string, unknown> {
  return canonicalizeActivationCurrentState(
    clinic.currentState ??
      buildClinicActivationCurrentState({
        clinicId: clinic.id,
        deploymentStatus: clinic.deploymentStatus,
      }),
  );
}

function buildProposedClinicState(
  currentClinicState: Record<string, unknown>,
): Record<string, unknown> {
  return canonicalizeActivationCurrentState({
    ...cloneRecord(currentClinicState),
    deploymentStatus: "active",
  });
}

function isSupportedTargetPatch(targetState: Record<string, unknown>): boolean {
  return compareActivationCurrentStates(
    SUPPORTED_TARGET_PATCH,
    canonicalizeActivationCurrentState(targetState),
  ).equivalent;
}

function buildResult(input: {
  status: DeploymentClinicActivationStatus;
  command: DeploymentClinicActivationCommand;
  snapshot: DeploymentClinicActivationSnapshot;
  currentClinicState: Record<string, unknown> | null;
  proposedClinicState: Record<string, unknown> | null;
  issues: readonly DeploymentClinicActivationIssue[];
  message: string;
}): DeploymentClinicActivationResult {
  const issues = [...input.issues].sort(compareIssues);

  return {
    ok:
      input.status === "activation_ready" ||
      input.status === "already_activated",
    status: input.status,
    clinicId: input.snapshot.clinic?.id ?? input.command.clinicId ?? null,
    deploymentRunId:
      input.snapshot.session?.deploymentRunId ??
      input.snapshot.clinic?.deploymentRunId ??
      input.command.deploymentRunId ??
      null,
    sessionId:
      input.snapshot.session?.sessionId ?? input.command.sessionId ?? null,
    executionKey:
      input.snapshot.session?.executionKey ?? input.command.executionKey ?? null,
    itemId: input.snapshot.item?.itemId ?? input.command.itemId ?? null,
    executionItemKey:
      input.snapshot.item?.executionItemKey ??
      input.command.executionItemKey ??
      null,
    planItemKey:
      input.snapshot.item?.planItemKey ?? input.command.planItemKey ?? null,
    claimantId: input.command.claimantId || null,
    leaseExpiresAt: input.snapshot.session?.leaseExpiresAt ?? null,
    currentClinicState: input.currentClinicState,
    proposedClinicState: input.proposedClinicState,
    blockers: issues.filter((current) => current.severity === "blocker").length,
    warnings: issues.filter((current) => current.severity === "warning").length,
    issues,
    downstream: zeroDownstream(),
    message: input.message,
  };
}

function standardWarnings(
  command: DeploymentClinicActivationCommand,
  item: DeploymentClinicActivationItemSnapshot,
): DeploymentClinicActivationIssue[] {
  return [
    blocker("activation_persistence_unimplemented", command, "Clinic activation persistence is not implemented in this slice.", "warning", item),
    blocker("item_completion_unimplemented", command, "Execution item completion is not implemented in this slice.", "warning", item),
    blocker("dependency_progression_unimplemented", command, "Dependency progression is not implemented in this slice.", "warning", item),
    blocker("rollback_execution_unimplemented", command, "Rollback execution is not implemented in this slice.", "warning", item),
  ];
}

function statusForIssues(
  issues: readonly DeploymentClinicActivationIssue[],
): "blocked" | "conflict" | "not_found" {
  if (
    issues.some((current) =>
      ["missing_session", "missing_item", "missing_clinic"].includes(current.code),
    )
  ) {
    return "not_found";
  }

  return issues.some((current) =>
    [
      "clinic_identity_mismatch",
      "deployment_run_identity_mismatch",
      "session_identity_mismatch",
      "execution_key_mismatch",
      "item_identity_mismatch",
      "item_session_mismatch",
      "item_entity_mismatch",
      "session_owned_by_another_executor",
      "ownership_token_mismatch",
      "clinic_deployment_ownership_mismatch",
      "clinic_already_active_conflict",
    ].includes(current.code),
  )
    ? "conflict"
    : "blocked";
}

function addIdentityIssue(
  issues: DeploymentClinicActivationIssue[],
  condition: boolean,
  code: DeploymentClinicActivationIssueCode,
  command: DeploymentClinicActivationCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentClinicActivationIssueCode,
  command: DeploymentClinicActivationCommand,
  message: string,
): DeploymentClinicActivationIssue {
  return issue({
    code,
    severity: "blocker",
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: command.executionItemKey,
    planItemKey: command.planItemKey,
    message,
  });
}

function blocker(
  code: DeploymentClinicActivationIssueCode,
  command: DeploymentClinicActivationCommand,
  message: string,
  severity: DeploymentClinicActivationIssueSeverity = "blocker",
  item?: DeploymentClinicActivationItemSnapshot,
): DeploymentClinicActivationIssue {
  return issue({
    code,
    severity,
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: item?.executionItemKey ?? command.executionItemKey,
    planItemKey: item?.planItemKey ?? command.planItemKey,
    message,
  });
}

function issue(input: {
  code: DeploymentClinicActivationIssueCode;
  severity: DeploymentClinicActivationIssueSeverity;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  message: string;
}): DeploymentClinicActivationIssue {
  return { ...input };
}

function hasBlocker(
  issues: readonly DeploymentClinicActivationIssue[],
): boolean {
  return issues.some((current) => current.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function compareIssues(
  left: DeploymentClinicActivationIssue,
  right: DeploymentClinicActivationIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionKey ?? "").localeCompare(String(right.executionKey ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? ""))
  );
}

function zeroDownstream(): DeploymentClinicActivationDownstreamCounts {
  return {
    clinicsActivated: 0,
    itemsSucceeded: 0,
    dependenciesUnlocked: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    workstationsActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    deploymentFinalized: 0,
  };
}

function emptySnapshot(): DeploymentClinicActivationSnapshot {
  return {
    session: null,
    item: null,
    clinic: null,
  };
}
