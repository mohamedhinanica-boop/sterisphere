import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateStartItems,
  assertAtMostOne,
  atomicStartRpcPayload,
  mapAtomicStartRpcResult,
  mapStartSessionRow,
  SupabaseDeploymentActivationExecutionStartRepository,
  type StartItemRow,
} from "./deployment-activation-execution-start-supabase-repository";
import type {
  DeploymentActivationExecutionAtomicStartCommand,
} from "./deployment-activation-execution-start-types";

export interface DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionStartSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-start-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-start-0001";
const SESSION_ID = "activation-execution-session-start-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-start-0001";
const PLAN_KEY = "activation-plan-deployment-run-start-0001";
const CLAIMANT_ID = "executor-start-001";
const OWNERSHIP_TOKEN = "sensitive-start-token";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const STARTED_AT = "2026-01-01T12:00:00.000Z";

export async function runDeploymentActivationExecutionStartSupabaseRepositoryHarness(): Promise<DeploymentActivationExecutionStartSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSnapshotSessionMapping(),
    scenarioItemAggregateMapping(),
    scenarioOneRunningItemAggregateMapping(),
    await scenarioDeterministicItemOrdering(),
    await scenarioMissingSession(),
    scenarioAmbiguousSessionLookup(),
    scenarioFreshAtomicStartPayload(),
    scenarioOwnerTokenLeaseCompareAndSetPayload(),
    scenarioProposedStartTimestampPayload(),
    await scenarioStartedRpcMapping(),
    scenarioAlreadyStartedMapping(),
    scenarioBlockedMapping(),
    scenarioConflictMapping(),
    scenarioNotFoundMapping(),
    scenarioMalformedRpcResponse(),
    await scenarioRepositoryErrorSanitization(),
    scenarioTokenRedaction(),
    scenarioSessionOnlyMutationBoundary(),
    scenarioNoGenericMutationMethods(),
    scenarioNoItemMutationMethods(),
    await scenarioSourceImmutability(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioSnapshotSessionMapping(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const mapped = mapStartSessionRow(sessionRow());

  return expectScenario(
    "start session row mapping",
    mapped.id === SESSION_ID &&
      mapped.deploymentRunId === DEPLOYMENT_RUN_KEY &&
      mapped.executionOwner === CLAIMANT_ID &&
      mapped.leaseExpiresAt === ACTIVE_LEASE,
    JSON.stringify(mapped),
  );
}

function scenarioItemAggregateMapping(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const aggregation = aggregateStartItems([
    itemRow({ sequence: 2, execution_item_key: "b", execution_status: "pending", dependency_keys: ["a"] }),
    itemRow({ sequence: 1, execution_item_key: "a", execution_status: "ready", dependency_keys: [] }),
    itemRow({ sequence: 3, execution_item_key: "b", plan_item_key: "duplicate", execution_status: "running", attempt_count: 1, started_at: STARTED_AT, rolled_back_at: STARTED_AT }),
  ]);

  return expectScenario(
    "item aggregate maps lifecycle and duplicate evidence",
    aggregation.durableItemCount === 3 &&
      aggregation.readyItemCount === 1 &&
      aggregation.pendingItemCount === 1 &&
      aggregation.invalidStatusCount === 1 &&
      aggregation.attemptedItemCount === 1 &&
      aggregation.itemExecutionTimestampCount === 1 &&
      aggregation.rollbackTimestampCount === 1 &&
      aggregation.duplicateExecutionItemKeyCount === 1 &&
      aggregation.readyRootCount === 1 &&
      aggregation.firstSequence === 1 &&
      aggregation.firstItemStatus === "ready",
    JSON.stringify(aggregation),
  );
}

function scenarioOneRunningItemAggregateMapping(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const aggregation = aggregateStartItems([
    itemRow({
      sequence: 1,
      execution_item_key: "a",
      execution_status: "running",
      attempt_count: 1,
      started_at: STARTED_AT,
      dependency_keys: [],
    }),
    itemRow({ sequence: 2, execution_item_key: "b", execution_status: "pending", dependency_keys: ["a"] }),
    itemRow({ sequence: 3, execution_item_key: "c", execution_status: "pending", dependency_keys: ["b"] }),
  ]);

  return expectScenario(
    "one running item aggregate maps reuse evidence",
    aggregation.durableItemCount === 3 &&
      aggregation.readyItemCount === 0 &&
      aggregation.pendingItemCount === 2 &&
      aggregation.runningItemCount === 1 &&
      aggregation.terminalItemCount === 0 &&
      aggregation.runningItemsWithAttemptOne === 1 &&
      aggregation.runningItemsWithValidStartedAt === 1 &&
      aggregation.attemptedItemCount === 1 &&
      aggregation.itemExecutionTimestampCount === 1 &&
      aggregation.pendingItemsWithAttempts === 0 &&
      aggregation.pendingItemsWithExecutionTimestamps === 0 &&
      aggregation.firstItemStatus === "running",
    JSON.stringify(aggregation),
  );
}
async function scenarioDeterministicItemOrdering(): Promise<DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({
    deployment_activation_execution_sessions: [sessionRow()],
    deployment_activation_execution_items: [
      itemRow({ id: "item-2", sequence: 2, execution_item_key: "b", execution_status: "pending", dependency_keys: ["a"] }),
      itemRow({ id: "item-1", sequence: 1, execution_item_key: "a" }),
    ],
  });
  const repository = new SupabaseDeploymentActivationExecutionStartRepository(client as unknown as SupabaseClient);
  const snapshot = await repository.loadExecutionStartSnapshot({
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  });

  return expectScenario(
    "snapshot read maps deterministic item ordering",
    snapshot.session?.id === SESSION_ID &&
      snapshot.itemIntegrity.durableItemCount === 2 &&
      snapshot.itemIntegrity.firstSequence === 1 &&
      snapshot.itemIntegrity.firstItemStatus === "ready",
    JSON.stringify(snapshot),
  );
}

async function scenarioMissingSession(): Promise<DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionStartRepository(
    new MockSupabaseClient({}) as unknown as SupabaseClient,
  );
  const snapshot = await repository.loadExecutionStartSnapshot({
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  });

  return expectScenario(
    "missing session returns empty start snapshot",
    snapshot.session === null && snapshot.itemIntegrity.durableItemCount === 0,
    JSON.stringify(snapshot),
  );
}

function scenarioAmbiguousSessionLookup(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  try {
    assertAtMostOne([{}, {}], "start session");
  } catch (error) {
    return expectScenario(
      "ambiguous session lookup blocks deterministic mapping",
      error instanceof Error && error.message.includes("Ambiguous start session"),
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario("ambiguous session lookup blocks deterministic mapping", false, "duplicate accepted");
}

function scenarioFreshAtomicStartPayload(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const payload = atomicStartRpcPayload(startCommand());

  return expectScenario(
    "fresh atomic start payload",
    payload.p_clinic_id === CLINIC_ID &&
      payload.p_deployment_run_key === DEPLOYMENT_RUN_KEY &&
      payload.p_session_id === SESSION_ID &&
      payload.p_execution_key === EXECUTION_KEY,
    JSON.stringify(payload),
  );
}

function scenarioOwnerTokenLeaseCompareAndSetPayload(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const payload = atomicStartRpcPayload(startCommand());

  return expectScenario(
    "owner token lease compare-and-set payload",
    payload.p_claimant_id === CLAIMANT_ID &&
      payload.p_ownership_token === OWNERSHIP_TOKEN &&
      payload.p_expected_lease_expires_at === ACTIVE_LEASE &&
      !Object.prototype.hasOwnProperty.call(payload, "p_new_ownership_token") &&
      !Object.prototype.hasOwnProperty.call(payload, "p_lease_renewal"),
    JSON.stringify({ ...payload, p_ownership_token: "[redacted]" }),
  );
}

function scenarioProposedStartTimestampPayload(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const payload = atomicStartRpcPayload(startCommand());

  return expectScenario(
    "proposed start timestamp payload",
    payload.p_proposed_started_at === STARTED_AT &&
      payload.p_expected_item_count === 3,
    JSON.stringify(payload),
  );
}

async function scenarioStartedRpcMapping(): Promise<DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({}, {
    start_deployment_activation_execution_session: [rpcRow({ status: "started" })],
  });
  const repository = new SupabaseDeploymentActivationExecutionStartRepository(client as unknown as SupabaseClient);
  const result = await repository.startClaimedExecutionSessionAtomically(startCommand());
  const rpcCall = client.rpcCalls[0];

  return expectScenario(
    "started response mapping",
    result.ok &&
      result.status === "started" &&
      result.startedAt === STARTED_AT &&
      rpcCall.name === "start_deployment_activation_execution_session" &&
      client.calls.every((call) => call.operation === "select"),
    JSON.stringify({ result, rpcCall: { ...rpcCall, payload: { ...rpcCall.payload, p_ownership_token: "[redacted]" } } }),
  );
}

function scenarioAlreadyStartedMapping(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const result = mapAtomicStartRpcResult(rpcRow({ status: "already_started", execution_status: "running" }));

  return expectScenario(
    "already-started mapping",
    result.ok && result.status === "already_started" && result.executionStatus === "running",
    JSON.stringify(result),
  );
}

function scenarioBlockedMapping(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const result = mapAtomicStartRpcResult(rpcRow({ status: "blocked", issue_code: "item_integrity_invalid" }));

  return expectScenario(
    "blocked response mapping",
    !result.ok && result.status === "blocked" && result.issueCode === "item_integrity_invalid",
    JSON.stringify(result),
  );
}

function scenarioConflictMapping(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const result = mapAtomicStartRpcResult(rpcRow({ status: "conflict", issue_code: "ownership_compare_failed", message: "Ownership compare-and-set failed." }));

  return expectScenario(
    "conflict response mapping",
    !result.ok && result.status === "conflict" && !result.message.includes(OWNERSHIP_TOKEN),
    JSON.stringify(result),
  );
}

function scenarioNotFoundMapping(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const result = mapAtomicStartRpcResult(rpcRow({ status: "not_found", session_id: null, execution_owner: null }));

  return expectScenario(
    "not-found response mapping",
    !result.ok && result.status === "not_found" && result.sessionId === null,
    JSON.stringify(result),
  );
}

function scenarioMalformedRpcResponse(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  try {
    mapAtomicStartRpcResult(rpcRow({ status: "surprise" }));
  } catch (error) {
    return expectScenario(
      "malformed RPC response becomes safe repository error",
      error instanceof Error &&
        error.name === "DeploymentActivationExecutionStartRepositoryError",
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario("malformed RPC response becomes safe repository error", false, "malformed accepted");
}

async function scenarioRepositoryErrorSanitization(): Promise<DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionStartRepository(
    new MockSupabaseClient({}, {}, { message: `database failed ${OWNERSHIP_TOKEN}`, code: "PGRST000" }) as unknown as SupabaseClient,
  );

  try {
    await repository.loadExecutionStartSnapshot({
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_KEY,
      sessionId: SESSION_ID,
      executionKey: EXECUTION_KEY,
    });
  } catch (error) {
    return expectScenario(
      "repository error sanitization",
      error instanceof Error &&
        !error.message.includes(OWNERSHIP_TOKEN),
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario("repository error sanitization", false, "error not thrown");
}

function scenarioTokenRedaction(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const payload = atomicStartRpcPayload(startCommand());
  const result = mapAtomicStartRpcResult(rpcRow({ status: "conflict", message: "Ownership compare-and-set failed." }));

  return expectScenario(
    "token remains internal payload evidence only",
    payload.p_ownership_token === OWNERSHIP_TOKEN &&
      !result.message.includes(OWNERSHIP_TOKEN) &&
      !JSON.stringify(result).includes(OWNERSHIP_TOKEN),
    JSON.stringify(result),
  );
}

function scenarioSessionOnlyMutationBoundary(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const payload = atomicStartRpcPayload(startCommand());

  return expectScenario(
    "session-only mutation boundary payload",
    !Object.keys(payload).some((key) => key.includes("item") && key !== "p_expected_item_count") &&
      !Object.prototype.hasOwnProperty.call(payload, "p_attempt_count") &&
      !Object.prototype.hasOwnProperty.call(payload, "p_item_started_at"),
    JSON.stringify(payload),
  );
}

function scenarioNoGenericMutationMethods(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentActivationExecutionStartRepository.prototype as Record<string, unknown>;
  const forbidden = ["update", "insert", "upsert", "delete", "patch"];

  return expectScenario(
    "no generic mutation methods",
    forbidden.every((name) => !(name in prototype)),
    forbidden.filter((name) => name in prototype).join(","),
  );
}

function scenarioNoItemMutationMethods(): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentActivationExecutionStartRepository.prototype as Record<string, unknown>;
  const forbidden = ["startItem", "claimItem", "incrementAttempt", "completeItem", "failItem", "rollbackItem"];

  return expectScenario(
    "no item mutation methods",
    forbidden.every((name) => !(name in prototype)),
    forbidden.filter((name) => name in prototype).join(","),
  );
}

async function scenarioSourceImmutability(): Promise<DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario> {
  const rows = {
    deployment_activation_execution_sessions: [sessionRow()],
    deployment_activation_execution_items: [itemRow()],
  };
  const before = JSON.stringify(rows);
  const repository = new SupabaseDeploymentActivationExecutionStartRepository(
    new MockSupabaseClient(rows) as unknown as SupabaseClient,
  );
  await repository.loadExecutionStartSnapshot({
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  });

  return expectScenario(
    "source rows remain immutable",
    JSON.stringify(rows) === before,
    JSON.stringify(rows),
  );
}

function startCommand(input: Partial<DeploymentActivationExecutionAtomicStartCommand> = {}): DeploymentActivationExecutionAtomicStartCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    claimantId: CLAIMANT_ID,
    ownershipToken: OWNERSHIP_TOKEN,
    expectedLeaseExpiresAt: ACTIVE_LEASE,
    proposedStartedAt: STARTED_AT,
    expectedItemCount: 3,
    ...input,
  };
}

function sessionRow(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: input.id ?? SESSION_ID,
    clinic_id: input.clinic_id ?? CLINIC_ID,
    deployment_run_key: input.deployment_run_key ?? DEPLOYMENT_RUN_KEY,
    execution_key: input.execution_key ?? EXECUTION_KEY,
    plan_key: input.plan_key ?? PLAN_KEY,
    execution_owner: input.execution_owner ?? CLAIMANT_ID,
    ownership_token: input.ownership_token ?? OWNERSHIP_TOKEN,
    lease_expires_at: input.lease_expires_at ?? ACTIVE_LEASE,
    preparation_status: input.preparation_status ?? "ready",
    execution_status: input.execution_status ?? "claimed",
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    failed_at: input.failed_at ?? null,
    items_requested: input.items_requested ?? 3,
    items_ready: input.items_ready ?? 1,
    items_pending: input.items_pending ?? 2,
    items_blocked: input.items_blocked ?? 0,
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function itemRow(input: Partial<StartItemRow> = {}): StartItemRow {
  return {
    id: input.id ?? "activation-execution-item-start-0001",
    execution_item_key: input.execution_item_key ?? `${EXECUTION_KEY}:${PLAN_KEY}:clinic`,
    plan_item_key: input.plan_item_key ?? `${PLAN_KEY}:clinic`,
    sequence: input.sequence ?? 1,
    dependency_keys: input.dependency_keys ?? [],
    execution_status: input.execution_status ?? "ready",
    attempt_count: input.attempt_count ?? 0,
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    rolled_back_at: input.rolled_back_at ?? null,
  };
}

function rpcRow(input: Partial<Record<keyof ReturnType<typeof baseRpcRow>, unknown>> = {}) {
  return {
    ...baseRpcRow(),
    ...input,
  };
}

function baseRpcRow() {
  return {
    status: "started",
    session_id: SESSION_ID,
    execution_key: EXECUTION_KEY,
    execution_owner: CLAIMANT_ID,
    lease_expires_at: ACTIVE_LEASE,
    execution_status: "running",
    started_at: STARTED_AT,
    item_count: 3,
    issue_code: null,
    message: "Activation execution session was started. No execution items were started.",
  };
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

  constructor(
    private readonly client: MockSupabaseClient,
    private readonly table: string,
  ) {}

  select(_columns: string): this {
    return this;
  }

  eq(key: string, value: unknown): this {
    this.filters.push({ key, value });
    return this;
  }

  order(key: string, input: { ascending: boolean }): this {
    this.orders.push({ key, ascending: input.ascending });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

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
        const compared = String(left[order.key] ?? "").localeCompare(String(right[order.key] ?? ""));
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
): DeploymentActivationExecutionStartSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}