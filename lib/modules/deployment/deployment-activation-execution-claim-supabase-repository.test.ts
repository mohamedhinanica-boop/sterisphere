import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateClaimItems,
  assertAtMostOne,
  atomicClaimRpcPayload,
  mapAtomicClaimRpcResult,
  mapClaimSessionRow,
  SupabaseDeploymentActivationExecutionClaimRepository,
  type ClaimItemRow,
} from "./deployment-activation-execution-claim-supabase-repository";
import type {
  DeploymentActivationExecutionAtomicClaimCommand,
} from "./deployment-activation-execution-claim-types";

export interface DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionClaimSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-claim-0001";
const DEPLOYMENT_RUN_RECORD_ID = "deployment-run-row-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-claim-0001";
const SESSION_ID = "activation-execution-session-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-claim-0001";
const PLAN_KEY = "activation-plan-deployment-run-claim-0001";

export async function runDeploymentActivationExecutionClaimSupabaseRepositoryHarness(): Promise<DeploymentActivationExecutionClaimSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSessionRowMapping(),
    scenarioItemAggregation(),
    await scenarioSnapshotReadDeterministicOrdering(),
    scenarioDuplicateAmbiguousSessionDetection(),
    await scenarioMissingSessionSnapshot(),
    scenarioFreshRpcPayload(),
    await scenarioFreshAtomicClaim(),
    await scenarioSameOwnerAtomicClaim(),
    await scenarioExpiredReclaimPayload(),
    scenarioConflictMapping(),
    scenarioMalformedRpcResponse(),
    scenarioTokenNotExposedInMessage(),
    scenarioNoUpdateDeleteUpsertMethods(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioSessionRowMapping(): DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  const mapped = mapClaimSessionRow(sessionRow());

  return expectScenario(
    "claim session row mapping",
    mapped.id === SESSION_ID &&
      mapped.deploymentRunRecordId === DEPLOYMENT_RUN_RECORD_ID &&
      mapped.executionOwner === null,
    JSON.stringify(mapped),
  );
}

function scenarioItemAggregation(): DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  const aggregation = aggregateClaimItems([
    itemRow({ sequence: 2, execution_item_key: "b", execution_status: "pending", dependency_keys: [`${PLAN_KEY}:clinic`] }),
    itemRow({ sequence: 1, execution_item_key: "a", execution_status: "ready", dependency_keys: [] }),
    itemRow({ sequence: 3, execution_item_key: "b", plan_item_key: "duplicate", execution_status: "running", attempt_count: 1, started_at: "2026-01-01T00:00:00.000Z" }),
  ]);

  return expectScenario(
    "item aggregation preserves invalid lifecycle evidence",
    aggregation.durableItemCount === 3 &&
      aggregation.duplicateExecutionItemKeyCount === 1 &&
      aggregation.runningOrTerminalItemCount === 1 &&
      aggregation.itemsWithAttempts === 1 &&
      aggregation.firstExecutableSequence === 1 &&
      aggregation.readyRootItemCount === 1,
    JSON.stringify(aggregation),
  );
}

async function scenarioSnapshotReadDeterministicOrdering(): Promise<DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({
    deployment_activation_execution_sessions: [sessionRow()],
    deployment_activation_execution_items: [
      itemRow({ id: "item-2", sequence: 2, execution_item_key: "b", execution_status: "pending", dependency_keys: ["a"] }),
      itemRow({ id: "item-1", sequence: 1, execution_item_key: "a" }),
    ],
  });
  const repository = new SupabaseDeploymentActivationExecutionClaimRepository(client as unknown as SupabaseClient);
  const snapshot = await repository.getClaimSnapshot({
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  });

  return expectScenario(
    "snapshot read maps session and deterministic item aggregation",
    snapshot.session?.id === SESSION_ID &&
      snapshot.itemCompleteness.durableItemCount === 2 &&
      snapshot.itemCompleteness.firstExecutableSequence === 1,
    JSON.stringify(snapshot),
  );
}

function scenarioDuplicateAmbiguousSessionDetection(): DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  try {
    assertAtMostOne([{}, {}], "claim session");
  } catch (error) {
    return expectScenario(
      "ambiguous session detection",
      error instanceof Error && error.message.includes("Ambiguous claim session"),
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario("ambiguous session detection", false, "duplicate accepted");
}

async function scenarioMissingSessionSnapshot(): Promise<DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentActivationExecutionClaimRepository(
    new MockSupabaseClient({}) as unknown as SupabaseClient,
  );
  const snapshot = await repository.getClaimSnapshot({
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  });

  return expectScenario(
    "missing session returns empty snapshot",
    snapshot.session === null && snapshot.itemCompleteness.durableItemCount === 0,
    JSON.stringify(snapshot),
  );
}

function scenarioFreshRpcPayload(): DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  const payload = atomicClaimRpcPayload(claimCommand("fresh"));

  return expectScenario(
    "fresh atomic claim payload",
    payload.p_claim_mode === "fresh" &&
      payload.p_clinic_id === CLINIC_ID &&
      payload.p_proposed_ownership_token === "proposed-token" &&
      payload.p_proposed_lease_expires_at === "2026-01-01T12:05:00.000Z" &&
      !Object.prototype.hasOwnProperty.call(payload, "p_lease_expires_at") &&
      payload.p_expected_item_count === 3,
    JSON.stringify(payload),
  );
}

async function scenarioFreshAtomicClaim(): Promise<DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({}, {
    claim_deployment_activation_execution_session: [rpcRow({ status: "claimed" })],
  });
  const repository = new SupabaseDeploymentActivationExecutionClaimRepository(client as unknown as SupabaseClient);
  const result = await repository.claimFreshSession(claimCommand("fresh"));
  const rpcCall = client.rpcCalls[0];

  return expectScenario(
    "fresh atomic claim calls RPC and maps claimed",
    result.ok &&
      result.status === "claimed" &&
      rpcCall.name === "claim_deployment_activation_execution_session" &&
      rpcCall.payload.p_claim_mode === "fresh" &&
      rpcCall.payload.p_proposed_lease_expires_at === "2026-01-01T12:05:00.000Z" &&
      !Object.prototype.hasOwnProperty.call(rpcCall.payload, "p_lease_expires_at"),
    JSON.stringify({ result, rpcCall }),
  );
}

async function scenarioSameOwnerAtomicClaim(): Promise<DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({}, {
    claim_deployment_activation_execution_session: [rpcRow({ status: "already_owned" })],
  });
  const repository = new SupabaseDeploymentActivationExecutionClaimRepository(client as unknown as SupabaseClient);
  const result = await repository.confirmSameOwnerClaim(claimCommand("same_owner"));

  return expectScenario(
    "same-owner atomic claim maps already owned without generating token",
    result.ok &&
      result.status === "already_owned" &&
      client.rpcCalls[0].payload.p_claim_mode === "same_owner" &&
      client.rpcCalls[0].payload.p_proposed_lease_expires_at === "2026-01-01T12:05:00.000Z" &&
      !Object.prototype.hasOwnProperty.call(client.rpcCalls[0].payload, "p_lease_expires_at") &&
      client.calls.every((call) => call.operation !== "update"),
    JSON.stringify(result),
  );
}

async function scenarioExpiredReclaimPayload(): Promise<DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({}, {
    claim_deployment_activation_execution_session: [rpcRow({ status: "reclaimed" })],
  });
  const repository = new SupabaseDeploymentActivationExecutionClaimRepository(client as unknown as SupabaseClient);
  const result = await repository.reclaimExpiredSession(claimCommand("expired_reclaim"));
  const payload = client.rpcCalls[0].payload;

  return expectScenario(
    "expired reclaim includes stale-owner compare-and-set values",
    result.status === "reclaimed" &&
      payload.p_claim_mode === "expired_reclaim" &&
      payload.p_proposed_lease_expires_at === "2026-01-01T12:05:00.000Z" &&
      !Object.prototype.hasOwnProperty.call(payload, "p_lease_expires_at") &&
      payload.p_expected_previous_owner === "previous-owner" &&
      payload.p_expected_previous_ownership_token === "previous-token" &&
      payload.p_expected_previous_lease_expires_at === "2026-01-01T11:55:00.000Z",
    JSON.stringify({ result, payload }),
  );
}
function scenarioConflictMapping(): DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  const result = mapAtomicClaimRpcResult(rpcRow({
    status: "conflict",
    issue_code: "active_competing_lease",
    message: "Active lease belongs to another executor.",
    ownership_token: null,
  }));

  return expectScenario(
    "conflict mapping sanitizes token",
    !result.ok &&
      result.status === "conflict" &&
      result.ownershipToken === null &&
      !result.message.includes("previous-token"),
    JSON.stringify(result),
  );
}

function scenarioMalformedRpcResponse(): DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  try {
    mapAtomicClaimRpcResult(rpcRow({ status: "surprise" }));
  } catch (error) {
    return expectScenario(
      "malformed RPC response becomes safe repository error",
      error instanceof Error &&
        error.name === "DeploymentActivationExecutionClaimRepositoryError",
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario("malformed RPC response becomes safe repository error", false, "malformed accepted");
}

function scenarioTokenNotExposedInMessage(): DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  const result = mapAtomicClaimRpcResult(rpcRow({
    status: "claimed",
    ownership_token: "server-token",
    message: "Claimed prepared activation execution session.",
  }));

  return expectScenario(
    "token is internal result evidence only",
    result.ownershipToken === "server-token" &&
      !result.message.includes("server-token"),
    JSON.stringify(result),
  );
}

function scenarioNoUpdateDeleteUpsertMethods(): DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentActivationExecutionClaimRepository.prototype as Record<string, unknown>;
  const forbidden = ["update", "delete", "upsert", "startItem", "incrementAttempt"];

  return expectScenario(
    "no generic update/delete/upsert or item mutation methods",
    forbidden.every((name) => !(name in prototype)),
    forbidden.filter((name) => name in prototype).join(","),
  );
}

function claimCommand(
  mode: DeploymentActivationExecutionAtomicClaimCommand["mode"],
): Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode"> & { mode: DeploymentActivationExecutionAtomicClaimCommand["mode"] } {
  return {
    mode,
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    claimantId: "executor-001",
    proposedOwnershipToken: "proposed-token",
    claimRequestedAt: "2026-01-01T12:00:00.000Z",
    proposedLeaseExpiresAt: "2026-01-01T12:05:00.000Z",
    expectedItemCount: 3,
    expectedPreviousOwner: "previous-owner",
    expectedPreviousOwnershipToken: "previous-token",
    expectedPreviousLeaseExpiresAt: "2026-01-01T11:55:00.000Z",
  };
}

function sessionRow(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: input.id ?? SESSION_ID,
    clinic_id: input.clinic_id ?? CLINIC_ID,
    deployment_run_record_id: input.deployment_run_record_id ?? DEPLOYMENT_RUN_RECORD_ID,
    deployment_run_key: input.deployment_run_key ?? DEPLOYMENT_RUN_KEY,
    execution_key: input.execution_key ?? EXECUTION_KEY,
    plan_key: input.plan_key ?? PLAN_KEY,
    preparation_status: input.preparation_status ?? "ready",
    execution_status: input.execution_status ?? "prepared",
    items_requested: input.items_requested ?? 3,
    items_ready: input.items_ready ?? 1,
    items_pending: input.items_pending ?? 2,
    items_blocked: input.items_blocked ?? 0,
    blockers: input.blockers ?? 0,
    execution_owner: input.execution_owner ?? null,
    ownership_token: input.ownership_token ?? null,
    lease_expires_at: input.lease_expires_at ?? null,
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    failed_at: input.failed_at ?? null,
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: input.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function itemRow(input: Partial<ClaimItemRow> = {}): ClaimItemRow {
  return {
    id: input.id ?? "activation-execution-item-0001",
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
    status: "claimed",
    session_id: SESSION_ID,
    execution_key: EXECUTION_KEY,
    execution_owner: "executor-001",
    ownership_token: "server-token",
    lease_expires_at: "2026-01-01T12:05:00.000Z",
    execution_status: "claimed",
    item_count: 3,
    issue_code: null,
    message: "Claimed prepared activation execution session.",
  };
}

class MockSupabaseClient {
  readonly calls: Array<{ table: string; operation: string }> = [];
  readonly rpcCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];

  constructor(
    readonly tables: Record<string, unknown[]> = {},
    readonly rpcResults: Record<string, unknown> = {},
  ) {}

  from(table: string): MockQuery {
    return new MockQuery(this, table);
  }

  async rpc(name: string, payload: Record<string, unknown>): Promise<{ data: unknown; error: null }> {
    this.rpcCalls.push({ name, payload });
    return { data: this.rpcResults[name] ?? null, error: null };
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

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.executeMany()).then(onfulfilled, onrejected);
  }

  private executeMany(): { data: unknown[]; error: null } {
    this.client.calls.push({ table: this.table, operation: "select" });
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
): DeploymentActivationExecutionClaimSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}
