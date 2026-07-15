import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertAtMostOne,
  clinicActivationRpcPayload,
  mapClinicActivationClinicRow,
  mapClinicActivationItemRow,
  mapClinicActivationRpcResult,
  mapClinicActivationSessionRow,
  SupabaseDeploymentClinicActivationRepository,
  type ClinicActivationItemRow,
} from "./deployment-clinic-activation-supabase-repository";
import type {
  DeploymentClinicActivationAtomicCommand,
} from "./deployment-clinic-activation-types";

export interface DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentClinicActivationSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentClinicActivationSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-activation-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-clinic-activation-0001";
const SESSION_ID = "activation-execution-session-clinic-activation-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-clinic-activation-0001";
const ITEM_ID = "activation-execution-item-clinic-0001";
const EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:activation-plan-clinic-activation-0001:clinic`;
const PLAN_ITEM_KEY = "activation-plan-clinic-activation-0001:clinic";
const CLAIMANT_ID = "executor-clinic-activation-001";
const OWNERSHIP_TOKEN = "sensitive-clinic-activation-token";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const ITEM_STARTED_AT = "2026-01-01T12:00:30.000Z";
const ACTIVATED_AT = "2026-01-01T12:01:00.000Z";

export async function runDeploymentClinicActivationSupabaseRepositoryHarness(): Promise<DeploymentClinicActivationSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSnapshotSessionMapping(),
    scenarioSnapshotItemMapping(),
    scenarioClinicRowMapping(),
    scenarioCanonicalCurrentStateMapping(),
    await scenarioLoadSnapshot(),
    await scenarioMissingSession(),
    scenarioAmbiguousSession(),
    await scenarioMissingItem(),
    scenarioAmbiguousItem(),
    await scenarioMissingClinic(),
    scenarioRpcPayloadShape(),
    scenarioOwnerTokenLeasePayload(),
    scenarioItemIdentityPayload(),
    scenarioExpectedCurrentStatePayload(),
    scenarioTargetStatePayload(),
    scenarioActivationTimestampPayload(),
    scenarioActivatedResultMapping(),
    scenarioAlreadyActivatedResultMapping(),
    scenarioBlockedResultMapping(),
    scenarioConflictResultMapping(),
    scenarioNotFoundResultMapping(),
    scenarioMalformedRpcResponse(),
    await scenarioUnexpectedRpcStatus(),
    await scenarioMultipleRpcRows(),
    await scenarioSupabaseErrorSanitization(),
    scenarioTokenRedaction(),
    scenarioNoGenericMutationMethods(),
    scenarioNoExecutionItemCompletionMethod(),
    scenarioNoDependencyUnlockMethod(),
    scenarioNoShellMutationMethods(),
    await scenarioSourcePayloadImmutability(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioSnapshotSessionMapping(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const mapped = mapClinicActivationSessionRow(sessionRow());
  return expectScenario(
    "snapshot session mapping",
    mapped.sessionId === SESSION_ID &&
      mapped.deploymentRunId === DEPLOYMENT_RUN_KEY &&
      mapped.executionStatus === "running" &&
      mapped.executionOwner === CLAIMANT_ID &&
      mapped.leaseExpiresAt === ACTIVE_LEASE,
    JSON.stringify(redactEvidence(mapped)),
  );
}

function scenarioSnapshotItemMapping(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const mapped = mapClinicActivationItemRow(itemRow());
  return expectScenario(
    "snapshot item mapping",
    mapped.itemId === ITEM_ID &&
      mapped.sequence === 1 &&
      mapped.entityType === "clinic" &&
      mapped.entityKey === CLINIC_ID &&
      mapped.dependencyKeys.length === 0 &&
      mapped.expectedCurrentState?.deploymentStatus === "draft",
    JSON.stringify(mapped),
  );
}

function scenarioClinicRowMapping(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const mapped = mapClinicActivationClinicRow(clinicRow(), runLinkRow());
  return expectScenario(
    "clinic row mapping",
    mapped.id === CLINIC_ID &&
      mapped.deploymentRunId === DEPLOYMENT_RUN_KEY &&
      mapped.deploymentStatus === "draft" &&
      mapped.active === false &&
      mapped.provisioningSource === "setup_draft" &&
      mapped.provisioningStatus === "planned",
    JSON.stringify(mapped),
  );
}

function scenarioCanonicalCurrentStateMapping(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const mapped = mapClinicActivationClinicRow(clinicRow(), runLinkRow());
  return expectScenario(
    "canonical current-state mapping",
    mapped.currentState?.clinicId === CLINIC_ID &&
      mapped.currentState?.deploymentStatus === "draft",
    JSON.stringify(mapped.currentState),
  );
}

async function scenarioLoadSnapshot(): Promise<DeploymentClinicActivationSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient(tables());
  const repository = new SupabaseDeploymentClinicActivationRepository(client as unknown as SupabaseClient);
  const snapshot = await repository.loadClinicActivationSnapshot(query());

  return expectScenario(
    "load snapshot",
    snapshot.session?.sessionId === SESSION_ID &&
      snapshot.item?.itemId === ITEM_ID &&
      snapshot.clinic?.id === CLINIC_ID &&
      client.calls.filter((call) => call.operation === "select").length === 4,
    JSON.stringify(redactEvidence(snapshot)),
  );
}

async function scenarioMissingSession(): Promise<DeploymentClinicActivationSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentClinicActivationRepository(new MockSupabaseClient({ clinics: [clinicRow()], deployment_runs: [runLinkRow()] }) as unknown as SupabaseClient);
  const snapshot = await repository.loadClinicActivationSnapshot(query());
  return expectScenario("missing session", snapshot.session === null && snapshot.item === null && snapshot.clinic !== null, JSON.stringify(snapshot));
}

function scenarioAmbiguousSession(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  return expectThrows("ambiguous session", () => assertAtMostOne([{}, {}], "clinic activation session"), "Ambiguous clinic activation session");
}

async function scenarioMissingItem(): Promise<DeploymentClinicActivationSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentClinicActivationRepository(new MockSupabaseClient({ ...tables(), deployment_activation_execution_items: [] }) as unknown as SupabaseClient);
  const snapshot = await repository.loadClinicActivationSnapshot(query());
  return expectScenario("missing item", snapshot.session !== null && snapshot.item === null && snapshot.clinic !== null, JSON.stringify(snapshot));
}

function scenarioAmbiguousItem(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  return expectThrows("ambiguous item", () => assertAtMostOne([{}, {}], "clinic activation item"), "Ambiguous clinic activation item");
}

async function scenarioMissingClinic(): Promise<DeploymentClinicActivationSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentClinicActivationRepository(new MockSupabaseClient({ ...tables(), clinics: [] }) as unknown as SupabaseClient);
  const snapshot = await repository.loadClinicActivationSnapshot(query());
  return expectScenario("missing clinic", snapshot.session !== null && snapshot.item !== null && snapshot.clinic === null, JSON.stringify(redactEvidence(snapshot)));
}

function scenarioRpcPayloadShape(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const payload = clinicActivationRpcPayload(command());
  return expectScenario(
    "RPC payload shape",
    payload.p_clinic_id === CLINIC_ID &&
      payload.p_deployment_run_key === DEPLOYMENT_RUN_KEY &&
      payload.p_session_id === SESSION_ID &&
      payload.p_execution_key === EXECUTION_KEY &&
      Object.keys(payload).length === 15,
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioOwnerTokenLeasePayload(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const payload = clinicActivationRpcPayload(command());
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

function scenarioItemIdentityPayload(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const payload = clinicActivationRpcPayload(command());
  return expectScenario(
    "item identity payload",
    payload.p_item_id === ITEM_ID &&
      payload.p_execution_item_key === EXECUTION_ITEM_KEY &&
      payload.p_plan_item_key === PLAN_ITEM_KEY &&
      payload.p_expected_item_started_at === ITEM_STARTED_AT &&
      payload.p_expected_attempt_count === 1,
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioExpectedCurrentStatePayload(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const source = command();
  const payload = clinicActivationRpcPayload(source);
  const state = payload.p_expected_current_state as Record<string, unknown>;
  state.deploymentStatus = "mutated";

  return expectScenario(
    "expected current state payload",
    (payload.p_expected_current_state as Record<string, unknown>).clinicId === CLINIC_ID &&
      source.expectedCurrentState.deploymentStatus === "draft",
    JSON.stringify(redactPayload(payload)),
  );
}

function scenarioTargetStatePayload(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const payload = clinicActivationRpcPayload(command());
  return expectScenario("target state payload", (payload.p_target_state as Record<string, unknown>).deploymentStatus === "active", JSON.stringify(redactPayload(payload)));
}

function scenarioActivationTimestampPayload(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const payload = clinicActivationRpcPayload(command());
  return expectScenario("activation timestamp payload", payload.p_proposed_activated_at === ACTIVATED_AT, JSON.stringify(redactPayload(payload)));
}

function scenarioActivatedResultMapping(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const result = mapClinicActivationRpcResult(rpcRow({ status: "activated" }));
  return expectScenario("activated result mapping", result.ok && result.status === "activated" && result.activatedAt === ACTIVATED_AT, JSON.stringify(result));
}

function scenarioAlreadyActivatedResultMapping(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const result = mapClinicActivationRpcResult(rpcRow({ status: "already_activated" }));
  return expectScenario("already_activated result mapping", result.ok && result.status === "already_activated", JSON.stringify(result));
}

function scenarioBlockedResultMapping(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const result = mapClinicActivationRpcResult(rpcRow({ status: "blocked", issue_code: "lease_not_active" }));
  return expectScenario("blocked result mapping", !result.ok && result.status === "blocked" && result.issueCode === "lease_not_active", JSON.stringify(result));
}

function scenarioConflictResultMapping(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const result = mapClinicActivationRpcResult(rpcRow({ status: "conflict", issue_code: "ownership_compare_failed" }));
  return expectScenario("conflict result mapping", !result.ok && result.status === "conflict", JSON.stringify(result));
}

function scenarioNotFoundResultMapping(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const result = mapClinicActivationRpcResult(rpcRow({ status: "not_found", clinic_id: null }));
  return expectScenario("not_found result mapping", !result.ok && result.status === "not_found" && result.clinicId === null, JSON.stringify(result));
}

function scenarioMalformedRpcResponse(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  return expectThrows("malformed RPC response", () => mapClinicActivationRpcResult(rpcRow({ status: "surprise" })), "Malformed clinic activation RPC status");
}

async function scenarioUnexpectedRpcStatus(): Promise<DeploymentClinicActivationSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentClinicActivationRepository(new MockSupabaseClient({}, { activate_deployment_clinic: [rpcRow({ status: "unexpected" })] }) as unknown as SupabaseClient);
  try {
    await repository.activateClinicAtomically(command());
  } catch (error) {
    return expectScenario("unexpected RPC status", error instanceof Error && !String(error).includes(OWNERSHIP_TOKEN), String(error));
  }
  return expectScenario("unexpected RPC status", false, "unexpected status accepted");
}

async function scenarioMultipleRpcRows(): Promise<DeploymentClinicActivationSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentClinicActivationRepository(new MockSupabaseClient({}, { activate_deployment_clinic: [rpcRow(), rpcRow()] }) as unknown as SupabaseClient);
  try {
    await repository.activateClinicAtomically(command());
  } catch (error) {
    return expectScenario("multiple RPC rows", error instanceof Error && String(error).includes("Ambiguous"), String(error));
  }
  return expectScenario("multiple RPC rows", false, "multiple rows accepted");
}

async function scenarioSupabaseErrorSanitization(): Promise<DeploymentClinicActivationSupabaseRepositoryHarnessScenario> {
  const repository = new SupabaseDeploymentClinicActivationRepository(new MockSupabaseClient({}, {}, {
    message: `database failed ${OWNERSHIP_TOKEN}`,
    code: "PGRST000",
    details: `RPC details include ${OWNERSHIP_TOKEN} function body context.`,
    hint: "Check activate_deployment_clinic input evidence.",
  }) as unknown as SupabaseClient);
  try {
    await repository.activateClinicAtomically(command());
  } catch (error) {
    const repositoryError = error as { diagnostics?: Record<string, unknown> };
    return expectScenario(
      "Supabase RPC error diagnostics are preserved with ownership-token redaction",
      error instanceof Error &&
        !error.message.includes(OWNERSHIP_TOKEN) &&
        repositoryError.diagnostics?.errorCode === "PGRST000" &&
        repositoryError.diagnostics?.errorMessage === "database failed [redacted]" &&
        repositoryError.diagnostics?.errorDetails === "RPC details include [redacted] function body context." &&
        repositoryError.diagnostics?.errorHint === "Check activate_deployment_clinic input evidence.",
      JSON.stringify(repositoryError.diagnostics),
    );
  }
  return expectScenario("Supabase RPC error diagnostics are preserved with ownership-token redaction", false, "error not thrown");
}

function scenarioTokenRedaction(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const payload = clinicActivationRpcPayload(command());
  const result = mapClinicActivationRpcResult(rpcRow({ status: "conflict", message: "Ownership compare-and-set failed." }));
  return expectScenario(
    "token redaction",
    payload.p_ownership_token === OWNERSHIP_TOKEN &&
      !JSON.stringify(result).includes(OWNERSHIP_TOKEN) &&
      !result.message.includes(OWNERSHIP_TOKEN),
    JSON.stringify(result),
  );
}

function scenarioNoGenericMutationMethods(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no generic mutation methods", ["update", "insert", "upsert", "delete", "patch", "save"]);
}

function scenarioNoExecutionItemCompletionMethod(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no execution item completion method", ["completeItem", "markSucceeded", "markItemSucceeded", "failItem", "rollbackItem"]);
}

function scenarioNoDependencyUnlockMethod(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no dependency unlock method", ["unlockDependencies", "unlockDependentItems", "startNextItem"]);
}

function scenarioNoShellMutationMethods(): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  return expectNoMethods("no provider sterilizer workstation hardware mutation method", ["activateProvider", "activateSterilizer", "activateWorkstation", "activateHardware", "bindHardware"]);
}

async function scenarioSourcePayloadImmutability(): Promise<DeploymentClinicActivationSupabaseRepositoryHarnessScenario> {
  const source = command();
  const before = JSON.stringify(source);
  const payload = clinicActivationRpcPayload(source);
  (payload.p_target_state as Record<string, unknown>).deploymentStatus = "mutated";
  return expectScenario("source payload immutability", JSON.stringify(source) === before, JSON.stringify(redactPayload(payload)));
}

function expectNoMethods(name: string, forbidden: readonly string[]): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentClinicActivationRepository.prototype as Record<string, unknown>;
  return expectScenario(name, forbidden.every((method) => !(method in prototype)), forbidden.filter((method) => method in prototype).join(","));
}

function expectThrows(name: string, action: () => unknown, expected: string): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
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

function command(input: Partial<DeploymentClinicActivationAtomicCommand> = {}): DeploymentClinicActivationAtomicCommand {
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
    expectedItemStartedAt: ITEM_STARTED_AT,
    expectedAttemptCount: 1,
    expectedCurrentState: { clinicId: CLINIC_ID, deploymentStatus: "draft" },
    targetState: { deploymentStatus: "active" },
    proposedActivatedAt: ACTIVATED_AT,
    ...input,
  };
}

function tables() {
  return {
    deployment_activation_execution_sessions: [sessionRow()],
    deployment_activation_execution_items: [itemRow()],
    clinics: [clinicRow()],
    deployment_runs: [runLinkRow()],
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
    started_at: input.started_at ?? SESSION_STARTED_AT,
    completed_at: input.completed_at ?? null,
    failed_at: input.failed_at ?? null,
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function itemRow(input: Partial<ClinicActivationItemRow> = {}): ClinicActivationItemRow {
  return {
    id: input.id ?? ITEM_ID,
    session_id: input.session_id ?? SESSION_ID,
    execution_item_key: input.execution_item_key ?? EXECUTION_ITEM_KEY,
    plan_item_key: input.plan_item_key ?? PLAN_ITEM_KEY,
    sequence: input.sequence ?? 1,
    entity_type: input.entity_type ?? "clinic",
    deployment_key: input.deployment_key ?? CLINIC_ID,
    entity_id: input.entity_id ?? CLINIC_ID,
    action: input.action ?? "activate",
    execution_status: input.execution_status ?? "running",
    attempt_count: input.attempt_count ?? 1,
    started_at: input.started_at ?? ITEM_STARTED_AT,
    completed_at: input.completed_at ?? null,
    rolled_back_at: input.rolled_back_at ?? null,
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
    dependency_keys: input.dependency_keys ?? [],
    reversible: input.reversible ?? true,
    rollback_action: input.rollback_action ?? "restore clinic deployment status to draft",
    expected_current_state: input.expected_current_state ?? { clinicId: CLINIC_ID, deploymentStatus: "draft" },
    target_state: input.target_state ?? { deploymentStatus: "active" },
  };
}

function clinicRow(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: input.id ?? CLINIC_ID,
    deployment_status: input.deployment_status ?? "draft",
    deployed_at: input.deployed_at ?? null,
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function runLinkRow(input: Partial<Record<string, unknown>> = {}) {
  return {
    deployment_run_id: input.deployment_run_id ?? DEPLOYMENT_RUN_KEY,
    clinic_id: input.clinic_id ?? CLINIC_ID,
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function rpcRow(input: Partial<Record<keyof ReturnType<typeof baseRpcRow>, unknown>> = {}) {
  return { ...baseRpcRow(), ...input };
}

function baseRpcRow() {
  return {
    status: "activated",
    clinic_id: CLINIC_ID,
    deployment_run_key: DEPLOYMENT_RUN_KEY,
    session_id: SESSION_ID,
    execution_key: EXECUTION_KEY,
    item_id: ITEM_ID,
    execution_item_key: EXECUTION_ITEM_KEY,
    plan_item_key: PLAN_ITEM_KEY,
    clinic_state_before: { clinicId: CLINIC_ID, deploymentStatus: "draft" },
    clinic_state_after: { clinicId: CLINIC_ID, deploymentStatus: "active" },
    activated_at: ACTIVATED_AT,
    issue_code: null,
    message: "Clinic deployment status was activated. Execution item remains running.",
  };
}

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, p_ownership_token: "[redacted]" };
}

function redactEvidence(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => key === "ownershipToken" ? "[redacted]" : entry));
}

class MockSupabaseClient {
  readonly calls: Array<{ table: string; operation: string }> = [];
  readonly rpcCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];

  constructor(
    readonly tableRows: Record<string, unknown[]> = {},
    readonly rpcResults: Record<string, unknown> = {},
    readonly error: { message: string; code?: string; details?: string | null; hint?: string | null } | null = null,
  ) {}

  from(table: string): MockQuery {
    return new MockQuery(this, table);
  }

  async rpc(name: string, payload: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string; details?: string | null; hint?: string | null } | null }> {
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
    onfulfilled?: ((value: { data: unknown[]; error: { message: string; code?: string; details?: string | null; hint?: string | null } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.executeMany()).then(onfulfilled, onrejected);
  }

  private executeMany(): { data: unknown[]; error: { message: string; code?: string; details?: string | null; hint?: string | null } | null } {
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
): DeploymentClinicActivationSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}