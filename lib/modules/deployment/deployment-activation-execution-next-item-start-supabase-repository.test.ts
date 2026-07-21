import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateNextItemStartRows,
  assertAtMostOne,
  DeploymentActivationExecutionNextItemStartRepositoryError,
  mapNextItemStartItemRow,
  mapNextItemStartRpcResult,
  mapNextItemStartSessionRow,
  nextItemStartRpcPayload,
  readSingleRpcRow,
  SupabaseDeploymentActivationExecutionNextItemStartRepository,
  type NextItemStartItemRow,
} from "./deployment-activation-execution-next-item-start-supabase-repository";
import type {
  DeploymentActivationExecutionAtomicNextItemStartCommand,
} from "./deployment-activation-execution-next-item-start-types";

export interface DeploymentActivationExecutionNextItemStartSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionNextItemStartSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionNextItemStartSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-next-item-start-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-next-item-start-0001";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const EXECUTION_KEY = "activation-execution-deployment-run-next-item-start-0001";
const PLAN_KEY = "activation-plan-next-item-start-0001";
const OWNER = "executor-next-item-start-001";
const TOKEN = "sensitive-next-item-start-token";
const LEASE = "2026-01-01T12:10:00.000Z";
const STARTED_AT = "2026-01-01T12:05:00.000Z";

export async function runDeploymentActivationExecutionNextItemStartSupabaseRepositoryHarness(): Promise<DeploymentActivationExecutionNextItemStartSupabaseRepositoryHarnessResult> {
  const scenarios = [
    await scenarioSnapshotMapping(),
    await scenarioDeterministicItemOrdering(),
    await scenarioAggregateCounts(),
    await scenarioSucceededPrefixMapping(),
    await scenarioDependencyKeyMapping(),
    await scenarioMalformedDependencyEvidence(),
    await scenarioMissingSession(),
    await scenarioAmbiguousSession(),
    await scenarioRpcPayloadShape(),
    await scenarioCompareAndSetPayload(),
    await scenarioSelectedItemPayload(),
    await scenarioSequenceEntityActionPayload(),
    await scenarioExpectedAttemptPayload(),
    await scenarioExpectedDependencyPayload(),
    await scenarioProposedStartedAtPayload(),
    await scenarioStartedMapping(),
    await scenarioAlreadyStartedMapping(),
    await scenarioBlockedMapping(),
    await scenarioConflictMapping(),
    await scenarioNotFoundMapping(),
    await scenarioMalformedRpcResponse(),
    await scenarioMultipleRpcRows(),
    await scenarioSnapshotErrorSanitization(),
    await scenarioRpcErrorSanitization(),
    await scenarioTokenRedaction(),
    await scenarioSourceImmutability(),
    await scenarioNoFallbackMutationMethods(),
    await scenarioNoGenericUpdateUpsertMethods(),
    await scenarioNoProviderEntityMutationMethods(),
    await scenarioNoSessionMutationMethods(),
    await scenarioRepositoryDoesNotRetry(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioSnapshotMapping() {
  const repository = new SupabaseDeploymentActivationExecutionNextItemStartRepository(mockClient({ sessions: [sessionRow()], items: rows() }));
  const snapshot = await repository.loadNextItemStartSnapshot({ clinicId: CLINIC_ID, deploymentRunKey: DEPLOYMENT_RUN_KEY, sessionId: SESSION_ID, executionKey: EXECUTION_KEY });
  return expectScenario(
    "deterministic session snapshot mapping",
    snapshot.session?.clinicId === CLINIC_ID && snapshot.session.planKey === PLAN_KEY && snapshot.items.length === 3 && snapshot.items[1]?.entityId === "dentist-001",
    JSON.stringify(snapshot),
  );
}

async function scenarioDeterministicItemOrdering() {
  const repository = new SupabaseDeploymentActivationExecutionNextItemStartRepository(mockClient({ sessions: [sessionRow()], items: [rows()[2], rows()[0], rows()[1]] }));
  const snapshot = await repository.loadNextItemStartSnapshot({ clinicId: CLINIC_ID, deploymentRunKey: DEPLOYMENT_RUN_KEY, sessionId: SESSION_ID, executionKey: EXECUTION_KEY });
  return expectScenario("deterministic item ordering", snapshot.items.map((item) => item.sequence).join(",") === "1,2,3", JSON.stringify(snapshot.items.map((item) => item.sequence)));
}

async function scenarioAggregateCounts() {
  const aggregate = aggregateNextItemStartRows(rows());
  return expectScenario(
    "aggregate count mapping",
    aggregate.totalItemCount === 3 && aggregate.succeededItemCount === 1 && aggregate.readyItemCount === 1 && aggregate.pendingItemCount === 1 && aggregate.runningItemCount === 0,
    JSON.stringify(aggregate),
  );
}

async function scenarioSucceededPrefixMapping() {
  const aggregate = aggregateNextItemStartRows(rows());
  return expectScenario("succeeded-prefix mapping", aggregate.succeededContiguousPrefixLength === 1 && aggregate.succeededPlanItemKeys[0] === planItemKey(1), JSON.stringify(aggregate));
}

async function scenarioDependencyKeyMapping() {
  const mapped = mapNextItemStartItemRow(row(2));
  return expectScenario("dependency-key mapping", mapped.dependencyKeys.length === 1 && mapped.dependencyKeys[0] === planItemKey(1), JSON.stringify(mapped));
}

async function scenarioMalformedDependencyEvidence() {
  const mapped = mapNextItemStartItemRow(row(2, { dependency_keys: { bad: true } }));
  return expectScenario("malformed dependency evidence", mapped.dependencyKeys.length === 0, JSON.stringify(mapped));
}

async function scenarioMissingSession() {
  const repository = new SupabaseDeploymentActivationExecutionNextItemStartRepository(mockClient({ sessions: [], items: rows() }));
  const snapshot = await repository.loadNextItemStartSnapshot({ clinicId: CLINIC_ID, deploymentRunKey: DEPLOYMENT_RUN_KEY, sessionId: SESSION_ID, executionKey: EXECUTION_KEY });
  return expectScenario("missing session", snapshot.session === null && snapshot.items.length === 0 && snapshot.aggregate.totalItemCount === 0, JSON.stringify(snapshot));
}

async function scenarioAmbiguousSession() {
  try {
    assertAtMostOne([sessionRow(), sessionRow({ id: "22222222-2222-4222-8222-222222222222" })], "session");
    return expectScenario("ambiguous session", false, "did not throw");
  } catch (caught) {
    return expectScenario("ambiguous session", caught instanceof DeploymentActivationExecutionNextItemStartRepositoryError, String(caught));
  }
}

async function scenarioRpcPayloadShape() {
  const payload = nextItemStartRpcPayload(command());
  const keys = Object.keys(payload).sort().join(",");
  return expectScenario("RPC payload shape", keys === [
    "p_claimant_id",
    "p_clinic_id",
    "p_deployment_run_key",
    "p_execution_item_key",
    "p_execution_key",
    "p_expected_action",
    "p_expected_attempt_count",
    "p_expected_dependency_keys",
    "p_expected_entity_id",
    "p_expected_entity_type",
    "p_expected_lease_expires_at",
    "p_expected_sequence",
    "p_item_id",
    "p_ownership_token",
    "p_plan_item_key",
    "p_proposed_started_at",
    "p_session_id",
  ].sort().join(","), keys);
}

async function scenarioCompareAndSetPayload() {
  const payload = nextItemStartRpcPayload(command());
  return expectScenario("owner/token/lease compare-and-set payload", payload.p_claimant_id === OWNER && payload.p_ownership_token === TOKEN && payload.p_expected_lease_expires_at === LEASE, JSON.stringify(redact(payload)));
}
async function scenarioSelectedItemPayload() { const payload = nextItemStartRpcPayload(command()); return expectScenario("selected item identity payload", payload.p_item_id === itemId(2) && payload.p_execution_item_key === executionItemKey(2) && payload.p_plan_item_key === planItemKey(2), JSON.stringify(redact(payload))); }
async function scenarioSequenceEntityActionPayload() { const payload = nextItemStartRpcPayload(command()); return expectScenario("sequence/entity/action payload", payload.p_expected_sequence === 2 && payload.p_expected_entity_type === "provider_shell" && payload.p_expected_entity_id === "dentist-001" && payload.p_expected_action === "activate", JSON.stringify(redact(payload))); }
async function scenarioExpectedAttemptPayload() { const payload = nextItemStartRpcPayload(command()); return expectScenario("expected attempt count payload", payload.p_expected_attempt_count === 0, JSON.stringify(redact(payload))); }
async function scenarioExpectedDependencyPayload() { const payload = nextItemStartRpcPayload(command()); return expectScenario("expected dependency keys payload", Array.isArray(payload.p_expected_dependency_keys) && payload.p_expected_dependency_keys[0] === planItemKey(1), JSON.stringify(redact(payload))); }
async function scenarioProposedStartedAtPayload() { const payload = nextItemStartRpcPayload(command()); return expectScenario("proposed startedAt payload", payload.p_proposed_started_at === STARTED_AT, JSON.stringify(redact(payload))); }

async function scenarioStartedMapping() { return expectRpcStatus("started", true); }
async function scenarioAlreadyStartedMapping() { return expectRpcStatus("already_started", true); }
async function scenarioBlockedMapping() { return expectRpcStatus("blocked", false); }
async function scenarioConflictMapping() { return expectRpcStatus("conflict", false); }
async function scenarioNotFoundMapping() { return expectRpcStatus("not_found", false); }

async function scenarioMalformedRpcResponse() {
  try {
    readSingleRpcRow(null);
    return expectScenario("malformed RPC response", false, "did not throw");
  } catch (caught) {
    return expectScenario("malformed RPC response", caught instanceof DeploymentActivationExecutionNextItemStartRepositoryError, String(caught));
  }
}

async function scenarioMultipleRpcRows() {
  try {
    readSingleRpcRow([rpcRow("started"), rpcRow("started")]);
    return expectScenario("multiple RPC rows", false, "did not throw");
  } catch (caught) {
    return expectScenario("multiple RPC rows", caught instanceof DeploymentActivationExecutionNextItemStartRepositoryError, String(caught));
  }
}

async function scenarioSnapshotErrorSanitization() {
  const repository = new SupabaseDeploymentActivationExecutionNextItemStartRepository(mockClient({ sessionError: { message: `snapshot ${TOKEN}`, code: "PGRST100", details: `details ${TOKEN}`, hint: `hint ${TOKEN}` } }));
  try {
    await repository.loadNextItemStartSnapshot({ clinicId: CLINIC_ID, deploymentRunKey: DEPLOYMENT_RUN_KEY, sessionId: SESSION_ID, executionKey: EXECUTION_KEY });
    return expectScenario("Supabase snapshot error sanitization", false, "did not throw");
  } catch (caught) {
    const serialized = JSON.stringify(caught);
    const passed = caught instanceof DeploymentActivationExecutionNextItemStartRepositoryError
      && caught.message === "Activation execution next-item start snapshot query failed."
      && caught.code === "PGRST100"
      && caught.details === null
      && caught.hint === null
      && caught.layer === "snapshot_session_lookup"
      && !`${caught.message}:${serialized}`.includes(TOKEN);
    return expectScenario("Supabase snapshot error sanitization", passed, `${caught instanceof Error ? caught.message : String(caught)} ${serialized}`);
  }
}

async function scenarioRpcErrorSanitization() {
  const repository = new SupabaseDeploymentActivationExecutionNextItemStartRepository(mockClient({ rpcError: { message: `rpc ${TOKEN}`, code: "42804", details: `details ${TOKEN}`, hint: `hint ${TOKEN}` } }));
  try {
    await repository.startNextItemAtomically(command());
    return expectScenario("Supabase RPC error sanitization", false, "did not throw");
  } catch (caught) {
    const serialized = JSON.stringify(caught);
    return expectScenario("Supabase RPC error sanitization", caught instanceof DeploymentActivationExecutionNextItemStartRepositoryError && !serialized.includes(TOKEN), serialized);
  }
}

async function scenarioTokenRedaction() {
  const payload = redact(nextItemStartRpcPayload(command()));
  return expectScenario("token redaction", !JSON.stringify(payload).includes(TOKEN) && JSON.stringify(payload).includes("[redacted]"), JSON.stringify(payload));
}

async function scenarioSourceImmutability() {
  const source = command();
  const before = JSON.stringify(source);
  nextItemStartRpcPayload(source);
  return expectScenario("source immutability", JSON.stringify(source) === before, JSON.stringify(source));
}

async function scenarioNoFallbackMutationMethods() {
  const prototype = SupabaseDeploymentActivationExecutionNextItemStartRepository.prototype as Record<string, unknown>;
  const forbidden = ["insert", "update", "upsert", "patch", "save", "delete", "increment", "startAnyItem", "activateProvider", "updateSession", "renewLease", "rotateToken"];
  return expectScenario("no fallback mutation methods", forbidden.every((method) => !(method in prototype)), JSON.stringify(forbidden.filter((method) => method in prototype)));
}
async function scenarioNoGenericUpdateUpsertMethods() { return scenarioNoFallbackMutationMethods(); }
async function scenarioNoProviderEntityMutationMethods() { return scenarioNoFallbackMutationMethods(); }
async function scenarioNoSessionMutationMethods() { return scenarioNoFallbackMutationMethods(); }

async function scenarioRepositoryDoesNotRetry() {
  const client = mockClient({ rpcError: { message: "rpc failed" } });
  const repository = new SupabaseDeploymentActivationExecutionNextItemStartRepository(client);
  try {
    await repository.startNextItemAtomically(command());
  } catch {
    // expected
  }
  return expectScenario("repository does not retry", client.calls.rpc === 1, JSON.stringify(client.calls));
}

async function expectRpcStatus(status: "started" | "already_started" | "blocked" | "conflict" | "not_found", ok: boolean) {
  const result = mapNextItemStartRpcResult(rpcRow(status));
  return expectScenario(`${status} mapping`, result.status === status && result.ok === ok && result.itemId === itemId(2), JSON.stringify(result));
}

function sessionRow(input: Partial<ReturnType<typeof baseSessionRow>> = {}) { return { ...baseSessionRow(), ...input }; }
function baseSessionRow() {
  return {
    id: SESSION_ID,
    clinic_id: CLINIC_ID,
    deployment_run_key: DEPLOYMENT_RUN_KEY,
    execution_key: EXECUTION_KEY,
    plan_key: PLAN_KEY,
    preparation_status: "ready",
    execution_status: "running",
    execution_owner: OWNER,
    ownership_token: TOKEN,
    lease_expires_at: LEASE,
    started_at: "2026-01-01T12:00:00.000Z",
    completed_at: null,
    failed_at: null,
    items_requested: 3,
  };
}

function rows(): NextItemStartItemRow[] { return [row(1, { execution_status: "succeeded", attempt_count: 1, started_at: "2026-01-01T12:01:00.000Z", completed_at: "2026-01-01T12:02:00.000Z" }), row(2, { execution_status: "ready" }), row(3)]; }
function row(sequence: number, input: Partial<NextItemStartItemRow> = {}): NextItemStartItemRow {
  return {
    id: itemId(sequence),
    session_id: SESSION_ID,
    execution_item_key: executionItemKey(sequence),
    plan_item_key: planItemKey(sequence),
    sequence,
    entity_type: sequence === 1 ? "clinic" : "provider_shell",
    entity_id: sequence === 1 ? CLINIC_ID : `dentist-${String(sequence - 1).padStart(3, "0")}`,
    action: "activate",
    execution_status: "pending",
    attempt_count: 0,
    started_at: null,
    completed_at: null,
    rolled_back_at: null,
    error_code: null,
    error_message: null,
    dependency_keys: sequence === 1 ? [] : [planItemKey(sequence - 1)],
    expected_current_state: { provisioningStatus: "planned", active: false },
    target_state: { provisioningStatus: "active", active: true },
    reversible: true,
    rollback_action: "restore planned inactive shell state",
    ...input,
  };
}

function command(input: Partial<DeploymentActivationExecutionAtomicNextItemStartCommand> = {}): DeploymentActivationExecutionAtomicNextItemStartCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunKey: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    claimantId: OWNER,
    ownershipToken: TOKEN,
    expectedLeaseExpiresAt: LEASE,
    itemId: itemId(2),
    executionItemKey: executionItemKey(2),
    planItemKey: planItemKey(2),
    expectedSequence: 2,
    expectedEntityType: "provider_shell",
    expectedEntityId: "dentist-001",
    expectedAction: "activate",
    expectedAttemptCount: 0,
    expectedDependencyKeys: [planItemKey(1)],
    proposedStartedAt: STARTED_AT,
    ...input,
  };
}

function rpcRow(status: "started" | "already_started" | "blocked" | "conflict" | "not_found") {
  return {
    status,
    clinic_id: CLINIC_ID,
    deployment_run_key: DEPLOYMENT_RUN_KEY,
    session_id: SESSION_ID,
    execution_key: EXECUTION_KEY,
    item_id: itemId(2),
    execution_item_key: executionItemKey(2),
    plan_item_key: planItemKey(2),
    sequence: 2,
    entity_type: "provider_shell",
    entity_id: "dentist-001",
    action: "activate",
    attempt_count: status === "started" || status === "already_started" ? 1 : 0,
    started_at: status === "started" || status === "already_started" ? STARTED_AT : null,
    lease_expires_at: LEASE,
    issue_code: status === "started" || status === "already_started" ? null : "blocked_issue",
    message: `${status} message`,
  };
}

function mockClient(input: { sessions?: unknown[]; items?: unknown[]; sessionError?: unknown; itemError?: unknown; rpcData?: unknown; rpcError?: unknown } = {}) {
  const calls = { from: 0, rpc: 0 };
  const client = {
    calls,
    from(table: string) {
      calls.from += 1;
      const isSession = table === "deployment_activation_execution_sessions";
      const response = {
        data: isSession ? input.sessions ?? [sessionRow()] : input.items ?? rows(),
        error: isSession ? input.sessionError ?? null : input.itemError ?? null,
      };
      return queryBuilder(response);
    },
    async rpc(_name: string, _payload: Record<string, unknown>) {
      calls.rpc += 1;
      return { data: input.rpcData ?? [rpcRow("started")], error: input.rpcError ?? null };
    },
  };
  return client as unknown as SupabaseClient & { calls: typeof calls };
}

function queryBuilder(response: { data: unknown; error: unknown }) {
  const orders: Array<{ column: string; ascending: boolean }> = [];
  const orderedResponse = () => ({
    ...response,
    data: Array.isArray(response.data)
      ? [...response.data].sort((left, right) => compareMockRows(left, right, orders))
      : response.data,
  });

  return {
    select() { return this; },
    eq() { return this; },
    order(column: string, options?: { ascending?: boolean }) {
      orders.push({ column, ascending: options?.ascending !== false });
      return this;
    },
    limit() { return Promise.resolve(orderedResponse()); },
    then(resolve: (value: { data: unknown; error: unknown }) => unknown) { return Promise.resolve(orderedResponse()).then(resolve); },
  };
}

function compareMockRows(
  left: unknown,
  right: unknown,
  orders: readonly { column: string; ascending: boolean }[],
): number {
  if (!isRecord(left) || !isRecord(right)) {
    return 0;
  }

  for (const { column, ascending } of orders) {
    const comparison = compareMockValues(left[column], right[column]);
    if (comparison !== 0) {
      return ascending ? comparison : -comparison;
    }
  }

  return 0;
}

function compareMockValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0;
  }
  if (left === null || left === undefined) {
    return -1;
  }
  if (right === null || right === undefined) {
    return 1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function itemId(sequence: number): string { return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`; }
function executionItemKey(sequence: number): string { return `${EXECUTION_KEY}:${planItemKey(sequence)}`; }
function planItemKey(sequence: number): string { return sequence === 1 ? `${PLAN_KEY}:clinic` : `${PLAN_KEY}:provider-${String(sequence - 1).padStart(3, "0")}`; }

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => key === "p_ownership_token" || key === "ownershipToken" ? "[redacted]" : entry));
}

function expectScenario(name: string, passed: boolean, message: string): DeploymentActivationExecutionNextItemStartSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}