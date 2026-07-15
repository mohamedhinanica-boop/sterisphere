import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateItemCompletionItems,
  assertAtMostOne,
  itemCompletionRpcPayload,
  mapItemCompletionItemRow,
  mapItemCompletionRpcResult,
  mapItemCompletionSessionRow,
  selectCompletionItem,
  SupabaseDeploymentActivationExecutionItemCompletionRepository,
  type ItemCompletionItemRow,
} from "./deployment-activation-execution-item-completion-supabase-repository";
import type {
  DeploymentActivationExecutionAtomicItemCompletionCommand,
} from "./deployment-activation-execution-item-completion-types";

export interface DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-item-completion-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-item-completion-0001";
const SESSION_ID = "activation-execution-session-item-completion-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-item-completion-0001";
const PLAN_KEY = "activation-plan-deployment-run-item-completion-0001";
const ITEM_ID = "activation-execution-item-completion-0001";
const EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:${PLAN_KEY}:clinic`;
const PLAN_ITEM_KEY = `${PLAN_KEY}:clinic`;
const CLAIMANT_ID = "executor-item-completion-001";
const OWNERSHIP_TOKEN = "sensitive-item-completion-token";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const STARTED_AT = "2026-01-01T12:00:30.000Z";
const COMPLETED_AT = "2026-01-01T12:02:00.000Z";

export async function runDeploymentActivationExecutionItemCompletionSupabaseRepositoryHarness(): Promise<DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSnapshotSessionMapping(),
    scenarioItemMapping(),
    scenarioAggregateCounts(),
    await scenarioLoadSnapshot(),
    await scenarioMissingSession(),
    scenarioDuplicateItemIdentityProtection(),
    scenarioRpcPayloadShape(),
    scenarioCompareAndSetPayload(),
    scenarioCompletionTimestampPayload(),
    await scenarioCompletedRpcMapping(),
    scenarioAlreadyCompletedMapping(),
    scenarioBlockedMapping(),
    scenarioConflictMapping(),
    scenarioNotFoundMapping(),
    scenarioMalformedRpcResponse(),
    await scenarioUnexpectedRpcStatus(),
    await scenarioMultipleRpcRows(),
    await scenarioSupabaseErrorSanitization(),
    scenarioTokenRedaction(),
    scenarioNoGenericMutationFallback(),
    scenarioNoDependencyProgressionMethods(),
    scenarioNoSessionFinalizationMethods(),
    await scenarioSourcePayloadImmutability(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioSnapshotSessionMapping(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const mapped = mapItemCompletionSessionRow(sessionRow());

  return expectScenario(
    "snapshot session mapping",
    mapped.sessionId === SESSION_ID &&
      mapped.executionStatus === "running" &&
      mapped.executionOwner === CLAIMANT_ID &&
      mapped.itemsRequested === 3,
    JSON.stringify(redact(mapped)),
  );
}

function scenarioItemMapping(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const mapped = mapItemCompletionItemRow(itemRow());

  return expectScenario(
    "item mapping",
    mapped?.itemId === ITEM_ID &&
      mapped.sequence === 1 &&
      mapped.executionStatus === "running" &&
      mapped.attemptCount === 1 &&
      mapped.startedAt === STARTED_AT &&
      mapped.targetState?.deploymentStatus === "deployed",
    JSON.stringify(mapped),
  );
}

function scenarioAggregateCounts(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const aggregate = aggregateItemCompletionItems([
    itemRow(),
    itemRow({ id: "item-2", execution_item_key: "b", plan_item_key: "plan-b", sequence: 2, execution_status: "pending" }),
    itemRow({ id: "item-3", execution_item_key: "c", plan_item_key: "plan-c", sequence: 3, execution_status: "pending" }),
  ]);

  return expectScenario(
    "aggregate counts",
    aggregate.totalItemCount === 3 &&
      aggregate.runningItemCount === 1 &&
      aggregate.pendingItemCount === 2 &&
      aggregate.attemptedItemCount === 1 &&
      aggregate.timestampedItemCount === 1,
    JSON.stringify(aggregate),
  );
}

async function scenarioLoadSnapshot(): Promise<DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient(tables());
  const repository = new SupabaseDeploymentActivationExecutionItemCompletionRepository(client as unknown as SupabaseClient);
  const snapshot = await repository.loadExecutionItemCompletionSnapshot(query());

  return expectScenario(
    "load snapshot",
    snapshot.session?.sessionId === SESSION_ID &&
      snapshot.item?.itemId === ITEM_ID &&
      snapshot.clinic?.clinicId === CLINIC_ID &&
      snapshot.aggregate.totalItemCount === 3 &&
      client.calls.filter((call) => call.operation === "select").length === 3,
    JSON.stringify(redact(snapshot)),
  );
}

async function scenarioMissingSession(): Promise<DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionItemCompletionRepository(new MockSupabaseClient({}) as unknown as SupabaseClient);
  const snapshot = await repository.loadExecutionItemCompletionSnapshot(query());

  return expectScenario(
    "missing session",
    snapshot.session === null && snapshot.item === null && snapshot.clinic === null && snapshot.aggregate.totalItemCount === 0,
    JSON.stringify(snapshot),
  );
}

function scenarioDuplicateItemIdentityProtection(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  return expectThrows(
    "duplicate item identity protection",
    () => selectCompletionItem([itemRow(), itemRow({ id: ITEM_ID })], query()),
    "Ambiguous activation execution item-completion item",
  );
}

function scenarioRpcPayloadShape(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const payload = itemCompletionRpcPayload(command());

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

function scenarioCompareAndSetPayload(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const payload = itemCompletionRpcPayload(command());

  return expectScenario(
    "compare-and-set payload",
    payload.p_claimant_id === CLAIMANT_ID &&
      payload.p_ownership_token === OWNERSHIP_TOKEN &&
      payload.p_expected_lease_expires_at === ACTIVE_LEASE &&
      payload.p_item_id === ITEM_ID &&
      payload.p_execution_item_key === EXECUTION_ITEM_KEY &&
      payload.p_plan_item_key === PLAN_ITEM_KEY &&
      payload.p_expected_sequence === 1 &&
      payload.p_expected_entity_type === "clinic" &&
      payload.p_expected_action === "activate" &&
      payload.p_expected_started_at === STARTED_AT &&
      payload.p_expected_attempt_count === 1,
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioCompletionTimestampPayload(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const payload = itemCompletionRpcPayload(command());

  return expectScenario(
    "completion timestamp payload",
    payload.p_proposed_completed_at === COMPLETED_AT &&
      !Object.prototype.hasOwnProperty.call(payload, "p_dependency_progression") &&
      !Object.prototype.hasOwnProperty.call(payload, "p_session_completed_at"),
    JSON.stringify(redactPayload(payload)),
  );
}

async function scenarioCompletedRpcMapping(): Promise<DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({}, { complete_deployment_activation_execution_item: [rpcRow({ status: "completed" })] });
  const repository = new SupabaseDeploymentActivationExecutionItemCompletionRepository(client as unknown as SupabaseClient);
  const result = await repository.completeExecutionItemAtomically(command());
  const rpcCall = client.rpcCalls[0];

  return expectScenario(
    "completed RPC mapping",
    result.ok &&
      result.status === "completed" &&
      result.executionStatusBefore === "running" &&
      result.executionStatusAfter === "succeeded" &&
      result.completedAt === COMPLETED_AT &&
      rpcCall.name === "complete_deployment_activation_execution_item",
    JSON.stringify({ result, rpcCall: { ...rpcCall, payload: redactPayload(rpcCall.payload) } }),
  );
}

function scenarioAlreadyCompletedMapping(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const result = mapItemCompletionRpcResult(rpcRow({ status: "already_completed", execution_status_before: "succeeded", execution_status_after: "succeeded" }));
  return expectScenario("already completed mapping", result.ok && result.status === "already_completed", JSON.stringify(result));
}

function scenarioBlockedMapping(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const result = mapItemCompletionRpcResult(rpcRow({ status: "blocked", issue_code: "lease_expired" }));
  return expectScenario("blocked mapping", !result.ok && result.status === "blocked" && result.issueCode === "lease_expired", JSON.stringify(result));
}

function scenarioConflictMapping(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const result = mapItemCompletionRpcResult(rpcRow({ status: "conflict", issue_code: "ownership_conflict" }));
  return expectScenario("conflict mapping", !result.ok && result.status === "conflict", JSON.stringify(result));
}

function scenarioNotFoundMapping(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const result = mapItemCompletionRpcResult(rpcRow({ status: "not_found", item_id: null }));
  return expectScenario("not found mapping", !result.ok && result.status === "not_found" && result.itemId === null, JSON.stringify(result));
}

function scenarioMalformedRpcResponse(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  return expectThrows("malformed RPC response", () => mapItemCompletionRpcResult(rpcRow({ status: "surprise" })), "Malformed activation execution item-completion RPC status");
}

async function scenarioUnexpectedRpcStatus(): Promise<DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionItemCompletionRepository(new MockSupabaseClient({}, {
    complete_deployment_activation_execution_item: [rpcRow({ status: "unexpected" })],
  }) as unknown as SupabaseClient);

  try {
    await repository.completeExecutionItemAtomically(command());
  } catch (error) {
    return expectScenario("unexpected RPC status", error instanceof Error && !String(error).includes(OWNERSHIP_TOKEN), String(error));
  }

  return expectScenario("unexpected RPC status", false, "unexpected status accepted");
}

async function scenarioMultipleRpcRows(): Promise<DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionItemCompletionRepository(new MockSupabaseClient({}, {
    complete_deployment_activation_execution_item: [rpcRow(), rpcRow()],
  }) as unknown as SupabaseClient);

  try {
    await repository.completeExecutionItemAtomically(command());
  } catch (error) {
    return expectScenario("multiple RPC rows", error instanceof Error && String(error).includes("Ambiguous"), String(error));
  }

  return expectScenario("multiple RPC rows", false, "multiple rows accepted");
}

async function scenarioSupabaseErrorSanitization(): Promise<DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionItemCompletionRepository(new MockSupabaseClient({}, {}, {
    message: `database failed ${OWNERSHIP_TOKEN}`,
    code: "PGRST000",
  }) as unknown as SupabaseClient);

  try {
    await repository.completeExecutionItemAtomically(command());
  } catch (error) {
    return expectScenario("Supabase error sanitization", error instanceof Error && !error.message.includes(OWNERSHIP_TOKEN), String(error));
  }

  return expectScenario("Supabase error sanitization", false, "error not thrown");
}

function scenarioTokenRedaction(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const payload = itemCompletionRpcPayload(command());
  const result = mapItemCompletionRpcResult(rpcRow({ status: "conflict", message: "Ownership compare-and-set failed." }));

  return expectScenario(
    "token redaction",
    payload.p_ownership_token === OWNERSHIP_TOKEN &&
      !JSON.stringify(result).includes(OWNERSHIP_TOKEN) &&
      !result.message.includes(OWNERSHIP_TOKEN),
    JSON.stringify(result),
  );
}

function scenarioNoGenericMutationFallback(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no generic mutation fallback", ["update", "insert", "upsert", "delete", "patch", "save"]);
}

function scenarioNoDependencyProgressionMethods(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no dependency progression methods", ["unlockDependencies", "unlockDependentItems", "startNextItem", "progressDependencies"]);
}

function scenarioNoSessionFinalizationMethods(): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no session finalization methods", ["finalizeDeployment", "completeSession", "markSessionSucceeded", "finishExecution"]);
}

async function scenarioSourcePayloadImmutability(): Promise<DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario> {
  const source = command();
  const before = JSON.stringify(source);
  const payload = itemCompletionRpcPayload(source);
  payload.p_expected_attempt_count = 99;

  return expectScenario("source payload immutability", JSON.stringify(source) === before, JSON.stringify(redactPayload(payload)));
}

function expectNoMethods(
  name: string,
  forbidden: readonly string[],
): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentActivationExecutionItemCompletionRepository.prototype as Record<string, unknown>;
  return expectScenario(name, forbidden.every((method) => !(method in prototype)), forbidden.filter((method) => method in prototype).join(","));
}

function expectThrows(
  name: string,
  action: () => unknown,
  expected: string,
): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  try {
    action();
  } catch (error) {
    return expectScenario(name, error instanceof Error && error.message.includes(expected), error instanceof Error ? error.message : String(error));
  }

  return expectScenario(name, false, "expected exception was not thrown");
}

function query() {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    itemId: ITEM_ID,
    executionItemKey: EXECUTION_ITEM_KEY,
    planItemKey: PLAN_ITEM_KEY,
  };
}

function command(input: Partial<DeploymentActivationExecutionAtomicItemCompletionCommand> = {}): DeploymentActivationExecutionAtomicItemCompletionCommand {
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
    expectedEntityType: "clinic",
    expectedAction: "activate",
    expectedStartedAt: STARTED_AT,
    expectedAttemptCount: 1,
    proposedCompletedAt: COMPLETED_AT,
    ...input,
  };
}

function tables() {
  return {
    deployment_activation_execution_sessions: [sessionRow()],
    deployment_activation_execution_items: [
      itemRow(),
      itemRow({ id: "item-2", execution_item_key: "b", plan_item_key: "plan-b", sequence: 2, execution_status: "pending" }),
      itemRow({ id: "item-3", execution_item_key: "c", plan_item_key: "plan-c", sequence: 3, execution_status: "pending" }),
    ],
    clinics: [clinicRow()],
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

function itemRow(input: Partial<ItemCompletionItemRow> = {}): ItemCompletionItemRow {
  return {
    id: input.id ?? ITEM_ID,
    session_id: input.session_id ?? SESSION_ID,
    execution_item_key: input.execution_item_key ?? EXECUTION_ITEM_KEY,
    plan_item_key: input.plan_item_key ?? PLAN_ITEM_KEY,
    sequence: input.sequence ?? 1,
    entity_type: input.entity_type ?? "clinic",
    entity_id: input.entity_id ?? CLINIC_ID,
    action: input.action ?? "activate",
    execution_status: input.execution_status ?? "running",
    attempt_count: input.attempt_count ?? 1,
    started_at: input.started_at ?? STARTED_AT,
    completed_at: input.completed_at ?? null,
    rolled_back_at: input.rolled_back_at ?? null,
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
    dependency_keys: input.dependency_keys ?? [],
    expected_current_state: input.expected_current_state ?? { clinicId: CLINIC_ID, deploymentStatus: "draft" },
    target_state: input.target_state ?? { deploymentStatus: "deployed" },
  };
}

function clinicRow(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: input.id ?? CLINIC_ID,
    deployment_status: input.deployment_status ?? "deployed",
    deployed_at: input.deployed_at ?? "2026-01-01T12:01:00.000Z",
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function rpcRow(input: Partial<Record<keyof ReturnType<typeof baseRpcRow>, unknown>> = {}) {
  return { ...baseRpcRow(), ...input };
}

function baseRpcRow() {
  return {
    status: "completed",
    claimant_id: CLAIMANT_ID,
    clinic_id: CLINIC_ID,
    deployment_run_key: DEPLOYMENT_RUN_KEY,
    session_id: SESSION_ID,
    execution_key: EXECUTION_KEY,
    item_id: ITEM_ID,
    execution_item_key: EXECUTION_ITEM_KEY,
    plan_item_key: PLAN_ITEM_KEY,
    sequence: 1,
    entity_type: "clinic",
    action: "activate",
    started_at: STARTED_AT,
    completed_at: COMPLETED_AT,
    attempt_count: 1,
    execution_status_before: "running",
    execution_status_after: "succeeded",
    issue_code: null,
    message: "Activation execution item was completed. Dependency progression was not attempted.",
  };
}

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, p_ownership_token: "[redacted]" };
}

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => key === "ownershipToken" ? "[redacted]" : entry));
}

class MockSupabaseClient {
  readonly calls: Array<{ table: string; operation: string }> = [];
  readonly rpcCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];

  constructor(
    readonly tableRows: Record<string, unknown[]> = {},
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

    let rows = [...(this.client.tableRows[this.table] ?? [])] as Array<Record<string, unknown>>;

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
): DeploymentActivationExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}