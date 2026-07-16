import {
  progressActivationExecutionDependencyWithRepository,
  type DeploymentActivationExecutionAtomicDependencyProgressionRepository,
} from "./deployment-activation-execution-dependency-progression-server";
import {
  buildAlreadyProgressedDependencyProgressionSnapshot,
  buildDependencyProgressionSnapshot,
  planItemKey,
} from "./deployment-activation-execution-dependency-progression-test-repository";
import {
  cloneDependencyProgressionSnapshot,
  type DeploymentActivationExecutionAtomicDependencyProgressionCommand,
  type DeploymentActivationExecutionAtomicDependencyProgressionResult,
  type DeploymentActivationExecutionDependencyProgressionSnapshot,
} from "./deployment-activation-execution-dependency-progression-types";
import { DeploymentActivationExecutionDependencyProgressionRepositoryError } from "./deployment-activation-execution-dependency-progression-supabase-repository";
import type {
  ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionItemCompletionResult,
} from "./deployment-activation-execution-item-completion-server";
import type {
  ServerDeploymentProviderShellExecutionItemCompletionResult,
} from "./deployment-provider-shell-execution-item-completion-server";

export interface DeploymentActivationExecutionDependencyProgressionServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionDependencyProgressionServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionDependencyProgressionServerHarnessScenario[];
}

const CLINIC_ID = "clinic-dependency-progression-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-dependency-progression-0001";
const SESSION_ID = "activation-execution-session-dependency-progression-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-dependency-progression-0001";
const CLAIMANT_ID = "executor-dependency-progression-001";
const OWNERSHIP_TOKEN = "sensitive-dependency-progression-token";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const NOW = "2026-01-01T12:03:00.000Z";
const COMPLETED_STARTED_AT = "2026-01-01T12:00:00.000Z";
const COMPLETED_COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const COMPLETED_ITEM_ID = "activation-execution-item-dependency-001";
const NEXT_ITEM_ID = "activation-execution-item-dependency-002";
const COMPLETED_PLAN_ITEM_KEY = planItemKey(1);
const NEXT_PLAN_ITEM_KEY = planItemKey(2);
const COMPLETED_EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:${COMPLETED_PLAN_ITEM_KEY}`;
const NEXT_EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:${NEXT_PLAN_ITEM_KEY}`;

export async function runDeploymentActivationExecutionDependencyProgressionServerHarness(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessResult> {
  const scenarios = [
    await scenarioProgressed(),
    await scenarioAlreadyCompletedPredecessorProgresses(),
    await scenarioProviderCompletionProgresses(),
    await scenarioAlreadyCompletedProviderCompletionProgresses(),
    await scenarioAlreadyProgressedReuseSkipsRpc(),
    await scenarioSkippedWhenCompletionMissing(),
    await scenarioSkippedWhenCompletionBlocked(),
    await scenarioSkippedWhenCompletionConflict(),
    await scenarioSkippedWhenCompletionError(),
    await scenarioOwnershipTokenMissing(),
    await scenarioAssessmentBlocked(),
    await scenarioAssessmentConflict(),
    await scenarioAssessmentNotFound(),
    await scenarioAssessmentError(),
    await scenarioAtomicAlreadyProgressed(),
    await scenarioAtomicBlocked(),
    await scenarioAtomicConflict(),
    await scenarioAtomicNotFound(),
    await scenarioAtomicError(),
    await scenarioSnapshotSessionDiagnostics(),
    await scenarioSnapshotItemDiagnostics(),
    await scenarioSupabaseDiagnostics(),
    await scenarioResponseMappingDiagnostics(),
    await scenarioDiagnosticSerialization(),
    await scenarioExpiredLease(),
    await scenarioMalformedLease(),
    await scenarioOwnerMismatch(),
    await scenarioTokenMismatchRedacted(),
    await scenarioDependencyFailure(),
    await scenarioDuplicateIdentity(),
    await scenarioNextItemReadyEvidence(),
    await scenarioNoNextItemStartEvidence(),
    await scenarioNoAttemptIncrement(),
    await scenarioNoTimestampWrite(),
    await scenarioNoEntityActivation(),
    await scenarioNoSessionMutation(),
    await scenarioNoFallbackMutationMethods(),
    await scenarioNoAutomaticRetry(),
    await scenarioDeterministicIssueMapping(),
    await scenarioSourceImmutability(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioProgressed(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await progress(repository);

  return expectScenario(
    "completed predecessor progresses next item",
    result.ok &&
      result.status === "progressed" &&
      result.progressedCount === 1 &&
      result.reusedCount === 0 &&
      result.statusBefore === "pending" &&
      result.statusAfter === "ready" &&
      repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAlreadyCompletedPredecessorProgresses(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await progress(repository, { completion: completion({ status: "already_completed", reusedCount: 1, completedCount: 0 }) });

  return expectScenario(
    "already completed predecessor progresses",
    result.ok && result.status === "progressed" && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioProviderCompletionProgresses(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: providerProgressionSnapshot(), atomicResult: providerAtomicResult() });
  const result = await progress(repository, { completion: providerCompletion() });

  return expectScenario(
    "provider completion progresses next item",
    result.ok &&
      result.status === "progressed" &&
      result.progressedCount === 1 &&
      result.completedSequence === 2 &&
      repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAlreadyCompletedProviderCompletionProgresses(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: providerProgressionSnapshot(), atomicResult: providerAtomicResult() });
  const result = await progress(repository, { completion: providerCompletion({ status: "already_completed", completionResult: "already_completed", completedCount: 0, reusedCount: 1 }) });

  return expectScenario(
    "already completed provider predecessor progresses",
    result.ok && result.status === "progressed" && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}
async function scenarioAlreadyProgressedReuseSkipsRpc(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: buildAlreadyProgressedDependencyProgressionSnapshot() });
  const result = await progress(repository);

  return expectScenario(
    "already progressed reuse skips rpc",
    result.ok &&
      result.status === "already_progressed" &&
      result.reusedCount === 1 &&
      result.statusBefore === "ready" &&
      result.statusAfter === "ready" &&
      repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioSkippedWhenCompletionMissing(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectSkipped("missing item completion", null);
}

async function scenarioSkippedWhenCompletionBlocked(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectSkipped("blocked item completion", completion({ ok: false, status: "blocked", completionResult: "blocked" }));
}

async function scenarioSkippedWhenCompletionConflict(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectSkipped("conflicted item completion", completion({ ok: false, status: "conflict", completionResult: "conflict" }));
}

async function scenarioSkippedWhenCompletionError(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectSkipped("errored item completion", completion({ ok: false, status: "error", completionResult: "error" }));
}

async function expectSkipped(
  name: string,
  completionResult: ServerDeploymentActivationExecutionItemCompletionResult | null,
): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await progress(repository, { completion: completionResult });

  return expectScenario(
    name,
    !result.ok && result.status === "not_attempted" && repository.loadCalls === 0 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioOwnershipTokenMissing(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await progress(repository, { token: null });

  return expectScenario(
    "ownership token missing",
    !result.ok && result.status === "error" && repository.loadCalls === 0 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAssessmentBlocked(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAssessmentIssue("assessment blocked", snapshot({ itemPatches: { 2: { attemptCount: 1 } } }), "blocked", "next_item_attempt_evidence_present");
}

async function scenarioAssessmentConflict(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAssessmentIssue("assessment conflict", snapshot({ session: { executionOwner: "other-executor" } }), "conflict", "session_owned_by_another_executor");
}

async function scenarioAssessmentNotFound(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAssessmentIssue("assessment not found", snapshot({ session: null }), "not_found", "missing_session");
}

async function scenarioAssessmentError(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({ throwOnLoad: true });
  const result = await progress(repository);

  return expectScenario(
    "assessment repository error",
    !result.ok && result.status === "error" && result.blockers === 1 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAtomicAlreadyProgressed(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAtomicStatus("already_progressed", true, "already_progressed", null);
}

async function scenarioAtomicBlocked(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAtomicStatus("blocked", false, "blocked", "stale_state");
}

async function scenarioAtomicConflict(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAtomicStatus("conflict", false, "conflict", "ownership_token_mismatch");
}

async function scenarioAtomicNotFound(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAtomicStatus("not_found", false, "not_found", "next_item_missing");
}

async function scenarioAtomicError(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({ throwOnAtomic: true });
  const result = await progress(repository);

  return expectScenario(
    "atomic repository error",
    !result.ok &&
      result.status === "error" &&
      result.blockers === 1 &&
      result.completedExecutionItemKey === COMPLETED_EXECUTION_ITEM_KEY &&
      result.completedSequence === 1 &&
      result.issues.some((issue) => issue.diagnostics?.exceptionType === "Error") &&
      repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function expectAtomicStatus(
  atomicStatus: DeploymentActivationExecutionAtomicDependencyProgressionResult["status"],
  expectedOk: boolean,
  expectedStatus: string,
  issueCode: DeploymentActivationExecutionAtomicDependencyProgressionResult["issueCode"],
): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({ atomicResult: atomicResult({ ok: expectedOk, status: atomicStatus, issueCode }) });
  const result = await progress(repository);

  return expectScenario(
    `atomic ${atomicStatus}`,
    result.ok === expectedOk && result.status === expectedStatus && result.issueCode === issueCode && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioSnapshotSessionDiagnostics(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({
    throwOnLoad: true,
    loadError: new DeploymentActivationExecutionDependencyProgressionRepositoryError({
      layer: "snapshot_session_lookup",
      code: "PGRST100",
      message: "session lookup failed",
      details: "deployment_activation_execution_sessions lookup failed",
      hint: "Check session visibility.",
    }),
  });
  const result = await progress(repository);
  const diagnostic = result.issues.find((issue) => issue.code === "repository_error")?.diagnostics;

  return expectScenario(
    "snapshot session diagnostics",
    !result.ok &&
      result.status === "error" &&
      diagnostic?.layer === "snapshot_session_lookup" &&
      diagnostic.rpcAttempted === false &&
      diagnostic.errorCode === "PGRST100" &&
      diagnostic.errorMessage === "session lookup failed",
    JSON.stringify(redact(result)),
  );
}

async function scenarioSnapshotItemDiagnostics(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({
    throwOnLoad: true,
    loadError: new DeploymentActivationExecutionDependencyProgressionRepositoryError({
      layer: "snapshot_item_listing",
      code: "PGRST101",
      message: "item listing failed",
      details: "deployment_activation_execution_items lookup failed",
      hint: "Check item visibility.",
    }),
  });
  const result = await progress(repository);
  const diagnostic = result.issues.find((issue) => issue.code === "repository_error")?.diagnostics;

  return expectScenario(
    "snapshot item diagnostics",
    !result.ok &&
      result.status === "error" &&
      diagnostic?.layer === "snapshot_item_listing" &&
      diagnostic.rpcAttempted === false &&
      diagnostic.errorCode === "PGRST101" &&
      diagnostic.errorDetails === "deployment_activation_execution_items lookup failed",
    JSON.stringify(redact(result)),
  );
}
async function scenarioSupabaseDiagnostics(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({
    throwOnAtomic: true,
    atomicError: new DeploymentActivationExecutionDependencyProgressionRepositoryError({
      layer: "atomic_rpc",
      code: "42702",
      message: "column reference \"session_id\" is ambiguous",
      details: "PL/pgSQL function progress_deployment_activation_execution_dependency line 1 at SQL statement",
      hint: "Qualify the column reference.",
    }),
  });
  const result = await progress(repository);
  const diagnostic = result.issues.find((issue) => issue.code === "repository_error")?.diagnostics;

  return expectScenario(
    "safe supabase diagnostics",
    !result.ok &&
      result.status === "error" &&
      result.completedExecutionItemKey === COMPLETED_EXECUTION_ITEM_KEY &&
      diagnostic?.layer === "atomic_rpc" &&
      diagnostic.rpcAttempted === true &&
      diagnostic.errorCode === "42702" &&
      diagnostic.errorMessage === "column reference \"session_id\" is ambiguous" &&
      diagnostic.errorDetails?.includes("PL/pgSQL") === true &&
      diagnostic.errorHint === "Qualify the column reference." &&
      !JSON.stringify(result).includes(OWNERSHIP_TOKEN),
    JSON.stringify(redact(result)),
  );
}
async function scenarioResponseMappingDiagnostics(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({
    throwOnAtomic: true,
    atomicError: new DeploymentActivationExecutionDependencyProgressionRepositoryError({
      layer: "atomic_rpc_response_mapping",
      message: "Malformed activation execution dependency-progression RPC response.",
    }),
  });
  const result = await progress(repository);
  const diagnostic = result.issues.find((issue) => issue.code === "repository_error")?.diagnostics;

  return expectScenario(
    "response mapping diagnostics",
    !result.ok &&
      result.status === "error" &&
      diagnostic?.layer === "atomic_rpc_response_mapping" &&
      diagnostic.rpcAttempted === true &&
      diagnostic.errorMessage === "Malformed activation execution dependency-progression RPC response.",
    JSON.stringify(redact(result)),
  );
}

async function scenarioDiagnosticSerialization(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({
    throwOnAtomic: true,
    atomicError: new DeploymentActivationExecutionDependencyProgressionRepositoryError({
      layer: "atomic_rpc",
      code: "42702",
      message: `token ${OWNERSHIP_TOKEN} redacted`,
      details: "RPC failed before mutation.",
      hint: "Review function body.",
    }),
  });
  const result = await progress(repository);
  const serialized = JSON.stringify(result);
  const parsed = JSON.parse(serialized) as Awaited<ReturnType<typeof progress>>;
  const diagnostic = parsed.issues.find((issue) => issue.code === "repository_error")?.diagnostics;

  return expectScenario(
    "diagnostics survive action-result serialization",
    diagnostic?.layer === "atomic_rpc" &&
      diagnostic.rpcAttempted === true &&
      diagnostic.errorCode === "42702" &&
      diagnostic.errorMessage === "token [redacted] redacted" &&
      diagnostic.errorDetails === "RPC failed before mutation." &&
      diagnostic.errorHint === "Review function body." &&
      !serialized.includes(OWNERSHIP_TOKEN),
    serialized,
  );
}
async function scenarioExpiredLease(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAssessmentIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "blocked", "lease_expired");
}

async function scenarioMalformedLease(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAssessmentIssue("malformed lease", snapshot({ session: { leaseExpiresAt: "not-a-date" } }), "blocked", "lease_timestamp_malformed");
}

async function scenarioOwnerMismatch(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAssessmentIssue("owner mismatch", snapshot({ session: { executionOwner: "other-executor" } }), "conflict", "session_owned_by_another_executor");
}

async function scenarioTokenMismatchRedacted(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await progress(repository, { token: "wrong-token" });

  return expectScenario(
    "token mismatch redacted",
    result.status === "conflict" &&
      result.issues.some((issue) => issue.code === "ownership_token_mismatch") &&
      repository.atomicCalls.length === 0 &&
      !JSON.stringify(result).includes("wrong-token"),
    JSON.stringify(redact(result)),
  );
}

async function scenarioDependencyFailure(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAssessmentIssue("dependency failure", snapshot({ itemPatches: { 2: { dependencyKeys: ["missing-dependency"] } } }), "blocked", "dependency_item_missing");
}

async function scenarioDuplicateIdentity(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  return expectAssessmentIssue("duplicate identity", snapshot({ aggregate: { duplicateExecutionItemKeyCount: 1 } }), "blocked", "duplicate_item_identity");
}

async function expectAssessmentIssue(
  name: string,
  progressionSnapshot: DeploymentActivationExecutionDependencyProgressionSnapshot,
  expectedStatus: string,
  expectedCode: string,
): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: progressionSnapshot });
  const result = await progress(repository);

  return expectScenario(
    name,
    result.status === expectedStatus &&
      result.issues.some((issue) => issue.code === expectedCode) &&
      repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioNextItemReadyEvidence(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const result = await progress(repositoryHarness());

  return expectScenario(
    "next item ready evidence",
    result.nextSequence === 2 && result.nextExecutionItemKey === NEXT_EXECUTION_ITEM_KEY && result.statusAfter === "ready",
    JSON.stringify(redact(result)),
  );
}

async function scenarioNoNextItemStartEvidence(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness();
  await progress(repository);
  const command = repository.atomicCalls[0];

  return expectScenario(
    "no next item start evidence",
    command?.expectedNextStatus === "pending" && command.expectedNextAttemptCount === 0 && command.progressedAt === NOW,
    JSON.stringify(redact(command)),
  );
}

async function scenarioNoAttemptIncrement(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const result = await progress(repositoryHarness());

  return expectScenario(
    "no attempt increment",
    result.nextAttemptCount === 0 && result.completedAttemptCount === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioNoTimestampWrite(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness();
  await progress(repository);
  const command = repository.atomicCalls[0];

  return expectScenario(
    "no item timestamp write",
    command?.progressedAt === NOW && !Object.prototype.hasOwnProperty.call(command, "startedAt") && !Object.prototype.hasOwnProperty.call(command, "completedAt"),
    JSON.stringify(redact(command)),
  );
}

async function scenarioNoEntityActivation(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const result = await progress(repositoryHarness());

  return expectScenario(
    "no entity activation",
    result.downstream.entitiesActivated === 0 && result.nextEntityType === "provider_shell" && result.nextAction === "activate",
    JSON.stringify(result.downstream),
  );
}

async function scenarioNoSessionMutation(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness();
  await progress(repository);
  const command = repository.atomicCalls[0];

  return expectScenario(
    "no session mutation command",
    command?.expectedLeaseExpiresAt === ACTIVE_LEASE && !Object.prototype.hasOwnProperty.call(command, "sessionStatusAfter"),
    JSON.stringify(redact(command)),
  );
}

async function scenarioNoFallbackMutationMethods(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness();
  await progress(repository);
  const prototype = Object.getPrototypeOf(repository) as Record<string, unknown>;
  const forbidden = ["update", "insert", "upsert", "delete", "startItem", "activateEntity", "completeSession", "finalizeDeployment", "renewLease", "rotateToken"];

  return expectScenario(
    "no fallback mutation methods",
    repository.genericMutationCalls === 0 && forbidden.every((method) => !(method in prototype)),
    JSON.stringify({ forbidden: forbidden.filter((method) => method in prototype), calls: repository.atomicCalls.length }),
  );
}

async function scenarioNoAutomaticRetry(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const repository = repositoryHarness({ atomicResult: atomicResult({ ok: false, status: "blocked", issueCode: "stale_state" }) });
  await progress(repository);

  return expectScenario("no automatic retry", repository.atomicCalls.length === 1, JSON.stringify(repository.atomicCalls.map(redact)));
}

async function scenarioDeterministicIssueMapping(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const result = await progress(repositoryHarness({
    snapshot: snapshot({
      aggregate: { duplicateSequenceCount: 1, malformedDependencyCount: 1 },
      itemPatches: { 2: { errorCode: "next_error", dependencyKeys: [COMPLETED_PLAN_ITEM_KEY, COMPLETED_PLAN_ITEM_KEY] } },
    }),
  }));
  const codes = result.issues.map((issue) => issue.code).join(",");

  return expectScenario(
    "deterministic issue mapping",
    codes === "duplicate_item_identity,next_item_error_present,dependency_keys_malformed,duplicate_dependency_key",
    codes,
  );
}

async function scenarioSourceImmutability(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await progress(repositoryHarness({ snapshot: source }));

  return expectScenario("source immutability", JSON.stringify(source) === before, "source unchanged");
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionDependencyProgressionServerHarnessScenario> {
  const result = await progress(repositoryHarness());

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.itemsReadied === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.sessionsCompleted === 0 &&
      result.downstream.deploymentsFinalized === 0 &&
      result.downstream.rollbacksExecuted === 0,
    JSON.stringify(result.downstream),
  );
}

interface ProgressInput {
  claim: ServerDeploymentActivationExecutionClaimResult | null;
  completion: ServerDeploymentActivationExecutionItemCompletionResult | ServerDeploymentProviderShellExecutionItemCompletionResult | null;
  token: string | null;
}

async function progress(
  repository: MockDependencyProgressionRepository,
  input: Partial<ProgressInput> = {},
) {
  return progressActivationExecutionDependencyWithRepository(
    repository,
    {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      deploymentActivationExecutionClaim: input.claim === undefined ? claim() : input.claim,
      deploymentActivationExecutionItemCompletion: input.completion === undefined ? completion() : input.completion,
      dependencyProgressionRequestedAt: NOW,
    },
    {
      claimantId: CLAIMANT_ID,
      ownershipTokenResolver: () => input.token === undefined ? OWNERSHIP_TOKEN : input.token,
    },
  );
}

function repositoryHarness(input: {
  snapshot?: DeploymentActivationExecutionDependencyProgressionSnapshot;
  atomicResult?: DeploymentActivationExecutionAtomicDependencyProgressionResult;
  throwOnLoad?: boolean;
  throwOnAtomic?: boolean;
  atomicError?: unknown;
  loadError?: unknown;
} = {}): MockDependencyProgressionRepository {
  return new MockDependencyProgressionRepository(input);
}

class MockDependencyProgressionRepository implements DeploymentActivationExecutionAtomicDependencyProgressionRepository {
  loadCalls = 0;
  atomicCalls: DeploymentActivationExecutionAtomicDependencyProgressionCommand[] = [];
  genericMutationCalls = 0;
  private readonly snapshotValue: DeploymentActivationExecutionDependencyProgressionSnapshot;
  private readonly atomicResultValue: DeploymentActivationExecutionAtomicDependencyProgressionResult;
  private readonly throwOnLoad: boolean;
  private readonly throwOnAtomic: boolean;
  private readonly atomicError: unknown;
  private readonly loadError: unknown;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionDependencyProgressionSnapshot;
    atomicResult?: DeploymentActivationExecutionAtomicDependencyProgressionResult;
    throwOnLoad?: boolean;
    throwOnAtomic?: boolean;
    atomicError?: unknown;
    loadError?: unknown;
  } = {}) {
    this.snapshotValue = cloneDependencyProgressionSnapshot(input.snapshot ?? snapshot());
    this.atomicResultValue = input.atomicResult ?? atomicResult();
    this.throwOnLoad = input.throwOnLoad ?? false;
    this.throwOnAtomic = input.throwOnAtomic ?? false;
    this.atomicError = input.atomicError;
    this.loadError = input.loadError;
  }
  async loadDependencyProgressionSnapshot(): Promise<DeploymentActivationExecutionDependencyProgressionSnapshot> {
    this.loadCalls += 1;

    if (this.throwOnLoad) {
      throw this.loadError ?? new Error("dependency progression snapshot load failed");
    }

    return cloneDependencyProgressionSnapshot(this.snapshotValue);
  }

  async progressDependencyAtomically(
    command: DeploymentActivationExecutionAtomicDependencyProgressionCommand,
  ): Promise<DeploymentActivationExecutionAtomicDependencyProgressionResult> {
    this.atomicCalls.push({ ...command, expectedDependencyKeys: [...command.expectedDependencyKeys] });

    if (this.throwOnAtomic) {
      throw this.atomicError ?? new Error("atomic dependency progression failed");
    }

    return { ...this.atomicResultValue };
  }
}

function snapshot(
  input: Parameters<typeof buildDependencyProgressionSnapshot>[0] = {},
): DeploymentActivationExecutionDependencyProgressionSnapshot {
  return buildDependencyProgressionSnapshot({
    session: input.session === null
      ? null
      : {
          clinicId: CLINIC_ID,
          deploymentRunKey: DEPLOYMENT_RUN_ID,
          sessionId: SESSION_ID,
          executionKey: EXECUTION_KEY,
          executionOwner: CLAIMANT_ID,
          ownershipToken: OWNERSHIP_TOKEN,
          leaseExpiresAt: ACTIVE_LEASE,
          ...input.session,
        },
    items: input.items,
    itemPatches: input.itemPatches,
    aggregate: input.aggregate,
  });
}

function claim(input: Partial<ServerDeploymentActivationExecutionClaimResult> = {}): ServerDeploymentActivationExecutionClaimResult {
  return {
    ok: true,
    status: "claimed",
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    planKey: "activation-plan-dependency-progression-0001",
    claimantId: CLAIMANT_ID,
    persistedOwnerId: CLAIMANT_ID,
    leaseExpiresAt: ACTIVE_LEASE,
    claimMode: "fresh",
    ownershipResult: "claimed",
    sessionClaimed: 1,
    sessionReused: 0,
    sessionReclaimed: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      sessionsClaimed: 0,
      sessionsStarted: 0,
      itemsClaimed: 0,
      itemsStarted: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      itemsRolledBack: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      deploymentRunsFinalized: 0,
    },
    message: "Execution session was claimed.",
    ...input,
  };
}

function completion(input: Partial<ServerDeploymentActivationExecutionItemCompletionResult> = {}): ServerDeploymentActivationExecutionItemCompletionResult {
  return {
    ok: true,
    status: "completed",
    claimantId: CLAIMANT_ID,
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    itemId: COMPLETED_ITEM_ID,
    executionItemKey: COMPLETED_EXECUTION_ITEM_KEY,
    planItemKey: COMPLETED_PLAN_ITEM_KEY,
    sequence: 1,
    entityType: "clinic",
    action: "activate",
    startedAt: COMPLETED_STARTED_AT,
    completedAt: COMPLETED_COMPLETED_AT,
    attemptCount: 1,
    executionStatusBefore: "running",
    executionStatusAfter: "succeeded",
    completionResult: "completed",
    issueCode: null,
    completedCount: 1,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      itemsCompleted: 0,
      dependenciesUnlocked: 0,
      providersActivated: 0,
      sterilizersActivated: 0,
      workstationsActivated: 0,
      hardwareActivated: 0,
      bindingsWritten: 0,
      deploymentFinalized: 0,
      rollbacksExecuted: 0,
    },
    message: "Activation execution item was completed.",
    ...input,
  };
}

function providerProgressionSnapshot(): DeploymentActivationExecutionDependencyProgressionSnapshot {
  return snapshot({
    itemPatches: {
      2: {
        executionStatus: "succeeded",
        attemptCount: 1,
        startedAt: COMPLETED_STARTED_AT,
        completedAt: COMPLETED_COMPLETED_AT,
      },
    },
  });
}

function providerAtomicResult(input: Partial<DeploymentActivationExecutionAtomicDependencyProgressionResult> = {}): DeploymentActivationExecutionAtomicDependencyProgressionResult {
  const nextPlanItemKey = planItemKey(3);
  return atomicResult({
    completedItemId: "activation-execution-item-dependency-002",
    completedExecutionItemKey: NEXT_EXECUTION_ITEM_KEY,
    completedPlanItemKey: NEXT_PLAN_ITEM_KEY,
    completedSequence: 2,
    nextItemId: "activation-execution-item-dependency-003",
    nextExecutionItemKey: `${EXECUTION_KEY}:${nextPlanItemKey}`,
    nextPlanItemKey,
    nextSequence: 3,
    nextEntityType: "provider_shell",
    nextEntityId: "provider-002",
    nextAction: "activate",
    ...input,
  });
}
function providerCompletion(input: Partial<ServerDeploymentProviderShellExecutionItemCompletionResult> = {}): ServerDeploymentProviderShellExecutionItemCompletionResult {
  return {
    ok: true,
    status: "completed",
    message: "Provider-shell activation execution item was completed.",
    claimantId: CLAIMANT_ID,
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    itemId: "activation-execution-item-dependency-002",
    executionItemKey: NEXT_EXECUTION_ITEM_KEY,
    planItemKey: NEXT_PLAN_ITEM_KEY,
    sequence: 2,
    entityType: "provider_shell",
    entityId: "provider-001",
    deploymentProviderKey: "dentist-001",
    action: "activate",
    itemStatusBefore: "running",
    itemStatusAfter: "succeeded",
    attemptCount: 1,
    startedAt: COMPLETED_STARTED_AT,
    completedAt: COMPLETED_COMPLETED_AT,
    providerId: "provider-001",
    providerStatus: "active",
    providerActive: true,
    completionResult: "completed",
    issueCode: null,
    completedCount: 1,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    diagnostics: null,
    downstream: {
      itemsCompleted: 0,
      dependenciesProgressed: 0,
      nextItemsStarted: 0,
      providersActivated: 0,
      sterilizersActivated: 0,
      workstationsActivated: 0,
      hardwareActivated: 0,
      bindingsWritten: 0,
      sessionsCompleted: 0,
      rollbacksExecuted: 0,
      deploymentFinalized: 0,
    },
    ...input,
  };
}
function atomicResult(input: Partial<DeploymentActivationExecutionAtomicDependencyProgressionResult> = {}): DeploymentActivationExecutionAtomicDependencyProgressionResult {
  return {
    ok: true,
    status: "progressed",
    clinicId: CLINIC_ID,
    deploymentRunKey: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    completedItemId: COMPLETED_ITEM_ID,
    completedExecutionItemKey: COMPLETED_EXECUTION_ITEM_KEY,
    completedPlanItemKey: COMPLETED_PLAN_ITEM_KEY,
    completedSequence: 1,
    completedStartedAt: COMPLETED_STARTED_AT,
    completedCompletedAt: COMPLETED_COMPLETED_AT,
    completedAttemptCount: 1,
    nextItemId: NEXT_ITEM_ID,
    nextExecutionItemKey: NEXT_EXECUTION_ITEM_KEY,
    nextPlanItemKey: NEXT_PLAN_ITEM_KEY,
    nextSequence: 2,
    nextEntityType: "provider_shell",
    nextEntityId: "provider-001",
    nextAction: "activate",
    nextStatusBefore: "pending",
    nextStatusAfter: "ready",
    issueCode: null,
    message: "Dependency progression readied the next item.",
    ...input,
  };
}

function redact(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, entry) => {
      if (key === "ownershipToken") {
        return "[redacted]";
      }

      return entry;
    }),
  );
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionDependencyProgressionServerHarnessScenario {
  return { name, passed, message };
}
