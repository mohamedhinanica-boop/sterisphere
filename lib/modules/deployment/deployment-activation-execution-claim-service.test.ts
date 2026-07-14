import {
  DeploymentActivationExecutionClaimService,
} from "./deployment-activation-execution-claim-service";
import {
  buildClaimSnapshot,
  InMemoryDeploymentActivationExecutionClaimTestRepository,
} from "./deployment-activation-execution-claim-test-repository";
import type {
  DeploymentActivationExecutionClaimCommand,
  DeploymentActivationExecutionClaimIssueCode,
  DeploymentActivationExecutionClaimResult,
  DeploymentActivationExecutionClaimSnapshot,
} from "./deployment-activation-execution-claim-types";

export interface DeploymentActivationExecutionClaimServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionClaimServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionClaimServiceHarnessScenario[];
}

const CLAIMED_AT = "2026-01-01T12:00:00.000Z";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T11:55:00.000Z";
const CLINIC_ID = "clinic-claim-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-claim-0001";
const SESSION_ID = "activation-execution-session-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-claim-0001";
const PLAN_KEY = "activation-plan-deployment-run-claim-0001";
const CLAIMANT_ID = "executor-001";

export async function runDeploymentActivationExecutionClaimServiceHarness(): Promise<DeploymentActivationExecutionClaimServiceHarnessResult> {
  const scenarios = [
    await scenarioFreshClaimable(),
    await scenarioMissingSessionBlocks(),
    await scenarioClinicMismatchBlocks(),
    await scenarioDeploymentRunMismatchBlocks(),
    await scenarioExecutionKeyMismatchBlocks(),
    await scenarioPlanKeyMismatchBlocks(),
    await scenarioPreparationNotReadyBlocks(),
    await scenarioExecutionStatusBlocks(),
    await scenarioSessionTimestampsBlock(),
    await scenarioItemCountMismatchBlocks(),
    await scenarioDuplicateExecutionItemKeyBlocks(),
    await scenarioDuplicatePlanItemKeyBlocks(),
    await scenarioDuplicateSequenceBlocks(),
    await scenarioRunningItemBlocks(),
    await scenarioCompletedItemBlocks(),
    await scenarioNonzeroAttemptBlocks(),
    await scenarioExecutionTimestampBlocks(),
    await scenarioRollbackTimestampBlocks(),
    await scenarioItemErrorBlocks(),
    await scenarioNoReadyItemBlocks(),
    await scenarioMultipleReadyRootsBlock(),
    await scenarioSameOwnerActiveLease(),
    await scenarioRunningSameOwnerActiveLease(),
    await scenarioRunningSameOwnerOneItemStartedActiveLease(),
    await scenarioRunningOneItemCompletenessUsesRunningAndPending(),
    await scenarioRunningSecondItemBlocks(),
    await scenarioRunningAttemptZeroBlocks(),
    await scenarioRunningAttemptGreaterThanOneBlocks(),
    await scenarioRunningItemMissingStartedAtBlocks(),
    await scenarioRunningItemCompletionBlocks(),
    await scenarioRunningItemRollbackBlocks(),
    await scenarioRunningItemErrorBlocks(),
    await scenarioRunningPendingItemAttemptBlocks(),
    await scenarioRunningPendingItemTimestampBlocks(),
    await scenarioRunningPendingItemNonPendingBlocks(),
    await scenarioRunningMalformedDependencyBlocks(),
    await scenarioRunningExpiredLeaseBlocks(),
    await scenarioRunningMissingStartedAtBlocks(),
    await scenarioSameOwnerSupabaseTimestampActiveLease(),
    await scenarioClaimedMissingOwnerBlocks(),
    await scenarioClaimedMissingTokenBlocks(),
    await scenarioClaimedMissingLeaseBlocks(),
    await scenarioClaimedMalformedLeaseBlocks(),
    await scenarioOtherOwnerActiveLease(),
    await scenarioExpiredLeaseReclaimable(),
    await scenarioExpiredLeaseWithAttemptsBlocks(),
    await scenarioExpiredLeaseWithTimestampsBlocks(),
    await scenarioExpiredLeaseWithTerminalStateBlocks(),
    await scenarioOwnershipShapeInconsistencyBlocks(),
    await scenarioMinimumLeaseAccepted(),
    await scenarioMaximumLeaseAccepted(),
    await scenarioBelowMinimumLeaseRejected(),
    await scenarioAboveMaximumLeaseRejected(),
    await scenarioNegativeLeaseRejected(),
    await scenarioInvalidClaimTimestampRejected(),
    await scenarioDeterministicDecision(),
    await scenarioIssueOrderingDeterministic(),
    await scenarioRepositoryError(),
    await scenarioSourceSnapshotUnmodified(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioFreshClaimable(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "fresh unowned prepared session is claimable",
    result.ok &&
      result.status === "claimable" &&
      result.proposedOwnershipToken === "token-activation-execution-session-0001-executor-001-20260101T120000000Z" &&
      result.proposedLeaseStartedAt === CLAIMED_AT &&
      result.proposedLeaseExpiresAt === "2026-01-01T12:05:00.000Z" &&
      result.downstream.sessionsClaimed === 0,
    JSON.stringify(result),
  );
}

async function scenarioMissingSessionBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("missing session blocks", snapshot({ session: null }), "missing_session", "blocked");
}

async function scenarioClinicMismatchBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("clinic mismatch blocks", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict");
}

async function scenarioDeploymentRunMismatchBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("deployment run mismatch blocks", snapshot({ session: { deploymentRunId: "deployment-run-other" } }), "deployment_run_identity_mismatch", "conflict");
}

async function scenarioExecutionKeyMismatchBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("execution key mismatch blocks", snapshot({ session: { executionKey: "activation-execution-other" } }), "execution_key_mismatch", "conflict");
}

async function scenarioPlanKeyMismatchBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("plan key mismatch blocks", snapshot({ session: { planKey: "activation-plan-other" } }), "plan_key_mismatch", "conflict");
}

async function scenarioPreparationNotReadyBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("preparation not ready blocks", snapshot({ session: { preparationStatus: "blocked" } }), "preparation_not_ready", "blocked");
}

async function scenarioExecutionStatusBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("terminal execution status blocks", snapshot({ session: { executionStatus: "completed" } }), "execution_status_not_claimable", "blocked");
}

async function scenarioSessionTimestampsBlock(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("session timestamps block", snapshot({ session: { startedAt: CLAIMED_AT } }), "session_timestamp_present", "blocked");
}

async function scenarioItemCountMismatchBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("item count mismatch blocks", snapshot({ itemCompleteness: { durableItemCount: 2 } }), "incomplete_item_set", "blocked");
}

async function scenarioDuplicateExecutionItemKeyBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("duplicate execution item key blocks", snapshot({ itemCompleteness: { duplicateExecutionItemKeyCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioDuplicatePlanItemKeyBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("duplicate plan item key blocks", snapshot({ itemCompleteness: { duplicatePlanItemKeyCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioDuplicateSequenceBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("duplicate sequence blocks", snapshot({ itemCompleteness: { duplicateSequenceCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioRunningItemBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("running item blocks", snapshot({ itemCompleteness: { runningOrTerminalItemCount: 1 } }), "invalid_item_lifecycle", "blocked");
}

async function scenarioCompletedItemBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("completed item blocks", snapshot({ itemCompleteness: { runningOrTerminalItemCount: 1, invalidPreparedItemCount: 1 } }), "invalid_item_lifecycle", "blocked");
}

async function scenarioNonzeroAttemptBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("nonzero attempt blocks", snapshot({ itemCompleteness: { itemsWithAttempts: 1 } }), "attempt_evidence_present", "blocked");
}

async function scenarioExecutionTimestampBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("execution timestamp blocks", snapshot({ itemCompleteness: { itemsWithExecutionTimestamps: 1 } }), "execution_timestamp_present", "blocked");
}

async function scenarioRollbackTimestampBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("rollback timestamp blocks", snapshot({ itemCompleteness: { itemsWithRollbackTimestamps: 1 } }), "rollback_timestamp_present", "blocked");
}

async function scenarioItemErrorBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("item error blocks", snapshot({ itemCompleteness: { itemsWithErrors: 1 } }), "item_error_present", "blocked");
}

async function scenarioNoReadyItemBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue(
    "no ready item blocks",
    snapshot({ itemCompleteness: { readyItemCount: 0, pendingItemCount: 3, readyRootItemCount: 0, firstExecutableStatus: "pending" } }),
    "dependency_integrity_invalid",
    "blocked",
  );
}

async function scenarioMultipleReadyRootsBlock(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue(
    "multiple ready roots block",
    snapshot({ itemCompleteness: { readyItemCount: 2, pendingItemCount: 1, readyRootItemCount: 2 } }),
    "dependency_integrity_invalid",
    "blocked",
  );
}

async function scenarioSameOwnerActiveLease(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(ownedSnapshot(CLAIMANT_ID, ACTIVE_LEASE));

  return expectScenario(
    "same claimant active lease returns already owned",
    result.ok &&
      result.status === "already_owned" &&
      result.proposedOwnershipToken === "existing-token" &&
      result.existingOwner === CLAIMANT_ID &&
      result.proposedLeaseExpiresAt === ACTIVE_LEASE &&
      result.existingLeaseExpiresAt === ACTIVE_LEASE &&
      !result.message.includes("existing-token") &&
      result.issues.every((issue) => !issue.message.includes("existing-token")),
    JSON.stringify(result),
  );
}

async function scenarioRunningSameOwnerActiveLease(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(runningOwnedSnapshot(CLAIMANT_ID, ACTIVE_LEASE));

  return expectScenario(
    "running same-owner active lease returns already owned without renewal",
    result.ok &&
      result.status === "already_owned" &&
      result.proposedOwnershipToken === "existing-token" &&
      result.existingOwner === CLAIMANT_ID &&
      result.proposedLeaseExpiresAt === ACTIVE_LEASE &&
      result.existingLeaseExpiresAt === ACTIVE_LEASE,
    JSON.stringify(result),
  );
}

async function scenarioRunningSameOwnerOneItemStartedActiveLease(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(runningOwnedSnapshot(CLAIMANT_ID, ACTIVE_LEASE, runningOneItemCompleteness()));

  return expectScenario(
    "running same-owner with one started item returns already owned",
    result.ok &&
      result.status === "already_owned" &&
      result.proposedOwnershipToken === "existing-token" &&
      result.proposedLeaseExpiresAt === ACTIVE_LEASE &&
      !hasIssue(result, "attempt_evidence_present") &&
      !hasIssue(result, "execution_timestamp_present") &&
      !hasIssue(result, "invalid_item_lifecycle") &&
      !hasIssue(result, "incomplete_item_set") &&
      !hasIssue(result, "dependency_integrity_invalid"),
    JSON.stringify(result),
  );
}

async function scenarioRunningOneItemCompletenessUsesRunningAndPending(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(runningOwnedSnapshot(CLAIMANT_ID, ACTIVE_LEASE, runningOneItemCompleteness()));

  return expectScenario(
    "one-running-item completeness uses running plus pending",
    result.status === "already_owned" &&
      result.itemCompleteness.runningItemCount + result.itemCompleteness.pendingItemCount === 3 &&
      result.itemCompleteness.readyItemCount === 0,
    JSON.stringify(result.itemCompleteness),
  );
}

async function scenarioRunningSecondItemBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("second running item blocks", { runningItemCount: 2, pendingItemCount: 1, runningItemsWithAttemptOne: 2, runningItemsWithValidStartedAt: 2, itemsWithAttempts: 2, itemsWithExecutionTimestamps: 2 }, "invalid_item_lifecycle");
}

async function scenarioRunningAttemptZeroBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("running item attempt 0 blocks", { runningItemsWithAttemptOne: 0, itemsWithAttempts: 0 }, "attempt_evidence_present");
}

async function scenarioRunningAttemptGreaterThanOneBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("running item attempt greater than 1 blocks", { runningItemsWithAttemptOne: 0 }, "attempt_evidence_present");
}

async function scenarioRunningItemMissingStartedAtBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("running item missing startedAt blocks", { runningItemsWithValidStartedAt: 0, itemsWithExecutionTimestamps: 0 }, "execution_timestamp_present");
}

async function scenarioRunningItemCompletionBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("running item completion evidence blocks", { runningItemsWithCompletionEvidence: 1, itemsWithExecutionTimestamps: 2 }, "execution_timestamp_present");
}

async function scenarioRunningItemRollbackBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("running item rollback evidence blocks", { runningItemsWithCompletionEvidence: 1, itemsWithRollbackTimestamps: 1 }, "rollback_timestamp_present");
}

async function scenarioRunningItemErrorBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("running item error evidence blocks", { runningItemsWithCompletionEvidence: 1, itemsWithErrors: 1 }, "item_error_present");
}

async function scenarioRunningPendingItemAttemptBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("pending item attempt blocks", { pendingItemsWithAttempts: 1, itemsWithAttempts: 2 }, "attempt_evidence_present");
}

async function scenarioRunningPendingItemTimestampBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("pending item timestamp blocks", { pendingItemsWithExecutionTimestamps: 1, itemsWithExecutionTimestamps: 2 }, "execution_timestamp_present");
}

async function scenarioRunningPendingItemNonPendingBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("pending item non-pending lifecycle blocks", { pendingItemCount: 1, readyItemCount: 1 }, "invalid_item_lifecycle");
}

async function scenarioRunningMalformedDependencyBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectRunningOneItemIssue("running malformed dependency evidence blocks", { dependencyIntegrityIssueCount: 1 }, "dependency_integrity_invalid");
}
async function scenarioRunningExpiredLeaseBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(runningOwnedSnapshot(CLAIMANT_ID, EXPIRED_LEASE));

  return expectScenario(
    "running expired lease blocks without reclaim",
    result.status === "blocked" &&
      hasIssue(result, "expired_lease_reclaimable") &&
      result.proposedOwnershipToken === null &&
      result.proposedLeaseExpiresAt === null,
    JSON.stringify(result),
  );
}

async function scenarioRunningMissingStartedAtBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue(
    "running missing started timestamp blocks",
    runningOwnedSnapshot(CLAIMANT_ID, ACTIVE_LEASE, {}, { startedAt: null }),
    "session_timestamp_present",
    "blocked",
  );
}
async function scenarioSameOwnerSupabaseTimestampActiveLease(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const supabaseLease = "2026-01-01T12:05:00.000+00:00";
  const result = await assess(ownedSnapshot(CLAIMANT_ID, supabaseLease));

  return expectScenario(
    "same-owner active lease accepts Supabase timestamptz string",
    result.ok &&
      result.status === "already_owned" &&
      result.proposedLeaseExpiresAt === supabaseLease &&
      result.existingLeaseExpiresAt === supabaseLease,
    JSON.stringify(result),
  );
}

async function scenarioClaimedMissingOwnerBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("claimed missing owner blocks", snapshot({ session: { executionStatus: "claimed", executionOwner: null, ownershipToken: "existing-token", leaseExpiresAt: ACTIVE_LEASE } }), "ownership_shape_inconsistent", "conflict");
}

async function scenarioClaimedMissingTokenBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("claimed missing token blocks", snapshot({ session: { executionStatus: "claimed", executionOwner: CLAIMANT_ID, ownershipToken: null, leaseExpiresAt: ACTIVE_LEASE } }), "ownership_shape_inconsistent", "conflict");
}

async function scenarioClaimedMissingLeaseBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("claimed missing lease blocks", snapshot({ session: { executionStatus: "claimed", executionOwner: CLAIMANT_ID, ownershipToken: "existing-token", leaseExpiresAt: null } }), "ownership_shape_inconsistent", "conflict");
}

async function scenarioClaimedMalformedLeaseBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("claimed malformed lease blocks", snapshot({ session: { executionStatus: "claimed", executionOwner: CLAIMANT_ID, ownershipToken: "existing-token", leaseExpiresAt: "not-a-date" } }), "ownership_shape_inconsistent", "conflict");
}

async function scenarioOtherOwnerActiveLease(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(ownedSnapshot("executor-other", ACTIVE_LEASE));

  return expectScenario(
    "other claimant active lease conflicts",
    result.status === "conflict" &&
      result.proposedOwnershipToken === null &&
      hasIssue(result, "session_owned_by_another_executor") &&
      !result.message.includes("existing-token"),
    JSON.stringify(result),
  );
}

async function scenarioExpiredLeaseReclaimable(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(ownedSnapshot("executor-other", EXPIRED_LEASE));

  return expectScenario(
    "expired untouched lease is reclaimable proposal",
    result.ok &&
      result.status === "lease_expired_reclaimable" &&
      result.existingOwner === "executor-other" &&
      hasIssue(result, "expired_lease_reclaimable"),
    JSON.stringify(result),
  );
}

async function scenarioExpiredLeaseWithAttemptsBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("expired lease with attempts blocks", ownedSnapshot("executor-other", EXPIRED_LEASE, { itemsWithAttempts: 1 }), "attempt_evidence_present", "blocked");
}

async function scenarioExpiredLeaseWithTimestampsBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("expired lease with timestamps blocks", ownedSnapshot("executor-other", EXPIRED_LEASE, { itemsWithExecutionTimestamps: 1 }), "execution_timestamp_present", "blocked");
}

async function scenarioExpiredLeaseWithTerminalStateBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("expired lease with terminal item blocks", ownedSnapshot("executor-other", EXPIRED_LEASE, { runningOrTerminalItemCount: 1 }), "invalid_item_lifecycle", "blocked");
}

async function scenarioOwnershipShapeInconsistencyBlocks(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectIssue("missing token ownership shape blocks", snapshot({ session: { executionOwner: CLAIMANT_ID, ownershipToken: null, leaseExpiresAt: ACTIVE_LEASE } }), "ownership_shape_inconsistent", "conflict");
}

async function scenarioMinimumLeaseAccepted(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(undefined, { leaseDurationSeconds: 30 });

  return expectScenario("minimum lease accepted", result.status === "claimable" && result.proposedLeaseExpiresAt === "2026-01-01T12:00:30.000Z", JSON.stringify(result));
}

async function scenarioMaximumLeaseAccepted(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(undefined, { leaseDurationSeconds: 900 });

  return expectScenario("maximum lease accepted", result.status === "claimable" && result.proposedLeaseExpiresAt === "2026-01-01T12:15:00.000Z", JSON.stringify(result));
}

async function scenarioBelowMinimumLeaseRejected(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectCommandIssue("below minimum lease rejected", { leaseDurationSeconds: 29 }, "lease_duration_invalid");
}

async function scenarioAboveMaximumLeaseRejected(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectCommandIssue("above maximum lease rejected", { leaseDurationSeconds: 901 }, "lease_duration_invalid");
}

async function scenarioNegativeLeaseRejected(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectCommandIssue("negative lease rejected", { leaseDurationSeconds: -1 }, "lease_duration_invalid");
}

async function scenarioInvalidClaimTimestampRejected(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  return expectCommandIssue("invalid claim timestamp rejected", { claimRequestedAt: "not-a-date" }, "claim_timestamp_invalid");
}

async function scenarioDeterministicDecision(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const first = await assess();
  const second = await assess();

  return expectScenario(
    "same snapshot and token factory returns same decision",
    JSON.stringify(first) === JSON.stringify(second),
    JSON.stringify({ first, second }),
  );
}

async function scenarioIssueOrderingDeterministic(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(snapshot({
    itemCompleteness: {
      duplicateSequenceCount: 1,
      itemsWithErrors: 1,
      itemsWithAttempts: 1,
    },
  }));
  const codes = result.issues.map((issue) => issue.code).join(",");

  return expectScenario(
    "issue ordering is deterministic",
    codes === "attempt_evidence_present,duplicate_item_identity,item_error_present",
    codes,
  );
}

async function scenarioRepositoryError(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionClaimTestRepository({
    shouldThrow: true,
  });
  const result = await service(repository).assessClaim(command());

  return expectScenario(
    "repository error returns safe error",
    result.status === "error" &&
      hasIssue(result, "repository_error") &&
      result.downstream.itemsStarted === 0,
    JSON.stringify(result),
  );
}

async function scenarioSourceSnapshotUnmodified(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);

  return expectScenario(
    "source snapshot remains unmodified",
    JSON.stringify(source) === before,
    "source snapshot unchanged",
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionClaimTestRepository({
    snapshot: snapshot(),
  });
  const result = await service(repository).assessClaim(command());

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.sessionsClaimed === 0 &&
      result.downstream.sessionsStarted === 0 &&
      result.downstream.itemsClaimed === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.itemsFailed === 0 &&
      result.downstream.itemsRolledBack === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.deploymentRunsFinalized === 0 &&
      repository.downstreamWriteCount === 0,
    JSON.stringify(result.downstream),
  );
}

function runningOneItemCompleteness(
  input: Parameters<typeof buildClaimSnapshot>[0]["itemCompleteness"] = {},
): NonNullable<Parameters<typeof buildClaimSnapshot>[0]["itemCompleteness"]> {
  return {
    invalidPreparedItemCount: 1,
    runningOrTerminalItemCount: 1,
    runningItemCount: 1,
    terminalItemCount: 0,
    runningItemsWithAttemptOne: 1,
    runningItemsWithValidStartedAt: 1,
    runningItemsWithCompletionEvidence: 0,
    pendingItemsWithAttempts: 0,
    pendingItemsWithExecutionTimestamps: 0,
    pendingItemsWithRollbackTimestamps: 0,
    pendingItemsWithErrors: 0,
    itemsWithAttempts: 1,
    itemsWithExecutionTimestamps: 1,
    itemsWithRollbackTimestamps: 0,
    itemsWithErrors: 0,
    readyItemCount: 0,
    pendingItemCount: 2,
    blockedItemCount: 0,
    firstExecutableStatus: "running",
    readyRootItemCount: 0,
    pendingExecutableWithoutSatisfiedDependencies: 0,
    dependencyIntegrityIssueCount: 0,
    ...input,
  };
}

async function expectRunningOneItemIssue(
  name: string,
  itemCompleteness: Parameters<typeof buildClaimSnapshot>[0]["itemCompleteness"],
  expectedCode: DeploymentActivationExecutionClaimIssueCode,
): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(
    runningOwnedSnapshot(CLAIMANT_ID, ACTIVE_LEASE, runningOneItemCompleteness(itemCompleteness)),
  );

  return expectScenario(
    name,
    result.status === "blocked" && hasIssue(result, expectedCode),
    JSON.stringify(result),
  );
}
async function expectIssue(
  name: string,
  claimSnapshot: DeploymentActivationExecutionClaimSnapshot,
  expectedCode: DeploymentActivationExecutionClaimIssueCode,
  expectedStatus: DeploymentActivationExecutionClaimResult["status"],
): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(claimSnapshot);

  return expectScenario(
    name,
    result.status === expectedStatus && hasIssue(result, expectedCode),
    JSON.stringify(result),
  );
}

async function expectCommandIssue(
  name: string,
  commandPatch: Partial<DeploymentActivationExecutionClaimCommand>,
  expectedCode: DeploymentActivationExecutionClaimIssueCode,
): Promise<DeploymentActivationExecutionClaimServiceHarnessScenario> {
  const result = await assess(undefined, commandPatch);

  return expectScenario(
    name,
    result.status === "blocked" && hasIssue(result, expectedCode),
    JSON.stringify(result),
  );
}

async function assess(
  claimSnapshot: DeploymentActivationExecutionClaimSnapshot = snapshot(),
  commandPatch: Partial<DeploymentActivationExecutionClaimCommand> = {},
): Promise<DeploymentActivationExecutionClaimResult> {
  return service(
    new InMemoryDeploymentActivationExecutionClaimTestRepository({
      snapshot: claimSnapshot,
    }),
  ).assessClaim(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentActivationExecutionClaimTestRepository,
): DeploymentActivationExecutionClaimService {
  return new DeploymentActivationExecutionClaimService(repository, {
    tokenFactory: ({ sessionId, claimantId, claimRequestedAt }) =>
      `token-${sessionId}-${claimantId}-${claimRequestedAt.replace(/[^0-9A-Za-z]+/g, "")}`,
  });
}

function command(
  input: Partial<DeploymentActivationExecutionClaimCommand> = {},
): DeploymentActivationExecutionClaimCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    planKey: PLAN_KEY,
    claimantId: CLAIMANT_ID,
    leaseDurationSeconds: 300,
    claimRequestedAt: CLAIMED_AT,
    expectedItemCount: 3,
    expectedExecutionStatus: "prepared",
    ...input,
  };
}

function snapshot(
  input: Parameters<typeof buildClaimSnapshot>[0] = {},
): DeploymentActivationExecutionClaimSnapshot {
  return buildClaimSnapshot(input);
}

function ownedSnapshot(
  owner: string,
  leaseExpiresAt: string,
  itemCompleteness: Parameters<typeof buildClaimSnapshot>[0]["itemCompleteness"] = {},
): DeploymentActivationExecutionClaimSnapshot {
  return snapshot({
    session: {
      executionStatus: "claimed",
      executionOwner: owner,
      ownershipToken: "existing-token",
      leaseExpiresAt,
    },
    itemCompleteness,
  });
}

function runningOwnedSnapshot(
  owner: string,
  leaseExpiresAt: string,
  itemCompleteness: Parameters<typeof buildClaimSnapshot>[0]["itemCompleteness"] = {},
  sessionPatch: NonNullable<Parameters<typeof buildClaimSnapshot>[0]["session"]> = {},
): DeploymentActivationExecutionClaimSnapshot {
  return snapshot({
    session: {
      executionStatus: "running",
      executionOwner: owner,
      ownershipToken: "existing-token",
      leaseExpiresAt,
      startedAt: CLAIMED_AT,
      ...sessionPatch,
    },
    itemCompleteness,
  });
}
function hasIssue(
  result: DeploymentActivationExecutionClaimResult,
  code: DeploymentActivationExecutionClaimIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionClaimServiceHarnessScenario {
  return { name, passed, message };
}
