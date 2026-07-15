import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateItemStartItems,
  assertAtMostOne,
  atomicItemStartRpcPayload,
  mapAtomicItemStartRpcResult,
  mapCandidateItem,
  mapItemStartSessionRow,
  selectCandidateItem,
  SupabaseDeploymentActivationExecutionItemStartRepository,
  type ItemStartItemRow,
} from "./deployment-activation-execution-item-start-supabase-repository";
import type {
  DeploymentActivationExecutionAtomicItemStartCommand,
} from "./deployment-activation-execution-item-start-types";

export interface DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-item-start-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-item-start-0001";
const SESSION_ID = "activation-execution-session-item-start-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-item-start-0001";
const PLAN_KEY = "activation-plan-deployment-run-item-start-0001";
const ITEM_ID = "activation-execution-item-0001";
const EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:${PLAN_KEY}:clinic`;
const PLAN_ITEM_KEY = `${PLAN_KEY}:clinic`;
const CLAIMANT_ID = "executor-item-start-001";
const OWNERSHIP_TOKEN = "sensitive-item-start-token";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const STARTED_AT = "2026-01-01T12:00:00.000Z";

export async function runDeploymentActivationExecutionItemStartSupabaseRepositoryHarness(): Promise<DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSnapshotSessionMapping(),
    scenarioItemMapping(),
    await scenarioDeterministicSequenceOrdering(),
    scenarioAggregateItemCounts(),
    scenarioSucceededDependencyKeyDerivation(),
    await scenarioMissingSession(),
    scenarioAmbiguousSession(),
    await scenarioMissingCandidateItem(),
    scenarioRpcPayloadShape(),
    scenarioOwnerTokenLeasePayload(),
    scenarioExpectedItemIdentityPayload(),
    scenarioExpectedAttemptCountPayload(),
    scenarioProposedStartTimestampPayload(),
    await scenarioStartedResultMapping(),
    scenarioAlreadyStartedResultMapping(),
    scenarioBlockedResultMapping(),
    scenarioConflictResultMapping(),
    scenarioNotFoundResultMapping(),
    scenarioMalformedRpcResponse(),
    await scenarioUnexpectedRpcStatus(),
    await scenarioMultipleRpcRows(),
    await scenarioSupabaseErrorSanitization(),
    scenarioTokenRedaction(),
    scenarioNoGenericMutationMethods(),
    scenarioNoSessionMutationMethod(),
    scenarioNoDependentItemMutationMethod(),
    scenarioNoCompletionFailureRollbackMethods(),
    await scenarioSourcePayloadImmutability(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioSnapshotSessionMapping(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const mapped = mapItemStartSessionRow(sessionRow());

  return expectScenario(
    "snapshot session mapping",
    mapped.sessionId === SESSION_ID &&
      mapped.executionStatus === "running" &&
      mapped.executionOwner === CLAIMANT_ID &&
      mapped.itemsRequested === 3,
    JSON.stringify(mapped),
  );
}

function scenarioItemMapping(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const mapped = mapCandidateItem(itemRow());

  return expectScenario(
    "item mapping",
    mapped?.itemId === ITEM_ID &&
      mapped.executionItemKey === EXECUTION_ITEM_KEY &&
      mapped.entityKey === CLINIC_ID &&
      mapped.dependencyKeys.length === 0 &&
      mapped.expectedCurrentState.deploymentStatus === "draft",
    JSON.stringify(mapped),
  );
}

async function scenarioDeterministicSequenceOrdering(): Promise<DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({
    deployment_activation_execution_sessions: [sessionRow()],
    deployment_activation_execution_items: [
      itemRow({ id: "item-2", sequence: 2, execution_item_key: "b", plan_item_key: "plan-b", execution_status: "pending", dependency_keys: [PLAN_ITEM_KEY] }),
      itemRow({ id: "item-1", sequence: 1, execution_item_key: "a" }),
    ],
  });
  const repository = new SupabaseDeploymentActivationExecutionItemStartRepository(client as unknown as SupabaseClient);
  const snapshot = await repository.loadExecutionItemStartSnapshot(query());

  return expectScenario(
    "deterministic sequence ordering",
    snapshot.candidateItem?.itemId === "item-1" &&
      snapshot.aggregate.firstSequence === 1 &&
      client.calls.some((call) => call.table === "deployment_activation_execution_items"),
    JSON.stringify(snapshot),
  );
}

function scenarioAggregateItemCounts(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const aggregate = aggregateItemStartItems([
    itemRow(),
    itemRow({ id: "item-2", execution_item_key: "b", plan_item_key: "plan-b", sequence: 2, execution_status: "pending", dependency_keys: [PLAN_ITEM_KEY] }),
    itemRow({ id: "item-3", execution_item_key: "c", plan_item_key: "plan-c", sequence: 3, execution_status: "succeeded", attempt_count: 1, started_at: STARTED_AT, completed_at: STARTED_AT }),
  ]);

  return expectScenario(
    "aggregate item counts",
    aggregate.totalItemCount === 3 &&
      aggregate.readyItemCount === 1 &&
      aggregate.pendingItemCount === 1 &&
      aggregate.succeededItemCount === 1 &&
      aggregate.attemptedItemCount === 1 &&
      aggregate.timestampedItemCount === 1,
    JSON.stringify(aggregate),
  );
}

function scenarioSucceededDependencyKeyDerivation(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const aggregate = aggregateItemStartItems([
    itemRow({ execution_status: "succeeded", plan_item_key: PLAN_ITEM_KEY }),
    itemRow({ id: "item-2", execution_item_key: "b", plan_item_key: "plan-b", sequence: 2, execution_status: "ready", dependency_keys: [PLAN_ITEM_KEY] }),
  ]);

  return expectScenario(
    "succeeded dependency key derivation",
    aggregate.succeededPlanItemKeys.length === 1 && aggregate.succeededPlanItemKeys[0] === PLAN_ITEM_KEY,
    JSON.stringify(aggregate),
  );
}

async function scenarioMissingSession(): Promise<DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionItemStartRepository(new MockSupabaseClient({}) as unknown as SupabaseClient);
  const snapshot = await repository.loadExecutionItemStartSnapshot(query());

  return expectScenario(
    "missing session",
    snapshot.session === null && snapshot.candidateItem === null && snapshot.aggregate.totalItemCount === 0,
    JSON.stringify(snapshot),
  );
}

function scenarioAmbiguousSession(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  try {
    assertAtMostOne([{}, {}], "item-start session");
  } catch (error) {
    return expectScenario(
      "ambiguous session",
      error instanceof Error && error.message.includes("Ambiguous item-start session"),
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario("ambiguous session", false, "duplicates accepted");
}

async function scenarioMissingCandidateItem(): Promise<DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionItemStartRepository(new MockSupabaseClient({
    deployment_activation_execution_sessions: [sessionRow()],
    deployment_activation_execution_items: [itemRow({ execution_status: "pending", dependency_keys: [PLAN_ITEM_KEY] })],
  }) as unknown as SupabaseClient);
  const snapshot = await repository.loadExecutionItemStartSnapshot(query());

  return expectScenario(
    "missing candidate item",
    snapshot.candidateItem === null && snapshot.aggregate.readyItemCount === 0,
    JSON.stringify(snapshot),
  );
}

function scenarioRpcPayloadShape(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const payload = atomicItemStartRpcPayload(command());

  return expectScenario(
    "RPC payload shape",
    payload.p_clinic_id === CLINIC_ID &&
      payload.p_deployment_run_key === DEPLOYMENT_RUN_KEY &&
      payload.p_session_id === SESSION_ID &&
      payload.p_execution_key === EXECUTION_KEY &&
      Object.keys(payload).length === 16,
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioOwnerTokenLeasePayload(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const payload = atomicItemStartRpcPayload(command());

  return expectScenario(
    "owner token lease compare-and-set payload",
    payload.p_claimant_id === CLAIMANT_ID &&
      payload.p_ownership_token === OWNERSHIP_TOKEN &&
      payload.p_expected_lease_expires_at === ACTIVE_LEASE &&
      !Object.prototype.hasOwnProperty.call(payload, "p_new_ownership_token") &&
      !Object.prototype.hasOwnProperty.call(payload, "p_lease_renewal"),
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioExpectedItemIdentityPayload(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const payload = atomicItemStartRpcPayload(command());

  return expectScenario(
    "expected item identity payload",
    payload.p_item_id === ITEM_ID &&
      payload.p_execution_item_key === EXECUTION_ITEM_KEY &&
      payload.p_plan_item_key === PLAN_ITEM_KEY &&
      payload.p_expected_sequence === 1 &&
      payload.p_expected_action === "activate" &&
      payload.p_expected_entity_type === "clinic" &&
      payload.p_expected_entity_key === CLINIC_ID,
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioExpectedAttemptCountPayload(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const payload = atomicItemStartRpcPayload(command());

  return expectScenario("expected attempt count payload", payload.p_expected_attempt_count === 0, JSON.stringify(redactPayload(payload)));
}

function scenarioProposedStartTimestampPayload(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const payload = atomicItemStartRpcPayload(command());

  return expectScenario("proposed start timestamp payload", payload.p_proposed_started_at === STARTED_AT, JSON.stringify(redactPayload(payload)));
}

async function scenarioStartedResultMapping(): Promise<DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({}, { start_deployment_activation_execution_item: [rpcRow({ status: "started" })] });
  const repository = new SupabaseDeploymentActivationExecutionItemStartRepository(client as unknown as SupabaseClient);
  const result = await repository.startExecutionItemAtomically(command());
  const rpcCall = client.rpcCalls[0];

  return expectScenario(
    "started result mapping",
    result.ok &&
      result.status === "started" &&
      result.attemptCount === 1 &&
      result.startedAt === STARTED_AT &&
      rpcCall.name === "start_deployment_activation_execution_item",
    JSON.stringify({ result, rpcCall: { ...rpcCall, payload: redactPayload(rpcCall.payload) } }),
  );
}

function scenarioAlreadyStartedResultMapping(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const result = mapAtomicItemStartRpcResult(rpcRow({ status: "already_started", execution_status: "running" }));
  return expectScenario("already_started result mapping", result.ok && result.status === "already_started", JSON.stringify(result));
}

function scenarioBlockedResultMapping(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const result = mapAtomicItemStartRpcResult(rpcRow({ status: "blocked", issue_code: "item_integrity_invalid" }));
  return expectScenario("blocked result mapping", !result.ok && result.status === "blocked" && result.issueCode === "item_integrity_invalid", JSON.stringify(result));
}

function scenarioConflictResultMapping(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const result = mapAtomicItemStartRpcResult(rpcRow({ status: "conflict", issue_code: "ownership_compare_failed" }));
  return expectScenario("conflict result mapping", !result.ok && result.status === "conflict", JSON.stringify(result));
}

function scenarioNotFoundResultMapping(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const result = mapAtomicItemStartRpcResult(rpcRow({ status: "not_found", item_id: null }));
  return expectScenario("not_found result mapping", !result.ok && result.status === "not_found" && result.itemId === null, JSON.stringify(result));
}

function scenarioMalformedRpcResponse(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  try {
    mapAtomicItemStartRpcResult(rpcRow({ status: "surprise" }));
  } catch (error) {
    return expectScenario(
      "malformed RPC response",
      error instanceof Error && error.name === "DeploymentActivationExecutionItemStartRepositoryError",
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario("malformed RPC response", false, "malformed status accepted");
}

async function scenarioUnexpectedRpcStatus(): Promise<DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionItemStartRepository(new MockSupabaseClient({}, {
    start_deployment_activation_execution_item: [rpcRow({ status: "unexpected" })],
  }) as unknown as SupabaseClient);

  try {
    await repository.startExecutionItemAtomically(command());
  } catch (error) {
    return expectScenario("unexpected RPC status", error instanceof Error && !String(error).includes(OWNERSHIP_TOKEN), String(error));
  }

  return expectScenario("unexpected RPC status", false, "unexpected status accepted");
}

async function scenarioMultipleRpcRows(): Promise<DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionItemStartRepository(new MockSupabaseClient({}, {
    start_deployment_activation_execution_item: [rpcRow(), rpcRow()],
  }) as unknown as SupabaseClient);

  try {
    await repository.startExecutionItemAtomically(command());
  } catch (error) {
    return expectScenario("multiple RPC rows", error instanceof Error && String(error).includes("Ambiguous"), String(error));
  }

  return expectScenario("multiple RPC rows", false, "multiple rows accepted");
}

async function scenarioSupabaseErrorSanitization(): Promise<DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionItemStartRepository(new MockSupabaseClient({}, {}, {
    message: `database failed ${OWNERSHIP_TOKEN}`,
    code: "PGRST000",
  }) as unknown as SupabaseClient);

  try {
    await repository.loadExecutionItemStartSnapshot(query());
  } catch (error) {
    return expectScenario("Supabase error sanitization", error instanceof Error && !error.message.includes(OWNERSHIP_TOKEN), String(error));
  }

  return expectScenario("Supabase error sanitization", false, "error not thrown");
}

function scenarioTokenRedaction(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const payload = atomicItemStartRpcPayload(command());
  const result = mapAtomicItemStartRpcResult(rpcRow({ status: "conflict", message: "Ownership compare-and-set failed." }));

  return expectScenario(
    "token redaction",
    payload.p_ownership_token === OWNERSHIP_TOKEN &&
      !JSON.stringify(result).includes(OWNERSHIP_TOKEN) &&
      !result.message.includes(OWNERSHIP_TOKEN),
    JSON.stringify(result),
  );
}

function scenarioNoGenericMutationMethods(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no generic mutation methods", ["update", "insert", "upsert", "delete", "patch", "save"]);
}

function scenarioNoSessionMutationMethod(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no session mutation method", ["startSession", "renewLease", "rotateToken", "heartbeat"]);
}

function scenarioNoDependentItemMutationMethod(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no dependent item mutation method", ["unlockDependentItems", "startDependentItems", "updateDependencies"]);
}

function scenarioNoCompletionFailureRollbackMethods(): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no completion failure rollback method", ["completeItem", "failItem", "rollbackItem", "markSucceeded", "markFailed"]);
}

async function scenarioSourcePayloadImmutability(): Promise<DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario> {
  const source = command();
  const before = JSON.stringify(source);
  const payload = atomicItemStartRpcPayload(source);
  payload.p_expected_attempt_count = 99;

  return expectScenario("source payload immutability", JSON.stringify(source) === before, JSON.stringify(redactPayload(payload)));
}

function expectNoMethods(
  name: string,
  forbidden: readonly string[],
): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentActivationExecutionItemStartRepository.prototype as Record<string, unknown>;
  return expectScenario(name, forbidden.every((method) => !(method in prototype)), forbidden.filter((method) => method in prototype).join(","));
}

function query() {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  };
}

function command(input: Partial<DeploymentActivationExecutionAtomicItemStartCommand> = {}): DeploymentActivationExecutionAtomicItemStartCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    claimantId: CLAIMANT_ID,
    ownershipToken: OWNERSHIP_TOKEN,
    expectedLeaseExpiresAt: ACTIVE_LEASE,
    itemId: ITEM_ID,
    executionItemKey: EXECUTION_ITEM_KEY,
    planItemKey: PLAN_ITEM_KEY,
    expectedSequence: 1,
    expectedAction: "activate",
    expectedEntityType: "clinic",
    expectedEntityKey: CLINIC_ID,
    proposedStartedAt: STARTED_AT,
    expectedAttemptCount: 0,
    ...input,
  };
}

function sessionRow(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: input.id ?? SESSION_ID,
    clinic_id: input.clinic_id ?? CLINIC_ID,
    deployment_run_key: input.deployment_run_key ?? DEPLOYMENT_RUN_KEY,
    execution_key: input.execution_key ?? EXECUTION_KEY,
    execution_status: input.execution_status ?? "running",
    execution_owner: input.execution_owner ?? CLAIMANT_ID,
    ownership_token: input.ownership_token ?? OWNERSHIP_TOKEN,
    lease_expires_at: input.lease_expires_at ?? ACTIVE_LEASE,
    started_at: input.started_at ?? "2026-01-01T11:59:00.000Z",
    completed_at: input.completed_at ?? null,
    failed_at: input.failed_at ?? null,
    items_requested: input.items_requested ?? 3,
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function itemRow(input: Partial<ItemStartItemRow> = {}): ItemStartItemRow {
  return {
    id: input.id ?? ITEM_ID,
    session_id: input.session_id ?? SESSION_ID,
    execution_item_key: input.execution_item_key ?? EXECUTION_ITEM_KEY,
    plan_item_key: input.plan_item_key ?? PLAN_ITEM_KEY,
    sequence: input.sequence ?? 1,
    dependency_level: input.dependency_level ?? 0,
    entity_type: input.entity_type ?? "clinic",
    deployment_key: input.deployment_key ?? CLINIC_ID,
    entity_id: input.entity_id ?? "clinic-row-0001",
    action: input.action ?? "activate",
    execution_status: input.execution_status ?? "ready",
    attempt_count: input.attempt_count ?? 0,
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    rolled_back_at: input.rolled_back_at ?? null,
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
    dependency_keys: input.dependency_keys ?? [],
    reversible: input.reversible ?? true,
    rollback_action: input.rollback_action ?? "restore clinic",
    expected_current_state: input.expected_current_state ?? { deploymentStatus: "draft" },
    target_state: input.target_state ?? { deploymentStatus: "deployed" },
  };
}

function rpcRow(input: Partial<Record<keyof ReturnType<typeof baseRpcRow>, unknown>> = {}) {
  return { ...baseRpcRow(), ...input };
}

function baseRpcRow() {
  return {
    status: "started",
    session_id: SESSION_ID,
    execution_key: EXECUTION_KEY,
    item_id: ITEM_ID,
    execution_item_key: EXECUTION_ITEM_KEY,
    plan_item_key: PLAN_ITEM_KEY,
    sequence: 1,
    action: "activate",
    entity_type: "clinic",
    entity_key: CLINIC_ID,
    execution_status: "running",
    attempt_count: 1,
    started_at: STARTED_AT,
    lease_expires_at: ACTIVE_LEASE,
    issue_code: null,
    message: "Activation execution item was started. No activation action was executed.",
  };
}

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, p_ownership_token: "[redacted]" };
}

class MockSupabaseClient {
  readonly calls: Array<{ table: string; operation: string }> = [];
  readonly rpcCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];

  constructor(
    readonly tables: Record<string, unknown[]> = {},
    readonly rpcResults: Record<string, unknown> = {},
    readonly error: { message: string; code?: string } | null = null,
  ) {}

  from(table: string): MockQuery {
    return new MockQuery(this, table);
  }

  async rpc(name: string, payload: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
    this.rpcCalls.push({ name, payload });
    return { data: this.rpcResults[name] ?? null, error: this.error };
  }
}

class MockQuery {
  private readonly filters: Array<{ key: string; value: unknown }> = [];
  private readonly orders: Array<{ key: string; ascending: boolean }> = [];
  private limitCount: number | null = null;

  constructor(private readonly client: MockSupabaseClient, private readonly table: string) {}

  select(_columns: string): this { return this; }
  eq(key: string, value: unknown): this { this.filters.push({ key, value }); return this; }
  order(key: string, input: { ascending: boolean }): this { this.orders.push({ key, ascending: input.ascending }); return this; }
  limit(count: number): this { this.limitCount = count; return this; }

  then<TResult1 = { data: unknown[]; error: { message: string; code?: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: { message: string; code?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.executeMany()).then(onfulfilled, onrejected);
  }

  private executeMany(): { data: unknown[]; error: { message: string; code?: string } | null } {
    this.client.calls.push({ table: this.table, operation: "select" });

    if (this.client.error) {
      return { data: [], error: this.client.error };
    }

    let rows = [...(this.client.tables[this.table] ?? [])] as Array<Record<string, unknown>>;

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.key] === filter.value);
    }

    for (const order of [...this.orders].reverse()) {
      rows.sort((left, right) => {
        const leftValue = left[order.key];
        const rightValue = right[order.key];
        const compared = typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
        return order.ascending ? compared : -compared;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionItemStartSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}