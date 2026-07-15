import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateDependencyProgressionItems,
  assertAtMostOne,
  dependencyProgressionRpcPayload,
  mapDependencyProgressionItemRow,
  mapDependencyProgressionRpcResult,
  mapDependencyProgressionSessionRow,
  SupabaseDeploymentActivationExecutionDependencyProgressionRepository,
  type DependencyProgressionItemRow,
} from "./deployment-activation-execution-dependency-progression-supabase-repository";
import type {
  DeploymentActivationExecutionAtomicDependencyProgressionCommand,
} from "./deployment-activation-execution-dependency-progression-types";

export interface DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-dependency-progression-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-dependency-progression-0001";
const SESSION_ID = "activation-execution-session-dependency-progression-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-dependency-progression-0001";
const PLAN_KEY = "activation-plan-dependency-progression-0001";
const CLAIMANT_ID = "executor-dependency-progression-001";
const OWNERSHIP_TOKEN = "sensitive-dependency-progression-token";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const COMPLETED_ITEM_ID = "activation-execution-item-dependency-001";
const COMPLETED_EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:${PLAN_KEY}:clinic`;
const COMPLETED_PLAN_ITEM_KEY = `${PLAN_KEY}:clinic`;
const COMPLETED_STARTED_AT = "2026-01-01T12:00:00.000Z";
const COMPLETED_COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const NEXT_ITEM_ID = "activation-execution-item-dependency-002";
const NEXT_EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:${PLAN_KEY}:provider-001`;
const NEXT_PLAN_ITEM_KEY = `${PLAN_KEY}:provider-001`;
const PROGRESSED_AT = "2026-01-01T12:02:30.000Z";

export async function runDeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarness(): Promise<DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSnapshotSessionMapping(),
    scenarioItemMapping(),
    scenarioAggregateCounts(),
    scenarioMalformedDependencyAggregation(),
    await scenarioLoadSnapshotOrdering(),
    await scenarioMissingSession(),
    scenarioDuplicateIdentityProtection(),
    scenarioRpcPayloadShape(),
    scenarioOwnerTokenLeasePayload(),
    scenarioPredecessorIdentityPayload(),
    scenarioNextItemIdentityPayload(),
    scenarioDependencyPayloadImmutability(),
    await scenarioProgressedRpcMapping(),
    scenarioAlreadyProgressedMapping(),
    scenarioBlockedMapping(),
    scenarioConflictMapping(),
    scenarioNotFoundMapping(),
    scenarioMalformedRpcResponse(),
    await scenarioUnexpectedRpcStatus(),
    await scenarioMultipleRpcRows(),
    await scenarioSupabaseErrorSanitization(),
    scenarioTokenRedaction(),
    scenarioNoGenericMutationFallback(),
    scenarioNoItemStartMutation(),
    scenarioNoSessionCompletionMutation(),
    scenarioNoActivationMutation(),
    await scenarioSourceCommandImmutability(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioSnapshotSessionMapping(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const mapped = mapDependencyProgressionSessionRow(sessionRow());

  return expectScenario(
    "snapshot session mapping",
    mapped.sessionId === SESSION_ID &&
      mapped.executionStatus === "running" &&
      mapped.executionOwner === CLAIMANT_ID &&
      mapped.itemsRequested === 3 &&
      mapped.cancelledAt === null &&
      mapped.rolledBackAt === null,
    JSON.stringify(redact(mapped)),
  );
}

function scenarioItemMapping(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const mapped = mapDependencyProgressionItemRow(itemRow({ sequence: 2, id: NEXT_ITEM_ID, execution_item_key: NEXT_EXECUTION_ITEM_KEY, plan_item_key: NEXT_PLAN_ITEM_KEY, dependency_keys: [COMPLETED_PLAN_ITEM_KEY] }));

  return expectScenario(
    "item mapping",
    mapped.itemId === NEXT_ITEM_ID &&
      mapped.sequence === 2 &&
      mapped.entityId === "provider-001" &&
      mapped.dependencyKeys.length === 1 &&
      mapped.dependencyKeys[0] === COMPLETED_PLAN_ITEM_KEY &&
      mapped.rollbackBehavior === "restore planned inactive shell state",
    JSON.stringify(mapped),
  );
}

function scenarioAggregateCounts(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const aggregate = aggregateDependencyProgressionItems([
    completedItemRow(),
    itemRow({ id: NEXT_ITEM_ID, execution_item_key: NEXT_EXECUTION_ITEM_KEY, plan_item_key: NEXT_PLAN_ITEM_KEY, sequence: 2, dependency_keys: [COMPLETED_PLAN_ITEM_KEY] }),
    itemRow({ id: "item-3", execution_item_key: "c", plan_item_key: "plan-c", sequence: 3, dependency_keys: [NEXT_PLAN_ITEM_KEY] }),
  ]);

  return expectScenario(
    "aggregate counts",
    aggregate.totalItemCount === 3 &&
      aggregate.succeededItemCount === 1 &&
      aggregate.pendingItemCount === 2 &&
      aggregate.attemptedItemCount === 1 &&
      aggregate.timestampedItemCount === 1 &&
      aggregate.malformedDependencyCount === 0,
    JSON.stringify(aggregate),
  );
}

function scenarioMalformedDependencyAggregation(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const aggregate = aggregateDependencyProgressionItems([
    completedItemRow(),
    itemRow({ id: NEXT_ITEM_ID, execution_item_key: NEXT_EXECUTION_ITEM_KEY, plan_item_key: NEXT_PLAN_ITEM_KEY, sequence: 2, dependency_keys: [COMPLETED_PLAN_ITEM_KEY, 7] }),
  ]);

  return expectScenario("malformed dependency aggregation", aggregate.malformedDependencyCount === 1, JSON.stringify(aggregate));
}

async function scenarioLoadSnapshotOrdering(): Promise<DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({
    deployment_activation_execution_sessions: [sessionRow()],
    deployment_activation_execution_items: [
      itemRow({ id: "item-3", execution_item_key: "c", plan_item_key: "plan-c", sequence: 3, dependency_keys: [NEXT_PLAN_ITEM_KEY] }),
      itemRow({ id: NEXT_ITEM_ID, execution_item_key: NEXT_EXECUTION_ITEM_KEY, plan_item_key: NEXT_PLAN_ITEM_KEY, sequence: 2, dependency_keys: [COMPLETED_PLAN_ITEM_KEY] }),
      completedItemRow(),
    ],
  });
  const repository = new SupabaseDeploymentActivationExecutionDependencyProgressionRepository(client as unknown as SupabaseClient);
  const snapshot = await repository.loadDependencyProgressionSnapshot(query());

  return expectScenario(
    "load snapshot ordering",
    snapshot.session?.sessionId === SESSION_ID &&
      snapshot.items.map((item) => item.sequence).join(",") === "1,2,3" &&
      snapshot.items[1]?.dependencyKeys[0] === COMPLETED_PLAN_ITEM_KEY,
    JSON.stringify(redact(snapshot)),
  );
}

async function scenarioMissingSession(): Promise<DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionDependencyProgressionRepository(new MockSupabaseClient({}) as unknown as SupabaseClient);
  const snapshot = await repository.loadDependencyProgressionSnapshot(query());

  return expectScenario(
    "missing session",
    snapshot.session === null && snapshot.items.length === 0 && snapshot.aggregate.totalItemCount === 0,
    JSON.stringify(snapshot),
  );
}

function scenarioDuplicateIdentityProtection(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  try {
    assertAtMostOne([{}, {}], "dependency-progression session");
  } catch (error) {
    return expectScenario("duplicate identity protection", error instanceof Error && error.message.includes("Ambiguous dependency-progression session"), String(error));
  }

  return expectScenario("duplicate identity protection", false, "duplicates accepted");
}

function scenarioRpcPayloadShape(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const payload = dependencyProgressionRpcPayload(command());

  return expectScenario(
    "RPC payload shape",
    payload.p_clinic_id === CLINIC_ID &&
      payload.p_deployment_run_key === DEPLOYMENT_RUN_KEY &&
      payload.p_session_id === SESSION_ID &&
      payload.p_execution_key === EXECUTION_KEY &&
      Object.keys(payload).length === 25,
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioOwnerTokenLeasePayload(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const payload = dependencyProgressionRpcPayload(command());

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

function scenarioPredecessorIdentityPayload(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const payload = dependencyProgressionRpcPayload(command());

  return expectScenario(
    "predecessor identity payload",
    payload.p_completed_item_id === COMPLETED_ITEM_ID &&
      payload.p_completed_execution_item_key === COMPLETED_EXECUTION_ITEM_KEY &&
      payload.p_completed_plan_item_key === COMPLETED_PLAN_ITEM_KEY &&
      payload.p_completed_sequence === 1 &&
      payload.p_completed_started_at === COMPLETED_STARTED_AT &&
      payload.p_completed_completed_at === COMPLETED_COMPLETED_AT &&
      payload.p_completed_attempt_count === 1,
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioNextItemIdentityPayload(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const payload = dependencyProgressionRpcPayload(command());

  return expectScenario(
    "next item identity payload",
    payload.p_next_item_id === NEXT_ITEM_ID &&
      payload.p_next_execution_item_key === NEXT_EXECUTION_ITEM_KEY &&
      payload.p_next_plan_item_key === NEXT_PLAN_ITEM_KEY &&
      payload.p_next_sequence === 2 &&
      payload.p_next_entity_type === "provider_shell" &&
      payload.p_next_entity_id === "provider-001" &&
      payload.p_next_action === "activate" &&
      payload.p_expected_next_status === "pending" &&
      payload.p_expected_next_attempt_count === 0,
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioDependencyPayloadImmutability(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const source = command();
  const payload = dependencyProgressionRpcPayload(source);
  (payload.p_expected_dependency_keys as string[]).push("mutated");

  return expectScenario(
    "dependency payload immutability",
    source.expectedDependencyKeys.length === 1 && source.expectedDependencyKeys[0] === COMPLETED_PLAN_ITEM_KEY,
    JSON.stringify(redactPayload(payload)),
  );
}

async function scenarioProgressedRpcMapping(): Promise<DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({}, { progress_deployment_activation_execution_dependency: [rpcRow()] });
  const repository = new SupabaseDeploymentActivationExecutionDependencyProgressionRepository(client as unknown as SupabaseClient);
  const result = await repository.progressDependencyAtomically(command());
  const rpcCall = client.rpcCalls[0];

  return expectScenario(
    "progressed RPC mapping",
    result.ok &&
      result.status === "progressed" &&
      result.nextStatusBefore === "pending" &&
      result.nextStatusAfter === "ready" &&
      rpcCall.name === "progress_deployment_activation_execution_dependency",
    JSON.stringify({ result, rpcCall: { ...rpcCall, payload: redactPayload(rpcCall.payload) } }),
  );
}

function scenarioAlreadyProgressedMapping(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const result = mapDependencyProgressionRpcResult(rpcRow({ status: "already_progressed", next_status_before: "ready", next_status_after: "ready" }));
  return expectScenario("already_progressed mapping", result.ok && result.status === "already_progressed", JSON.stringify(result));
}

function scenarioBlockedMapping(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const result = mapDependencyProgressionRpcResult(rpcRow({ status: "blocked", issue_code: "dependency_integrity_invalid" }));
  return expectScenario("blocked mapping", !result.ok && result.status === "blocked" && result.issueCode === "dependency_integrity_invalid", JSON.stringify(result));
}

function scenarioConflictMapping(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const result = mapDependencyProgressionRpcResult(rpcRow({ status: "conflict", issue_code: "ownership_compare_failed" }));
  return expectScenario("conflict mapping", !result.ok && result.status === "conflict", JSON.stringify(result));
}

function scenarioNotFoundMapping(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const result = mapDependencyProgressionRpcResult(rpcRow({ status: "not_found", next_item_id: null }));
  return expectScenario("not_found mapping", !result.ok && result.status === "not_found" && result.nextItemId === null, JSON.stringify(result));
}

function scenarioMalformedRpcResponse(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  try {
    mapDependencyProgressionRpcResult(rpcRow({ status: "surprise" }));
  } catch (error) {
    return expectScenario("malformed RPC response", error instanceof Error && error.message.includes("Malformed activation execution dependency-progression RPC status"), String(error));
  }

  return expectScenario("malformed RPC response", false, "malformed status accepted");
}

async function scenarioUnexpectedRpcStatus(): Promise<DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionDependencyProgressionRepository(new MockSupabaseClient({}, {
    progress_deployment_activation_execution_dependency: [rpcRow({ status: "unexpected" })],
  }) as unknown as SupabaseClient);

  try {
    await repository.progressDependencyAtomically(command());
  } catch (error) {
    return expectScenario("unexpected RPC status", error instanceof Error && !String(error).includes(OWNERSHIP_TOKEN), String(error));
  }

  return expectScenario("unexpected RPC status", false, "unexpected status accepted");
}

async function scenarioMultipleRpcRows(): Promise<DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionDependencyProgressionRepository(new MockSupabaseClient({}, {
    progress_deployment_activation_execution_dependency: [rpcRow(), rpcRow()],
  }) as unknown as SupabaseClient);

  try {
    await repository.progressDependencyAtomically(command());
  } catch (error) {
    return expectScenario("multiple RPC rows", error instanceof Error && String(error).includes("Ambiguous"), String(error));
  }

  return expectScenario("multiple RPC rows", false, "multiple rows accepted");
}

async function scenarioSupabaseErrorSanitization(): Promise<DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionDependencyProgressionRepository(new MockSupabaseClient({}, {}, {
    message: `database failed ${OWNERSHIP_TOKEN}`,
    code: "PGRST000",
    details: `details include ${OWNERSHIP_TOKEN}`,
    hint: "no fallback",
  }) as unknown as SupabaseClient);

  try {
    await repository.progressDependencyAtomically(command());
  } catch (error) {
    const text = JSON.stringify(error);
    return expectScenario(
      "Supabase error sanitization",
      error instanceof Error && !String(error).includes(OWNERSHIP_TOKEN) && !text.includes(OWNERSHIP_TOKEN),
      `${String(error)} ${text}`,
    );
  }

  return expectScenario("Supabase error sanitization", false, "error not thrown");
}

function scenarioTokenRedaction(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const payload = dependencyProgressionRpcPayload(command());
  const result = mapDependencyProgressionRpcResult(rpcRow({ status: "conflict", message: "Ownership compare-and-set failed." }));

  return expectScenario(
    "token redaction",
    payload.p_ownership_token === OWNERSHIP_TOKEN &&
      !JSON.stringify(result).includes(OWNERSHIP_TOKEN) &&
      !result.message.includes(OWNERSHIP_TOKEN),
    JSON.stringify(result),
  );
}

function scenarioNoGenericMutationFallback(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no generic mutation fallback", ["update", "insert", "upsert", "delete", "patch", "save"]);
}

function scenarioNoItemStartMutation(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no item start mutation", ["startExecutionItemAtomically", "startNextItem", "incrementAttempt", "setStartedAt"]);
}

function scenarioNoSessionCompletionMutation(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no session completion mutation", ["completeSession", "finalizeDeployment", "markSessionSucceeded"]);
}

function scenarioNoActivationMutation(): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no activation mutation", ["activateClinic", "activateProvider", "bindHardware", "rollbackItem"]);
}

async function scenarioSourceCommandImmutability(): Promise<DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario> {
  const source = command();
  const before = JSON.stringify(source);
  const payload = dependencyProgressionRpcPayload(source);
  payload.p_expected_next_attempt_count = 7;

  return expectScenario("source command immutability", JSON.stringify(source) === before, JSON.stringify(redactPayload(payload)));
}

function expectNoMethods(
  name: string,
  forbidden: readonly string[],
): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentActivationExecutionDependencyProgressionRepository.prototype as Record<string, unknown>;
  return expectScenario(name, forbidden.every((method) => !(method in prototype)), forbidden.filter((method) => method in prototype).join(","));
}

function query() {
  return {
    clinicId: CLINIC_ID,
    deploymentRunKey: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  };
}

function command(input: Partial<DeploymentActivationExecutionAtomicDependencyProgressionCommand> = {}): DeploymentActivationExecutionAtomicDependencyProgressionCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunKey: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    claimantId: CLAIMANT_ID,
    ownershipToken: OWNERSHIP_TOKEN,
    expectedLeaseExpiresAt: ACTIVE_LEASE,
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
    expectedNextStatus: "pending",
    expectedNextAttemptCount: 0,
    expectedDependencyKeys: [COMPLETED_PLAN_ITEM_KEY],
    progressedAt: PROGRESSED_AT,
    ...input,
  };
}

function sessionRow(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: input.id ?? SESSION_ID,
    clinic_id: input.clinic_id ?? CLINIC_ID,
    deployment_run_key: input.deployment_run_key ?? DEPLOYMENT_RUN_KEY,
    execution_key: input.execution_key ?? EXECUTION_KEY,
    preparation_status: input.preparation_status ?? "ready",
    execution_status: input.execution_status ?? "running",
    execution_owner: input.execution_owner ?? CLAIMANT_ID,
    ownership_token: input.ownership_token ?? OWNERSHIP_TOKEN,
    lease_expires_at: input.lease_expires_at ?? ACTIVE_LEASE,
    started_at: input.started_at ?? SESSION_STARTED_AT,
    completed_at: input.completed_at ?? null,
    failed_at: input.failed_at ?? null,
    items_requested: input.items_requested ?? 3,
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function completedItemRow(): DependencyProgressionItemRow {
  return itemRow({
    id: COMPLETED_ITEM_ID,
    execution_item_key: COMPLETED_EXECUTION_ITEM_KEY,
    plan_item_key: COMPLETED_PLAN_ITEM_KEY,
    sequence: 1,
    entity_type: "clinic",
    entity_id: CLINIC_ID,
    execution_status: "succeeded",
    attempt_count: 1,
    started_at: COMPLETED_STARTED_AT,
    completed_at: COMPLETED_COMPLETED_AT,
    dependency_keys: [],
  });
}

function itemRow(input: Partial<DependencyProgressionItemRow> = {}): DependencyProgressionItemRow {
  return {
    id: input.id ?? NEXT_ITEM_ID,
    session_id: input.session_id ?? SESSION_ID,
    execution_item_key: input.execution_item_key ?? NEXT_EXECUTION_ITEM_KEY,
    plan_item_key: input.plan_item_key ?? NEXT_PLAN_ITEM_KEY,
    sequence: input.sequence ?? 2,
    entity_type: input.entity_type ?? "provider_shell",
    entity_id: input.entity_id ?? "provider-001",
    action: input.action ?? "activate",
    execution_status: input.execution_status ?? "pending",
    attempt_count: input.attempt_count ?? 0,
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    rolled_back_at: input.rolled_back_at ?? null,
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
    dependency_keys: input.dependency_keys ?? [COMPLETED_PLAN_ITEM_KEY],
    expected_current_state: input.expected_current_state ?? { provisioningStatus: "planned", active: false },
    target_state: input.target_state ?? { provisioningStatus: "active", active: true },
    reversible: input.reversible ?? true,
    rollback_action: input.rollback_action ?? "restore planned inactive shell state",
  };
}

function rpcRow(input: Partial<Record<keyof ReturnType<typeof baseRpcRow>, unknown>> = {}) {
  return { ...baseRpcRow(), ...input };
}

function baseRpcRow() {
  return {
    status: "progressed",
    clinic_id: CLINIC_ID,
    deployment_run_key: DEPLOYMENT_RUN_KEY,
    session_id: SESSION_ID,
    execution_key: EXECUTION_KEY,
    completed_item_id: COMPLETED_ITEM_ID,
    completed_execution_item_key: COMPLETED_EXECUTION_ITEM_KEY,
    completed_plan_item_key: COMPLETED_PLAN_ITEM_KEY,
    completed_sequence: 1,
    next_item_id: NEXT_ITEM_ID,
    next_execution_item_key: NEXT_EXECUTION_ITEM_KEY,
    next_plan_item_key: NEXT_PLAN_ITEM_KEY,
    next_sequence: 2,
    next_entity_type: "provider_shell",
    next_entity_id: "provider-001",
    next_action: "activate",
    next_status_before: "pending",
    next_status_after: "ready",
    issue_code: null,
    message: "Activation execution dependency progression readied the next deterministic item.",
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
    readonly error: { message: string; code?: string; details?: string; hint?: string } | null = null,
  ) {}

  from(table: string): MockQuery {
    return new MockQuery(this, table);
  }

  async rpc(name: string, payload: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null }> {
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

  then<TResult1 = { data: unknown[]; error: { message: string; code?: string; details?: string; hint?: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: { message: string; code?: string; details?: string; hint?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.executeMany()).then(onfulfilled, onrejected);
  }

  private executeMany(): { data: unknown[]; error: { message: string; code?: string; details?: string; hint?: string } | null } {
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
): DeploymentActivationExecutionDependencyProgressionSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}
