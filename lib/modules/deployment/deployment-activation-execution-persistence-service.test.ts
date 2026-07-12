import {
  buildClinicActivationCurrentState,
  buildDeploymentRunActivationCurrentState,
  buildProviderShellActivationCurrentState,
} from "./deployment-activation-current-state";
import { DeploymentActivationExecutionPersistenceService } from "./deployment-activation-execution-persistence-service";
import { InMemoryDeploymentActivationExecutionPersistenceTestRepository } from "./deployment-activation-execution-persistence-test-repository";
import {
  buildItemPayloadFromPreparationItem,
  buildSessionPayloadFromPreparation,
  type DeploymentActivationExecutionItemRecord,
  type DeploymentActivationExecutionPersistenceCommand,
  type DeploymentActivationExecutionPersistenceIssueCode,
  type DeploymentActivationExecutionPersistenceResult,
  type DeploymentActivationExecutionSessionRecord,
} from "./deployment-activation-execution-persistence-types";
import type {
  DeploymentActivationExecutionItem,
  DeploymentActivationExecutionResult,
} from "./deployment-activation-execution-types";

export interface DeploymentActivationExecutionPersistenceServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionPersistenceServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionPersistenceServiceHarnessScenario[];
}

const CLINIC_ID = "clinic-execution-persistence-0001";
const OTHER_CLINIC_ID = "clinic-execution-persistence-0002";
const DEPLOYMENT_RUN_ID = "deployment-run-execution-persistence-0001";
const EXECUTION_KEY = `activation-execution-${DEPLOYMENT_RUN_ID}`;
const PLAN_KEY = `activation-plan-${DEPLOYMENT_RUN_ID}`;

export async function runDeploymentActivationExecutionPersistenceServiceHarness(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessResult> {
  const scenarios = [
    await scenarioFreshSessionCreation(),
    await scenarioFreshItemCreation(),
    await scenarioCompatibleFullRetryReuse(),
    await scenarioPartialExistingItemReuseCreate(),
    await scenarioDeterministicSessionIdentity(),
    await scenarioDeterministicItemOrdering(),
    await scenarioBlockedPreparationRejected(),
    await scenarioErrorPreparationRejected(),
    await scenarioMissingExecutionKey(),
    await scenarioMissingPlanKey(),
    await scenarioItemCountMismatch(),
    await scenarioDuplicateExecutionItemKey(),
    await scenarioDuplicatePlanItemKey(),
    await scenarioUnsupportedItemStatus(),
    await scenarioNonzeroAttemptCountRejected(),
    await scenarioExecutionTimestampsRejected(),
    await scenarioConflictingPlanKey(),
    await scenarioConflictingExecutionKeyForDeploymentRun(),
    await scenarioConflictingItemAction(),
    await scenarioConflictingItemEntityId(),
    await scenarioConflictingExpectedCurrentState(),
    await scenarioConflictingTargetState(),
    await scenarioConflictingDependencies(),
    await scenarioConflictingRollbackBehavior(),
    await scenarioExistingNonPreparedSessionConflict(),
    await scenarioExistingRunningItemConflict(),
    await scenarioCrossClinicSessionIsolation(),
    await scenarioSameExecutionKeyAnotherClinicIsolation(),
    await scenarioSourcePreparationUnmodified(),
    await scenarioRepositoryRowsUnchangedOnConflict(),
    await scenarioDownstreamCountersRemainZero(),
    await scenarioRepositoryErrorReturnsSafeError(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioFreshSessionCreation(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  const result = await persist(repository);

  return expectScenario(
    "fresh prepared session creation",
    result.ok &&
      result.status === "created" &&
      result.sessionCreated === 1 &&
      repository.sessions.length === 1,
    JSON.stringify(result),
  );
}

async function scenarioFreshItemCreation(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  const result = await persist(repository);

  return expectScenario(
    "fresh execution item creation",
    result.itemsCreated === preparation().executionItems.length &&
      repository.items.length === preparation().executionItems.length,
    JSON.stringify({ result, items: repository.items.length }),
  );
}

async function scenarioCompatibleFullRetryReuse(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  await persist(repository);
  const second = await persist(repository);

  return expectScenario(
    "compatible full retry reuses session and items",
    second.status === "reused" &&
      second.sessionReused === 1 &&
      second.itemsReused === preparation().executionItems.length &&
      second.itemsCreated === 0,
    JSON.stringify(second),
  );
}

async function scenarioPartialExistingItemReuseCreate(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const existing = seedRecords();
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository({
    sessions: [existing.session],
    items: [existing.items[0]],
  });
  const result = await persist(repository);

  return expectScenario(
    "partial existing state reuses and creates only missing items",
    result.status === "created" &&
      result.sessionReused === 1 &&
      result.itemsReused === 1 &&
      result.itemsCreated === preparation().executionItems.length - 1,
    JSON.stringify(result),
  );
}

async function scenarioDeterministicSessionIdentity(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  const result = await persist(repository);
  const session = repository.sessions[0];

  return expectScenario(
    "deterministic session identity",
    result.executionKey === EXECUTION_KEY &&
      session.executionKey === EXECUTION_KEY &&
      session.deploymentRunId === DEPLOYMENT_RUN_ID,
    JSON.stringify(session),
  );
}

async function scenarioDeterministicItemOrdering(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  await persist(repository, {
    preparation: preparation({ executionItems: [...preparation().executionItems].reverse() }),
  });
  const order = repository.items.map((item) => item.sequence).join(",");

  return expectScenario(
    "deterministic item ordering",
    order === "1,2,3",
    order,
  );
}

async function scenarioBlockedPreparationRejected(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectIssue(
    "blocked preparation rejected",
    { preparation: preparation({ ok: false, status: "blocked", blockers: 1 }) },
    "preparation_not_ready",
  );
}

async function scenarioErrorPreparationRejected(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectIssue(
    "error preparation rejected",
    { preparation: preparation({ ok: false, status: "error" }) },
    "preparation_not_ready",
  );
}

async function scenarioMissingExecutionKey(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectIssue("missing execution key", { preparation: preparation({ executionKey: null }) }, "execution_identity_missing");
}

async function scenarioMissingPlanKey(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectIssue("missing plan key", { preparation: preparation({ planKey: null }) }, "plan_identity_missing");
}

async function scenarioItemCountMismatch(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectIssue("item count mismatch", { preparation: preparation({ itemsRequested: 99 }) }, "item_count_mismatch");
}

async function scenarioDuplicateExecutionItemKey(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const items = preparation().executionItems;
  return expectIssue(
    "duplicate execution item key",
    { preparation: preparation({ executionItems: [...items, { ...items[0], planItemKey: "duplicate-plan" }] }) },
    "duplicate_execution_item_key",
  );
}

async function scenarioDuplicatePlanItemKey(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const items = preparation().executionItems;
  return expectIssue(
    "duplicate plan item key",
    { preparation: preparation({ executionItems: [...items, { ...items[0], executionItemKey: `${EXECUTION_KEY}:duplicate` }] }) },
    "duplicate_plan_item_key",
  );
}

async function scenarioUnsupportedItemStatus(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectIssue("unsupported item status", { preparation: withItemPatch({ executionStatus: "running" }) }, "unsupported_item_status");
}

async function scenarioNonzeroAttemptCountRejected(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectIssue("nonzero attempt count rejected", { preparation: withItemPatch({ attemptCount: 1 }) }, "attempt_count_not_zero");
}

async function scenarioExecutionTimestampsRejected(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectIssue("execution timestamps rejected", { preparation: withItemPatch({ startedAt: "2026-01-01T00:00:00.000Z" }) }, "execution_timestamp_present");
}

async function scenarioConflictingPlanKey(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("conflicting plan key", { session: { planKey: "activation-plan-other" } }, "immutable_evidence_conflict");
}

async function scenarioConflictingExecutionKeyForDeploymentRun(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("conflicting execution key for deployment run", { session: { executionKey: "activation-execution-other" } }, "session_identity_conflict");
}

async function scenarioConflictingItemAction(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("conflicting item action", { item: { action: "no_op" } }, "item_identity_conflict");
}

async function scenarioConflictingItemEntityId(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("conflicting item entity ID", { item: { entityId: "provider-row-other" } }, "item_identity_conflict");
}

async function scenarioConflictingExpectedCurrentState(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("conflicting expected current state", { item: { expectedCurrentState: { active: true } } }, "immutable_evidence_conflict");
}

async function scenarioConflictingTargetState(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("conflicting target state", { item: { targetState: { active: false } } }, "immutable_evidence_conflict");
}

async function scenarioConflictingDependencies(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("conflicting dependencies", { item: { dependencyKeys: ["other"] } }, "immutable_evidence_conflict");
}

async function scenarioConflictingRollbackBehavior(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("conflicting reversibility or rollback action", { item: { reversible: false, rollbackAction: null, rollbackStatus: "not_supported" } }, "immutable_evidence_conflict");
}

async function scenarioExistingNonPreparedSessionConflict(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("existing non-prepared session conflict", { session: { executionStatus: "running" } }, "session_state_conflict");
}

async function scenarioExistingRunningItemConflict(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  return expectConflict("existing running/completed item conflict", { item: { executionStatus: "running" } }, "item_state_conflict");
}

async function scenarioCrossClinicSessionIsolation(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const other = seedRecords(OTHER_CLINIC_ID);
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository({
    sessions: [other.session],
    items: other.items,
  });
  const result = await persist(repository);

  return expectScenario(
    "cross-clinic session isolation",
    result.ok && repository.sessions.length === 2,
    JSON.stringify({ result, sessions: repository.sessions }),
  );
}

async function scenarioSameExecutionKeyAnotherClinicIsolation(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const other = seedRecords(OTHER_CLINIC_ID, DEPLOYMENT_RUN_ID);
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository({
    sessions: [other.session],
    items: other.items,
  });
  const result = await persist(repository);

  return expectScenario(
    "same logical execution key in another clinic is isolated",
    result.ok && repository.sessions.length === 2,
    JSON.stringify({ result, sessions: repository.sessions.map((session) => session.clinicId) }),
  );
}

async function scenarioSourcePreparationUnmodified(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const prep = preparation();
  const before = JSON.stringify(prep);
  await persist(new InMemoryDeploymentActivationExecutionPersistenceTestRepository(), { preparation: prep });

  return expectScenario(
    "source preparation evidence remains unmodified",
    JSON.stringify(prep) === before,
    "source preparation unchanged",
  );
}

async function scenarioRepositoryRowsUnchangedOnConflict(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const seeded = seedRecords();
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository({
    sessions: [seeded.session],
    items: [{ ...seeded.items[0], action: "no_op" }, ...seeded.items.slice(1)],
  });
  const before = JSON.stringify(repository.items);
  await persist(repository);

  return expectScenario(
    "repository rows remain unchanged on conflict",
    JSON.stringify(repository.items) === before,
    JSON.stringify(repository.items),
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  const result = await persist(repository);

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.itemsClaimed === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.itemsFailed === 0 &&
      result.downstream.itemsRolledBack === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.deploymentRunsFinalized === 0 &&
      repository.downstreamWriteCount === 0,
    JSON.stringify(result.downstream),
  );
}

async function scenarioRepositoryErrorReturnsSafeError(): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const result = await persist(
    new InMemoryDeploymentActivationExecutionPersistenceTestRepository({ shouldThrow: true }),
  );

  return expectScenario(
    "repository error returns safe error evidence",
    result.status === "error" && hasIssue(result, "repository_error"),
    JSON.stringify(result),
  );
}

async function expectIssue(
  name: string,
  command: Partial<DeploymentActivationExecutionPersistenceCommand>,
  expectedCode: DeploymentActivationExecutionPersistenceIssueCode,
): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const result = await persist(new InMemoryDeploymentActivationExecutionPersistenceTestRepository(), command);

  return expectScenario(
    name,
    result.status === "blocked" && hasIssue(result, expectedCode),
    JSON.stringify(result.issues),
  );
}

async function expectConflict(
  name: string,
  input: {
    session?: Partial<DeploymentActivationExecutionSessionRecord>;
    item?: Partial<DeploymentActivationExecutionItemRecord>;
  },
  expectedCode: DeploymentActivationExecutionPersistenceIssueCode,
): Promise<DeploymentActivationExecutionPersistenceServiceHarnessScenario> {
  const seeded = seedRecords();
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository({
    sessions: [{ ...seeded.session, ...input.session }],
    items: [{ ...seeded.items[0], ...input.item }, ...seeded.items.slice(1)],
  });
  const result = await persist(repository);

  return expectScenario(
    name,
    result.status === "conflict" && hasIssue(result, expectedCode),
    JSON.stringify(result.issues),
  );
}

async function persist(
  repository: InMemoryDeploymentActivationExecutionPersistenceTestRepository,
  command: Partial<DeploymentActivationExecutionPersistenceCommand> = {},
): Promise<DeploymentActivationExecutionPersistenceResult> {
  return new DeploymentActivationExecutionPersistenceService(repository).persistPreparedExecution({
    preparation: preparation(),
    payloadHash: "payload-hash-001",
    preparationEvidence: { source: "test-preparation" },
    executionMetadata: { source: "test" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...command,
  });
}

function seedRecords(
  clinicId = CLINIC_ID,
  deploymentRunId = DEPLOYMENT_RUN_ID,
): {
  session: DeploymentActivationExecutionSessionRecord;
  items: readonly DeploymentActivationExecutionItemRecord[];
} {
  const prep = preparation({
    clinicId,
    deploymentRunId,
    executionKey: `activation-execution-${deploymentRunId}`,
    planKey: `activation-plan-${deploymentRunId}`,
  });
  const sessionPayload = buildSessionPayloadFromPreparation({
    preparation: prep,
    payloadHash: "payload-hash-001",
    preparationEvidence: { source: "test-preparation" },
    executionMetadata: { source: "test" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  if (!sessionPayload) {
    throw new Error("test session payload missing");
  }

  const session: DeploymentActivationExecutionSessionRecord = {
    ...sessionPayload,
    id: "activation-execution-session-0001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const items = prep.executionItems.map((item, index) => ({
    ...buildItemPayloadFromPreparationItem({
      sessionId: session.id,
      clinicId: session.clinicId,
      deploymentRunId: session.deploymentRunId,
      executionKey: session.executionKey,
      item,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    id: `activation-execution-item-${(index + 1).toString().padStart(4, "0")}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

  return { session, items };
}

function preparation(
  input: Partial<DeploymentActivationExecutionResult> = {},
): DeploymentActivationExecutionResult {
  const executionKey = input.executionKey === undefined ? EXECUTION_KEY : input.executionKey;
  const planKey = input.planKey === undefined ? PLAN_KEY : input.planKey;
  const clinicId = input.clinicId === undefined ? CLINIC_ID : input.clinicId;
  const deploymentRunId = input.deploymentRunId === undefined ? DEPLOYMENT_RUN_ID : input.deploymentRunId;
  const executionItems = input.executionItems ?? baseExecutionItems({ executionKey: executionKey ?? EXECUTION_KEY, clinicId: clinicId ?? CLINIC_ID, deploymentRunId: deploymentRunId ?? DEPLOYMENT_RUN_ID });

  return {
    ok: input.ok ?? true,
    status: input.status ?? "ready",
    executionKey,
    planKey,
    clinicId,
    deploymentRunId,
    itemsRequested: input.itemsRequested ?? executionItems.length,
    itemsReady: input.itemsReady ?? executionItems.filter((item) => item.executionStatus === "ready").length,
    itemsBlocked: input.itemsBlocked ?? 0,
    itemsPending: input.itemsPending ?? executionItems.filter((item) => item.executionStatus === "pending").length,
    reversibleItems: input.reversibleItems ?? executionItems.filter((item) => item.reversible).length,
    irreversibleItems: input.irreversibleItems ?? executionItems.filter((item) => !item.reversible).length,
    blockers: input.blockers ?? 0,
    warnings: input.warnings ?? 0,
    issues: input.issues ?? [],
    executionItems,
    rollbackBoundary: input.rollbackBoundary ?? {
      lastReversibleSequence: 2,
      firstIrreversibleSequence: 3,
      rollbackSupportedItemKeys: [`${planKey}:clinic`, `${planKey}:provider_shell:provider-001`],
      rollbackUnsupportedItemKeys: [`${planKey}:deployment_run`],
      wouldCrossIrreversibleBoundary: true,
    },
    downstream: input.downstream ?? {
      requested: 0,
      created: 0,
      reused: 0,
      skipped: 0,
      conflicts: 0,
    },
    message: input.message ?? "Execution preparation is ready.",
  };
}

function baseExecutionItems(input: {
  executionKey: string;
  clinicId: string;
  deploymentRunId: string;
}): DeploymentActivationExecutionItem[] {
  const planKey = `activation-plan-${input.deploymentRunId}`;
  const clinicPlanKey = `${planKey}:clinic`;
  const providerPlanKey = `${planKey}:provider_shell:provider-001`;
  const runPlanKey = `${planKey}:deployment_run`;

  return [
    executionItem(input.executionKey, clinicPlanKey, 1, "clinic", input.clinicId, null, "activate", buildClinicActivationCurrentState({ clinicId: input.clinicId, deploymentStatus: "draft" }), { deploymentStatus: "active" }, [], true, "restore clinic"),
    executionItem(input.executionKey, providerPlanKey, 2, "provider_shell", "provider-row-001", "provider-001", "activate", buildProviderShellActivationCurrentState({ id: "provider-row-001", clinicId: input.clinicId, deploymentProviderKey: "provider-001", provisioningSource: "setup_draft", provisioningStatus: "placeholder", active: false }), { provisioningStatus: "active", active: true }, [clinicPlanKey], true, "restore provider"),
    executionItem(input.executionKey, runPlanKey, 3, "deployment_run", null, input.deploymentRunId, "finalize", buildDeploymentRunActivationCurrentState({ deploymentRunId: input.deploymentRunId, clinicId: input.clinicId, lifecycleState: "completed", deploymentStatus: "deployed" }), { deploymentStatus: "activated" }, [clinicPlanKey, providerPlanKey], false, null),
  ];
}

function executionItem(
  executionKey: string,
  planItemKey: string,
  sequence: number,
  entityType: DeploymentActivationExecutionItem["entityType"],
  entityId: string | null,
  deploymentKey: string | null,
  action: DeploymentActivationExecutionItem["action"],
  currentState: Record<string, unknown>,
  targetState: Record<string, unknown>,
  dependencyKeys: readonly string[],
  reversible: boolean,
  rollbackAction: string | null,
): DeploymentActivationExecutionItem {
  return {
    executionItemKey: `${executionKey}:${planItemKey}`,
    planItemKey,
    sequence,
    entityType,
    entityId,
    deploymentKey,
    action,
    currentState,
    targetState,
    dependencyKeys,
    executionStatus: dependencyKeys.length === 0 ? "ready" : "pending",
    attemptCount: 0,
    reversible,
    rollbackAction,
    startedAt: null,
    completedAt: null,
    error: null,
    evidence: {
      dependencyLevel: dependencyKeys.length === 0 ? 0 : 1,
      readyDependencyKeys: dependencyKeys,
      pendingDependencyKeys: [],
    },
    downstream: {
      requested: 0,
      created: 0,
      reused: 0,
      skipped: 0,
      conflicts: 0,
    },
  };
}

function withItemPatch(
  patch: Partial<DeploymentActivationExecutionItem>,
): DeploymentActivationExecutionResult {
  return preparation({
    executionItems: preparation().executionItems.map((item, index) =>
      index === 0 ? { ...item, ...patch } : item,
    ),
  });
}

function hasIssue(
  result: DeploymentActivationExecutionPersistenceResult,
  code: DeploymentActivationExecutionPersistenceIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionPersistenceServiceHarnessScenario {
  return { name, passed, message };
}
