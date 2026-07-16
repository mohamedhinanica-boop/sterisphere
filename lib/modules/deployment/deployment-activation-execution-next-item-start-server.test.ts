import {
  startNextActivationExecutionItemWithRepository,
  type DeploymentActivationExecutionAtomicNextItemStartRepository,
} from "./deployment-activation-execution-next-item-start-server";
import {
  buildAlreadyStartedNextItemStartSnapshot,
  buildNextItemStartSnapshot,
  item,
  NEXT_ITEM_START_TEST_IDS,
  planItemKey,
} from "./deployment-activation-execution-next-item-start-test-repository";
import {
  cloneNextItemStartSnapshot,
  type DeploymentActivationExecutionAtomicNextItemStartCommand,
  type DeploymentActivationExecutionAtomicNextItemStartResult,
  type DeploymentActivationExecutionNextItemStartSnapshot,
} from "./deployment-activation-execution-next-item-start-types";
import { DeploymentActivationExecutionNextItemStartRepositoryError } from "./deployment-activation-execution-next-item-start-supabase-repository";
import type {
  ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionDependencyProgressionResult,
} from "./deployment-activation-execution-dependency-progression-server";

export interface DeploymentActivationExecutionNextItemStartServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionNextItemStartServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionNextItemStartServerHarnessScenario[];
}

const NOW = "2026-01-01T12:05:00.000Z";
const STARTED_AT = NOW;
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const WRONG_TOKEN = "wrong-sensitive-next-item-start-token";
const ITEM_ID = "activation-execution-item-next-start-002";
const EXECUTION_ITEM_KEY = `${NEXT_ITEM_START_TEST_IDS.executionKey}:${planItemKey(2)}`;
const PLAN_ITEM_KEY = planItemKey(2);

export async function runDeploymentActivationExecutionNextItemStartServerHarness(): Promise<DeploymentActivationExecutionNextItemStartServerHarnessResult> {
  const scenarios = [
    await scenarioProgressedStartableStarted(),
    await scenarioAlreadyProgressedStartableStarted(),
    await scenarioPostProviderProgressionStartsNextProviderItem(),
    await scenarioPostProviderAlreadyStartedReuseSkipsRpc(),
    await scenarioPostProviderOrderingPreserved(),
    await scenarioAlreadyRunningReuseSkipsRpc(),
    await expectNotAttempted("dependency not attempted", dependency({ ok: false, status: "not_attempted" })),
    await expectNotAttempted("dependency blocked", dependency({ ok: false, status: "blocked" })),
    await expectNotAttempted("dependency conflict", dependency({ ok: false, status: "conflict" })),
    await expectNotAttempted("dependency error", dependency({ ok: false, status: "error" })),
    await expectAssessmentIssue("assessment blocked", snapshot({ itemPatches: { 2: { attemptCount: 1 } } }), "blocked", "candidate_attempt_invalid"),
    await expectAssessmentIssue("assessment conflict", snapshot({ session: { executionOwner: "other-executor" } }), "conflict", "session_owned_by_another_executor"),
    await expectAssessmentIssue("assessment not found", snapshot({ session: null }), "not_found", "missing_session"),
    await scenarioAssessmentError(),
    await expectAtomicStatus("started", true, "started", null),
    await expectAtomicStatus("already_started", true, "already_started", null),
    await expectAtomicStatus("blocked", false, "blocked", "stale_state"),
    await expectAtomicStatus("conflict", false, "conflict", "ownership_token_mismatch"),
    await expectAtomicStatus("not_found", false, "not_found", "item_not_found"),
    await scenarioAtomicError(),
    await expectAssessmentIssue("expired lease blocks", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "blocked", "lease_expired"),
    await expectAssessmentIssue("malformed lease blocks", snapshot({ session: { leaseExpiresAt: "not-a-date" } }), "blocked", "lease_timestamp_malformed"),
    await expectAssessmentIssue("owner mismatch blocks", snapshot({ session: { executionOwner: "other-executor" } }), "conflict", "session_owned_by_another_executor"),
    await scenarioTokenMismatchRedacted(),
    await expectAssessmentIssue("multiple ready item ambiguity blocks", snapshot({ itemPatches: { 3: { executionStatus: "ready" } } }), "blocked", "multiple_ready_items"),
    await expectAssessmentIssue("ready plus running ambiguity blocks", snapshot({ itemPatches: { 3: { executionStatus: "running", attemptCount: 1, startedAt: STARTED_AT } } }), "blocked", "ready_running_ambiguity"),
    await expectAssessmentIssue("dependency failure blocks", snapshot({ itemPatches: { 2: { dependencyKeys: ["missing-plan-item"] } } }), "blocked", "dependency_item_missing"),
    await expectAssessmentIssue("duplicate identity blocks", snapshot({ aggregate: { duplicateExecutionItemKeyCount: 1 } }), "blocked", "duplicate_item_identity"),
    await scenarioDeterministicItemMapping(),
    await scenarioSequenceTwoRunningEvidence(),
    await scenarioAttemptCountBecomesOne(),
    await scenarioStartedAtMapped(),
    await scenarioCompletedAtAbsent(),
    await scenarioProviderNotActivated(),
    await scenarioLaterItemsUntouchedEvidence(),
    await scenarioNoSessionMutation(),
    await scenarioNoDependencyProgressionMutation(),
    await scenarioNoFallbackMutationMethods(),
    await scenarioNoRetry(),
    await scenarioTokenRedaction(),
    await scenarioDeterministicIssueMapping(),
    await scenarioSourceImmutability(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioProgressedStartableStarted() {
  const repository = repositoryHarness();
  const result = await start(repository);
  return expectScenario(
    "progressed dependency plus startable next item starts",
    result.ok && result.status === "started" && result.startedCount === 1 && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAlreadyProgressedStartableStarted() {
  const repository = repositoryHarness();
  const result = await start(repository, { progression: dependency({ status: "already_progressed" }) });
  return expectScenario(
    "already-progressed dependency plus startable next item starts",
    result.ok && result.status === "started" && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioPostProviderProgressionStartsNextProviderItem() {
  const repository = repositoryHarness({
    snapshot: postProviderSnapshot(),
    atomicResult: postProviderAtomicResult(),
  });
  const result = await start(repository, { progression: postProviderDependency() });
  const command = repository.atomicCalls[0];

  return expectScenario(
    "post-provider progression starts the next provider item",
    result.ok &&
      result.status === "started" &&
      result.sequence === 3 &&
      result.entityType === "provider_shell" &&
      result.entityId === "dentist-002" &&
      command?.expectedSequence === 3 &&
      command.itemId === POST_PROVIDER_ITEM_ID &&
      command.executionItemKey === POST_PROVIDER_EXECUTION_ITEM_KEY &&
      repository.atomicCalls.length === 1,
    JSON.stringify(redact({ result, command })),
  );
}

async function scenarioPostProviderAlreadyStartedReuseSkipsRpc() {
  const repository = repositoryHarness({
    snapshot: postProviderSnapshot({
      3: {
        executionStatus: "running",
        attemptCount: 1,
        startedAt: STARTED_AT,
      },
    }),
    atomicResult: postProviderAtomicResult(),
  });
  const result = await start(repository, { progression: postProviderDependency({ status: "already_progressed" }) });

  return expectScenario(
    "post-provider already-started provider item reuses without RPC",
    result.ok &&
      result.status === "already_started" &&
      result.reusedCount === 1 &&
      result.startedCount === 0 &&
      result.sequence === 3 &&
      repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioPostProviderOrderingPreserved() {
  const repository = repositoryHarness({
    snapshot: postProviderSnapshot(),
    atomicResult: postProviderAtomicResult(),
  });
  await start(repository, { progression: postProviderDependency() });
  const command = repository.atomicCalls[0];

  return expectScenario(
    "post-provider next item ordering is preserved",
    command?.expectedDependencyKeys.join(",") === planItemKey(2) &&
      command.expectedSequence === 3 &&
      command.proposedStartedAt === STARTED_AT,
    JSON.stringify(redact(command)),
  );
}
async function scenarioAlreadyRunningReuseSkipsRpc() {
  const repository = repositoryHarness({ snapshot: buildAlreadyStartedNextItemStartSnapshot() });
  const result = await start(repository);
  return expectScenario(
    "already-running compatible next item reuses without RPC",
    result.ok && result.status === "already_started" && result.reusedCount === 1 && result.startedCount === 0 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function expectNotAttempted(
  name: string,
  progression: ServerDeploymentActivationExecutionDependencyProgressionResult | null,
) {
  const repository = repositoryHarness();
  const result = await start(repository, { progression });
  return expectScenario(
    name,
    !result.ok && result.status === "not_attempted" && repository.loadCalls === 0 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAssessmentError() {
  const repository = repositoryHarness({ throwOnLoad: true });
  const result = await start(repository);
  return expectScenario(
    "assessment repository error",
    !result.ok && result.status === "error" && result.blockers === 1 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function expectAssessmentIssue(
  name: string,
  nextItemSnapshot: DeploymentActivationExecutionNextItemStartSnapshot,
  expectedStatus: string,
  expectedCode: string,
) {
  const repository = repositoryHarness({ snapshot: nextItemSnapshot });
  const result = await start(repository);
  return expectScenario(
    name,
    result.status === expectedStatus && result.issues.some((issue) => issue.code === expectedCode) && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function expectAtomicStatus(
  atomicStatus: DeploymentActivationExecutionAtomicNextItemStartResult["status"],
  expectedOk: boolean,
  expectedStatus: string,
  issueCode: DeploymentActivationExecutionAtomicNextItemStartResult["issueCode"],
) {
  const repository = repositoryHarness({ atomicResult: atomicResult({ ok: expectedOk, status: atomicStatus, issueCode }) });
  const result = await start(repository);
  return expectScenario(
    `atomic ${atomicStatus}`,
    result.ok === expectedOk && result.status === expectedStatus && result.result === atomicStatus && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAtomicError() {
  const repository = repositoryHarness({ throwOnAtomic: true });
  const result = await start(repository);
  return expectScenario(
    "atomic RPC error",
    !result.ok && result.status === "error" && result.blockers === 1 && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioTokenMismatchRedacted() {
  const repository = repositoryHarness();
  const result = await start(repository, { token: WRONG_TOKEN });
  return expectScenario(
    "ownership token mismatch blocks and redacts token",
    result.status === "conflict" && result.issues.some((issue) => issue.code === "ownership_token_mismatch") && repository.atomicCalls.length === 0 && !JSON.stringify(result).includes(WRONG_TOKEN),
    JSON.stringify(redact(result)),
  );
}

async function scenarioDeterministicItemMapping() {
  const repository = repositoryHarness();
  await start(repository);
  const command = repository.atomicCalls[0];
  return expectScenario(
    "deterministic item mapping",
    command?.itemId === ITEM_ID && command.executionItemKey === EXECUTION_ITEM_KEY && command.planItemKey === PLAN_ITEM_KEY && command.expectedSequence === 2,
    JSON.stringify(redact(command)),
  );
}

async function scenarioSequenceTwoRunningEvidence() {
  const result = await start(repositoryHarness());
  return expectScenario("sequence 2 becomes running evidence", result.sequence === 2 && result.result === "started", JSON.stringify(redact(result)));
}
async function scenarioAttemptCountBecomesOne() { const result = await start(repositoryHarness()); return expectScenario("attempt count becomes 1", result.attemptCount === 1, JSON.stringify(result)); }
async function scenarioStartedAtMapped() { const result = await start(repositoryHarness()); return expectScenario("startedAt is mapped", result.startedAt === STARTED_AT, JSON.stringify(result)); }
async function scenarioCompletedAtAbsent() { const result = await start(repositoryHarness()); return expectScenario("completedAt remains absent", !JSON.stringify(result).includes("completedAt"), JSON.stringify(result)); }
async function scenarioProviderNotActivated() { const result = await start(repositoryHarness()); return expectScenario("provider is not activated", result.entityType === "provider_shell" && result.downstream.entitiesActivated === 0, JSON.stringify(result.downstream)); }
async function scenarioLaterItemsUntouchedEvidence() { const repository = repositoryHarness(); await start(repository); return expectScenario("later items remain untouched evidence", repository.snapshot.items.find((candidate) => candidate.sequence === 3)?.executionStatus === "pending", JSON.stringify(repository.snapshot.items.map((candidate) => [candidate.sequence, candidate.executionStatus]))); }
async function scenarioNoSessionMutation() { const repository = repositoryHarness(); await start(repository); const command = repository.atomicCalls[0]; return expectScenario("no session mutation", command?.expectedLeaseExpiresAt === NEXT_ITEM_START_TEST_IDS.lease && !Object.prototype.hasOwnProperty.call(command, "sessionStatusAfter"), JSON.stringify(redact(command))); }
async function scenarioNoDependencyProgressionMutation() { const repository = repositoryHarness(); await start(repository); const command = repository.atomicCalls[0]; return expectScenario("no dependency progression mutation", !Object.prototype.hasOwnProperty.call(command, "progressedAt") && command?.proposedStartedAt === NOW, JSON.stringify(redact(command))); }
async function scenarioNoFallbackMutationMethods() { const prototype = Object.getPrototypeOf(repositoryHarness()) as Record<string, unknown>; const forbidden = ["insert", "update", "upsert", "delete", "activateProvider", "completeItem", "progressDependency", "finalizeDeployment", "renewLease", "rotateToken"]; return expectScenario("no fallback mutation methods", forbidden.every((method) => !(method in prototype)), JSON.stringify(forbidden.filter((method) => method in prototype))); }
async function scenarioNoRetry() { const repository = repositoryHarness({ atomicResult: atomicResult({ ok: false, status: "blocked", issueCode: "stale_state" }) }); await start(repository); return expectScenario("no retry", repository.atomicCalls.length === 1, JSON.stringify(repository.atomicCalls.map(redact))); }
async function scenarioTokenRedaction() { const repository = repositoryHarness({ throwOnAtomic: true, atomicError: new DeploymentActivationExecutionNextItemStartRepositoryError({ message: `token ${NEXT_ITEM_START_TEST_IDS.token} leaked`, layer: "atomic_rpc" }) }); const result = await start(repository); return expectScenario("token redaction", !JSON.stringify(result).includes(NEXT_ITEM_START_TEST_IDS.token) && JSON.stringify(result).includes("[redacted]"), JSON.stringify(redact(result))); }
async function scenarioDeterministicIssueMapping() { const result = await start(repositoryHarness({ snapshot: snapshot({ itemPatches: { 2: { attemptCount: 1, errorCode: "item_error" }, 3: { attemptCount: 1 } }, aggregate: { duplicateSequenceCount: 1 } }) })); const codes = result.issues.map((issue) => issue.code).join(","); return expectScenario("deterministic issue mapping", codes === "candidate_attempt_invalid,candidate_error_evidence_present,duplicate_item_identity,later_item_drift,later_item_drift", codes); }
async function scenarioSourceImmutability() { const source = snapshot(); const before = JSON.stringify(source); await start(repositoryHarness({ snapshot: source })); return expectScenario("source immutability", JSON.stringify(source) === before, "source unchanged"); }
async function scenarioDownstreamCountersRemainZero() { const result = await start(repositoryHarness()); return expectScenario("downstream counters remain zero", result.downstream.itemsStarted === 0 && result.downstream.itemsSucceeded === 0 && result.downstream.entitiesActivated === 0 && result.downstream.bindingsWritten === 0 && result.downstream.itemsCompleted === 0 && result.downstream.dependenciesProgressed === 0 && result.downstream.finalized === 0, JSON.stringify(result.downstream)); }

interface StartInput {
  claim: ServerDeploymentActivationExecutionClaimResult | null;
  progression: ServerDeploymentActivationExecutionDependencyProgressionResult | null;
  token: string | null;
}

async function start(
  repository: MockNextItemStartRepository,
  input: Partial<StartInput> = {},
) {
  return startNextActivationExecutionItemWithRepository(
    repository,
    {
      clinicId: NEXT_ITEM_START_TEST_IDS.clinicId,
      deploymentRunId: NEXT_ITEM_START_TEST_IDS.deploymentRunKey,
      deploymentActivationExecutionClaim: input.claim === undefined ? claim() : input.claim,
      deploymentActivationExecutionDependencyProgression: input.progression === undefined ? dependency() : input.progression,
      nextItemStartedAt: NOW,
    },
    {
      claimantId: NEXT_ITEM_START_TEST_IDS.owner,
      ownershipTokenResolver: () => input.token === undefined ? NEXT_ITEM_START_TEST_IDS.token : input.token,
    },
  );
}

function repositoryHarness(input: {
  snapshot?: DeploymentActivationExecutionNextItemStartSnapshot;
  atomicResult?: DeploymentActivationExecutionAtomicNextItemStartResult;
  throwOnLoad?: boolean;
  throwOnAtomic?: boolean;
  atomicError?: unknown;
} = {}) {
  return new MockNextItemStartRepository(input);
}

class MockNextItemStartRepository implements DeploymentActivationExecutionAtomicNextItemStartRepository {
  loadCalls = 0;
  atomicCalls: DeploymentActivationExecutionAtomicNextItemStartCommand[] = [];
  readonly snapshot: DeploymentActivationExecutionNextItemStartSnapshot;
  private readonly atomicResultValue: DeploymentActivationExecutionAtomicNextItemStartResult;
  private readonly throwOnLoad: boolean;
  private readonly throwOnAtomic: boolean;
  private readonly atomicError: unknown;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionNextItemStartSnapshot;
    atomicResult?: DeploymentActivationExecutionAtomicNextItemStartResult;
    throwOnLoad?: boolean;
    throwOnAtomic?: boolean;
    atomicError?: unknown;
  } = {}) {
    this.snapshot = cloneNextItemStartSnapshot(input.snapshot ?? snapshot());
    this.atomicResultValue = input.atomicResult ?? atomicResult();
    this.throwOnLoad = input.throwOnLoad ?? false;
    this.throwOnAtomic = input.throwOnAtomic ?? false;
    this.atomicError = input.atomicError;
  }

  async loadNextItemStartSnapshot(): Promise<DeploymentActivationExecutionNextItemStartSnapshot> {
    this.loadCalls += 1;

    if (this.throwOnLoad) {
      throw new Error("next item start snapshot failed");
    }

    return cloneNextItemStartSnapshot(this.snapshot);
  }

  async startNextItemAtomically(
    command: DeploymentActivationExecutionAtomicNextItemStartCommand,
  ): Promise<DeploymentActivationExecutionAtomicNextItemStartResult> {
    this.atomicCalls.push({ ...command, expectedDependencyKeys: [...command.expectedDependencyKeys] });

    if (this.throwOnAtomic) {
      throw this.atomicError ?? new Error("atomic next item start failed");
    }

    return { ...this.atomicResultValue };
  }
}

function snapshot(
  input: Parameters<typeof buildNextItemStartSnapshot>[0] = {},
): DeploymentActivationExecutionNextItemStartSnapshot {
  return buildNextItemStartSnapshot({
    session: input.session === null
      ? null
      : {
          clinicId: NEXT_ITEM_START_TEST_IDS.clinicId,
          deploymentRunKey: NEXT_ITEM_START_TEST_IDS.deploymentRunKey,
          sessionId: NEXT_ITEM_START_TEST_IDS.sessionId,
          executionKey: NEXT_ITEM_START_TEST_IDS.executionKey,
          executionOwner: NEXT_ITEM_START_TEST_IDS.owner,
          ownershipToken: NEXT_ITEM_START_TEST_IDS.token,
          leaseExpiresAt: NEXT_ITEM_START_TEST_IDS.lease,
          ...input.session,
        },
    items: input.items,
    itemPatches: input.itemPatches,
    aggregate: input.aggregate,
  });
}

function postProviderSnapshot(
  itemPatches: Parameters<typeof buildNextItemStartSnapshot>[0]["itemPatches"] = {},
): DeploymentActivationExecutionNextItemStartSnapshot {
  return snapshot({
    itemPatches: {
      2: {
        executionStatus: "succeeded",
        attemptCount: 1,
        startedAt: "2026-01-01T12:04:00.000Z",
        completedAt: "2026-01-01T12:05:00.000Z",
      },
      3: {
        executionStatus: "ready",
        dependencyKeys: [planItemKey(2)],
      },
      ...itemPatches,
    },
  });
}
function claim(input: Partial<ServerDeploymentActivationExecutionClaimResult> = {}): ServerDeploymentActivationExecutionClaimResult {
  return {
    ok: true,
    status: "claimed",
    sessionId: NEXT_ITEM_START_TEST_IDS.sessionId,
    executionKey: NEXT_ITEM_START_TEST_IDS.executionKey,
    planKey: NEXT_ITEM_START_TEST_IDS.planKey,
    claimantId: NEXT_ITEM_START_TEST_IDS.owner,
    persistedOwnerId: NEXT_ITEM_START_TEST_IDS.owner,
    leaseExpiresAt: NEXT_ITEM_START_TEST_IDS.lease,
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

function dependency(input: Partial<ServerDeploymentActivationExecutionDependencyProgressionResult> = {}): ServerDeploymentActivationExecutionDependencyProgressionResult {
  return {
    ok: true,
    status: "progressed",
    claimantId: NEXT_ITEM_START_TEST_IDS.owner,
    clinicId: NEXT_ITEM_START_TEST_IDS.clinicId,
    deploymentRunId: NEXT_ITEM_START_TEST_IDS.deploymentRunKey,
    sessionId: NEXT_ITEM_START_TEST_IDS.sessionId,
    executionKey: NEXT_ITEM_START_TEST_IDS.executionKey,
    completedItemId: "activation-execution-item-next-start-001",
    completedExecutionItemKey: `${NEXT_ITEM_START_TEST_IDS.executionKey}:${planItemKey(1)}`,
    completedPlanItemKey: planItemKey(1),
    completedSequence: 1,
    completedStartedAt: "2026-01-01T12:00:00.000Z",
    completedCompletedAt: "2026-01-01T12:02:00.000Z",
    completedAttemptCount: 1,
    nextItemId: ITEM_ID,
    nextExecutionItemKey: EXECUTION_ITEM_KEY,
    nextPlanItemKey: PLAN_ITEM_KEY,
    nextSequence: 2,
    nextEntityType: "provider_shell",
    nextEntityId: "dentist-001",
    nextAction: "activate",
    nextAttemptCount: 0,
    statusBefore: "pending",
    statusAfter: "ready",
    progressionResult: "progressed",
    issueCode: null,
    progressedCount: 1,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      itemsReadied: 0,
      itemsStarted: 0,
      itemsSucceeded: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      sessionsCompleted: 0,
      deploymentsFinalized: 0,
      rollbacksExecuted: 0,
    },
    message: "Dependency progression readied the next item.",
    ...input,
  };
}

function postProviderDependency(
  input: Partial<ServerDeploymentActivationExecutionDependencyProgressionResult> = {},
): ServerDeploymentActivationExecutionDependencyProgressionResult {
  return dependency({
    completedItemId: ITEM_ID,
    completedExecutionItemKey: EXECUTION_ITEM_KEY,
    completedPlanItemKey: PLAN_ITEM_KEY,
    completedSequence: 2,
    completedStartedAt: "2026-01-01T12:04:00.000Z",
    completedCompletedAt: "2026-01-01T12:05:00.000Z",
    completedAttemptCount: 1,
    nextItemId: POST_PROVIDER_ITEM_ID,
    nextExecutionItemKey: POST_PROVIDER_EXECUTION_ITEM_KEY,
    nextPlanItemKey: POST_PROVIDER_PLAN_ITEM_KEY,
    nextSequence: 3,
    nextEntityType: "provider_shell",
    nextEntityId: "dentist-002",
    nextAction: "activate",
    nextAttemptCount: 0,
    ...input,
  });
}
function atomicResult(input: Partial<DeploymentActivationExecutionAtomicNextItemStartResult> = {}): DeploymentActivationExecutionAtomicNextItemStartResult {
  return {
    ok: true,
    status: "started",
    clinicId: NEXT_ITEM_START_TEST_IDS.clinicId,
    deploymentRunKey: NEXT_ITEM_START_TEST_IDS.deploymentRunKey,
    sessionId: NEXT_ITEM_START_TEST_IDS.sessionId,
    executionKey: NEXT_ITEM_START_TEST_IDS.executionKey,
    itemId: ITEM_ID,
    executionItemKey: EXECUTION_ITEM_KEY,
    planItemKey: PLAN_ITEM_KEY,
    sequence: 2,
    entityType: "provider_shell",
    entityId: "dentist-001",
    action: "activate",
    attemptCount: 1,
    startedAt: STARTED_AT,
    leaseExpiresAt: NEXT_ITEM_START_TEST_IDS.lease,
    issueCode: null,
    message: "Next item was started.",
    ...input,
  };
}

function postProviderAtomicResult(
  input: Partial<DeploymentActivationExecutionAtomicNextItemStartResult> = {},
): DeploymentActivationExecutionAtomicNextItemStartResult {
  return atomicResult({
    itemId: POST_PROVIDER_ITEM_ID,
    executionItemKey: POST_PROVIDER_EXECUTION_ITEM_KEY,
    planItemKey: POST_PROVIDER_PLAN_ITEM_KEY,
    sequence: 3,
    entityType: "provider_shell",
    entityId: "dentist-002",
    action: "activate",
    attemptCount: 1,
    startedAt: STARTED_AT,
    ...input,
  });
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
): DeploymentActivationExecutionNextItemStartServerHarnessScenario {
  return { name, passed, message };
}