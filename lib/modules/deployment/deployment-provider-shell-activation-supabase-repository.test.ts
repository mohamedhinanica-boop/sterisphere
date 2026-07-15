import { readFileSync } from "node:fs";`r`nimport type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateProviderShellActivationRows,
  assertAtMostOne,
  DeploymentProviderShellActivationRepositoryError,
  mapProviderShellActivationItemRow,
  mapProviderShellActivationProviderRow,
  mapProviderShellActivationRpcResult,
  mapProviderShellActivationSessionRow,
  providerShellActivationRpcPayload,
  readSingleRpcRow,
  SupabaseDeploymentProviderShellActivationRepository,
  type ProviderShellActivationItemRow,
  type ProviderShellActivationProviderRow,
} from "./deployment-provider-shell-activation-supabase-repository";
import type {
  DeploymentProviderShellActivationAtomicCommand,
} from "./deployment-provider-shell-activation-types";

export interface DeploymentProviderShellActivationSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentProviderShellActivationSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentProviderShellActivationSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const DEPLOYMENT_RUN_KEY = "deployment-run-provider-activation-0001";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const EXECUTION_KEY = "activation-execution-provider-activation-0001";
const PLAN_KEY = "activation-plan-provider-activation-0001";
const OWNER = "executor-provider-activation-001";
const TOKEN = "sensitive-provider-activation-token";
const LEASE = "2026-01-01T12:20:00.000Z";
const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_KEY = "dentist-001";
const ITEM_STARTED_AT = "2026-01-01T12:05:00.000Z";
const ACTIVATED_AT = "2026-01-01T12:06:00.000Z";

export async function runDeploymentProviderShellActivationSupabaseRepositoryHarness(): Promise<DeploymentProviderShellActivationSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSessionMapping(),
    scenarioItemMapping(),
    scenarioProviderMapping(),
    await scenarioSnapshotMapping(),
    await scenarioDeterministicItemOrdering(),
    scenarioAggregateCounts(),
    scenarioDuplicateProviderIdentityMapping(),
    await scenarioMissingSession(),
    scenarioMissingItem(),
    await scenarioMissingProvider(),
    await scenarioAmbiguousProviderIdentity(),
    scenarioRpcPayloadShape(),
    scenarioOwnerTokenLeasePayload(),
    scenarioItemIdentityPayload(),
    scenarioProviderIdentityPayload(),
    scenarioExpectedCurrentStatePayload(),
    scenarioTargetStatePayload(),
    scenarioProposedActivationTimestampPayload(),
    scenarioActivatedMapping(),
    scenarioAlreadyActivatedMapping(),
    scenarioBlockedMapping(),
    scenarioConflictMapping(),
    scenarioNotFoundMapping(),
    scenarioMalformedRpcResponse(),
    scenarioMultipleRpcRows(),
    await scenarioSnapshotErrorSanitization(),
    await scenarioRpcErrorSanitization(),
    scenarioTokenRedaction(),
    scenarioSourceImmutability(),
    scenarioNoFallbackMutationMethods(),
    scenarioNoGenericUpdateUpsertMethods(),
    scenarioNoExecutionItemMutationMethods(),
    scenarioNoSessionMutationMethods(),
    await scenarioRepositoryDoesNotRetry(),
    scenarioSqlSourceExpectations(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioSessionMapping() {
  const mapped = mapProviderShellActivationSessionRow(sessionRow());
  return expectScenario("deterministic session snapshot mapping", mapped.sessionId === SESSION_ID && mapped.itemsRequested === 3 && mapped.ownershipToken === TOKEN, JSON.stringify(redact(mapped)));
}

function scenarioItemMapping() {
  const mapped = mapProviderShellActivationItemRow(itemRow(2));
  return expectScenario("selected running item mapping", mapped.sequence === 2 && mapped.entityType === "provider_shell" && mapped.entityId === PROVIDER_KEY && mapped.dependencyKeys[0] === planItemKey(1), JSON.stringify(mapped));
}

function scenarioProviderMapping() {
  const mapped = mapProviderShellActivationProviderRow(providerRow());
  return expectScenario("provider mapping", mapped.providerId === PROVIDER_ID && mapped.clinicId === CLINIC_ID && mapped.deploymentProviderKey === PROVIDER_KEY && mapped.currentState?.provisioningStatus === "placeholder", JSON.stringify(mapped));
}

async function scenarioSnapshotMapping() {
  const repository = new SupabaseDeploymentProviderShellActivationRepository(mockClient({ sessions: [sessionRow()], items: rows(), providers: [providerRow()] }));
  const snapshot = await repository.loadProviderShellActivationSnapshot(query());
  return expectScenario("deterministic snapshot mapping", snapshot.session?.sessionId === SESSION_ID && snapshot.items.length === 3 && snapshot.providerShell?.providerId === PROVIDER_ID, JSON.stringify(redact(snapshot)));
}

async function scenarioDeterministicItemOrdering() {
  const repository = new SupabaseDeploymentProviderShellActivationRepository(mockClient({ sessions: [sessionRow()], items: [rows()[2], rows()[0], rows()[1]], providers: [providerRow()] }));
  const snapshot = await repository.loadProviderShellActivationSnapshot(query());
  return expectScenario("deterministic item ordering", snapshot.items.map((item) => item.sequence).join(",") === "1,2,3", JSON.stringify(snapshot.items.map((item) => item.sequence)));
}

function scenarioAggregateCounts() {
  const aggregate = aggregateProviderShellActivationRows(rows(), [providerRow()]);
  return expectScenario("aggregate count mapping", aggregate.totalItemCount === 3 && aggregate.succeededItemCount === 1 && aggregate.runningItemCount === 1 && aggregate.pendingItemCount === 1 && aggregate.providerCandidateCount === 1, JSON.stringify(aggregate));
}

function scenarioDuplicateProviderIdentityMapping() {
  const aggregate = aggregateProviderShellActivationRows(rows(), [providerRow(), providerRow({ id: "44444444-4444-4444-8444-444444444444" })]);
  return expectScenario("duplicate provider identity mapping", aggregate.providerCandidateCount === 2 && aggregate.duplicateProviderIdentityCount === 1, JSON.stringify(aggregate));
}

async function scenarioMissingSession() {
  const repository = new SupabaseDeploymentProviderShellActivationRepository(mockClient({ sessions: [], items: rows(), providers: [providerRow()] }));
  const snapshot = await repository.loadProviderShellActivationSnapshot(query());
  return expectScenario("missing session", snapshot.session === null && snapshot.items.length === 0 && snapshot.providerShell === null && snapshot.aggregate.totalItemCount === 0, JSON.stringify(snapshot));
}

function scenarioMissingItem() {
  const aggregate = aggregateProviderShellActivationRows([], [providerRow()]);
  return expectScenario("missing item aggregate", aggregate.runningItemCount === 0 && aggregate.totalItemCount === 0, JSON.stringify(aggregate));
}

async function scenarioMissingProvider() {
  const repository = new SupabaseDeploymentProviderShellActivationRepository(mockClient({ sessions: [sessionRow()], items: rows(), providers: [] }));
  const snapshot = await repository.loadProviderShellActivationSnapshot(query());
  return expectScenario("missing provider", snapshot.providerShell === null && snapshot.aggregate.providerCandidateCount === 0, JSON.stringify(snapshot));
}

async function scenarioAmbiguousProviderIdentity() {
  const repository = new SupabaseDeploymentProviderShellActivationRepository(mockClient({ sessions: [sessionRow()], items: rows(), providers: [providerRow(), providerRow({ id: "44444444-4444-4444-8444-444444444444" })] }));
  const snapshot = await repository.loadProviderShellActivationSnapshot(query());
  return expectScenario("ambiguous provider identity", snapshot.providerShell === null && snapshot.aggregate.providerCandidateCount === 2 && snapshot.aggregate.duplicateProviderIdentityCount === 1, JSON.stringify(snapshot.aggregate));
}

function scenarioRpcPayloadShape() {
  const keys = Object.keys(providerShellActivationRpcPayload(command())).sort().join(",");
  return expectScenario("RPC payload shape", keys === [
    "p_claimant_id",
    "p_clinic_id",
    "p_deployment_run_key",
    "p_execution_item_key",
    "p_execution_key",
    "p_expected_action",
    "p_expected_attempt_count",
    "p_expected_current_state",
    "p_expected_entity_id",
    "p_expected_entity_type",
    "p_expected_item_started_at",
    "p_expected_lease_expires_at",
    "p_expected_provider_key",
    "p_expected_sequence",
    "p_item_id",
    "p_ownership_token",
    "p_plan_item_key",
    "p_provider_id",
    "p_proposed_activated_at",
    "p_session_id",
    "p_target_state",
  ].sort().join(","), keys);
}

function scenarioOwnerTokenLeasePayload() { const payload = providerShellActivationRpcPayload(command()); return expectScenario("owner/token/lease CAS payload", payload.p_claimant_id === OWNER && payload.p_ownership_token === TOKEN && payload.p_expected_lease_expires_at === LEASE, JSON.stringify(redact(payload))); }
function scenarioItemIdentityPayload() { const payload = providerShellActivationRpcPayload(command()); return expectScenario("item identity payload", payload.p_item_id === itemId(2) && payload.p_execution_item_key === executionItemKey(2) && payload.p_plan_item_key === planItemKey(2) && payload.p_expected_sequence === 2, JSON.stringify(redact(payload))); }
function scenarioProviderIdentityPayload() { const payload = providerShellActivationRpcPayload(command()); return expectScenario("provider identity payload", payload.p_provider_id === PROVIDER_ID && payload.p_expected_provider_key === PROVIDER_KEY, JSON.stringify(redact(payload))); }
function scenarioExpectedCurrentStatePayload() { const source = command(); const payload = providerShellActivationRpcPayload(source); (payload.p_expected_current_state as Record<string, unknown>).active = true; return expectScenario("expected current state payload", source.expectedCurrentState.active === false && (payload.p_expected_current_state as Record<string, unknown>).provisioningStatus === "placeholder", JSON.stringify(redact(payload))); }
function scenarioTargetStatePayload() { const payload = providerShellActivationRpcPayload(command()); return expectScenario("target state payload", (payload.p_target_state as Record<string, unknown>).active === true && (payload.p_target_state as Record<string, unknown>).provisioningStatus === "active", JSON.stringify(redact(payload))); }
function scenarioProposedActivationTimestampPayload() { const payload = providerShellActivationRpcPayload(command()); return expectScenario("proposed activation timestamp payload", payload.p_proposed_activated_at === ACTIVATED_AT, JSON.stringify(redact(payload))); }

function scenarioActivatedMapping() { return expectRpcStatus("activated", true); }
function scenarioAlreadyActivatedMapping() { return expectRpcStatus("already_activated", true); }
function scenarioBlockedMapping() { return expectRpcStatus("blocked", false); }
function scenarioConflictMapping() { return expectRpcStatus("conflict", false); }
function scenarioNotFoundMapping() { return expectRpcStatus("not_found", false); }

function scenarioMalformedRpcResponse() {
  try {
    readSingleRpcRow(null);
    return expectScenario("malformed RPC response", false, "did not throw");
  } catch (caught) {
    return expectScenario("malformed RPC response", caught instanceof DeploymentProviderShellActivationRepositoryError, String(caught));
  }
}

function scenarioMultipleRpcRows() {
  try {
    readSingleRpcRow([rpcRow("activated"), rpcRow("activated")]);
    return expectScenario("multiple RPC rows", false, "did not throw");
  } catch (caught) {
    return expectScenario("multiple RPC rows", caught instanceof DeploymentProviderShellActivationRepositoryError, String(caught));
  }
}

async function scenarioSnapshotErrorSanitization() {
  const repository = new SupabaseDeploymentProviderShellActivationRepository(mockClient({ sessionError: { message: `snapshot ${TOKEN}`, code: "PGRST100", details: `details ${TOKEN}`, hint: `hint ${TOKEN}` } }));
  try {
    await repository.loadProviderShellActivationSnapshot(query());
    return expectScenario("Supabase snapshot error sanitization", false, "did not throw");
  } catch (caught) {
    const serialized = JSON.stringify(caught);
    return expectScenario("Supabase snapshot error sanitization", caught instanceof DeploymentProviderShellActivationRepositoryError && !serialized.includes(TOKEN), serialized);
  }
}

async function scenarioRpcErrorSanitization() {
  const repository = new SupabaseDeploymentProviderShellActivationRepository(mockClient({ rpcError: { message: `rpc ${TOKEN}`, code: "42804", details: `details ${TOKEN}`, hint: `hint ${TOKEN}` } }));
  try {
    await repository.activateProviderShellAtomically(command());
    return expectScenario("Supabase RPC error sanitization", false, "did not throw");
  } catch (caught) {
    const serialized = JSON.stringify(caught);
    return expectScenario("Supabase RPC error sanitization", caught instanceof DeploymentProviderShellActivationRepositoryError && !serialized.includes(TOKEN), serialized);
  }
}

function scenarioTokenRedaction() { return expectScenario("token redaction", !JSON.stringify(redact(providerShellActivationRpcPayload(command()))).includes(TOKEN), JSON.stringify(redact(providerShellActivationRpcPayload(command())))); }
function scenarioSourceImmutability() { const source = command(); const before = JSON.stringify(source); providerShellActivationRpcPayload(source); return expectScenario("source immutability", JSON.stringify(source) === before, JSON.stringify(source)); }

function scenarioNoFallbackMutationMethods() { return expectNoMethods("no fallback mutation methods", ["insert", "update", "upsert", "patch", "save", "delete", "activateAnyProvider", "activateProvider", "completeItem", "progressDependency"]); }
function scenarioNoGenericUpdateUpsertMethods() { return expectNoMethods("no generic update/upsert methods", ["update", "upsert", "patch", "save"]); }
function scenarioNoExecutionItemMutationMethods() { return expectNoMethods("no execution item mutation methods", ["completeItem", "startItem", "progressItem", "failItem", "rollbackItem"]); }
function scenarioNoSessionMutationMethods() { return expectNoMethods("no session mutation methods", ["updateSession", "renewLease", "rotateToken", "completeSession"]); }

async function scenarioRepositoryDoesNotRetry() {
  const client = mockClient({ rpcError: { message: "rpc failed" } });
  const repository = new SupabaseDeploymentProviderShellActivationRepository(client);
  try {
    await repository.activateProviderShellAtomically(command());
  } catch {
    // expected
  }
  return expectScenario("repository does not retry", client.calls.rpc === 1, JSON.stringify(client.calls));
}

function scenarioSqlSourceExpectations() {
  const source = readFileSync("docs/architecture/supabase_deployment_provider_shell_activation.sql", "utf8").toLowerCase();
  const selectedProviderUpdate =
    source.includes("update public.providers update_provider") &&
    source.includes("where update_provider.id = v_provider.id") &&
    source.includes("and update_provider.clinic_id = p_clinic_id") &&
    source.includes("and update_provider.deployment_provider_key = p_expected_provider_key");
  const noForbiddenUpdates =
    !source.includes("update public.deployment_activation_execution_items") &&
    !source.includes("update public.deployment_activation_execution_sessions") &&
    !source.includes("update public.clinics") &&
    !source.includes("lease_expires_at =") &&
    !source.includes("ownership_token =") &&
    !source.includes("completed_at =") &&
    !source.includes("execution_status = 'succeeded'") &&
    !source.includes("execution_status = 'ready'");
  const supportedTarget =
    source.includes("set active = true") &&
    source.includes("provisioning_status = 'active'") &&
    !source.includes("insert into") &&
    !source.includes("delete from");

  return expectScenario(
    "SQL source mutation boundary",
    selectedProviderUpdate && noForbiddenUpdates && supportedTarget,
    JSON.stringify({ selectedProviderUpdate, noForbiddenUpdates, supportedTarget }),
  );
}

function expectRpcStatus(status: "activated" | "already_activated" | "blocked" | "conflict" | "not_found", ok: boolean) {
  const result = mapProviderShellActivationRpcResult(rpcRow(status));
  return expectScenario(`${status} mapping`, result.status === status && result.ok === ok && result.providerId === PROVIDER_ID, JSON.stringify(result));
}

function query() {
  return {
    clinicId: CLINIC_ID,
    deploymentRunKey: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  };
}

function command(input: Partial<DeploymentProviderShellActivationAtomicCommand> = {}): DeploymentProviderShellActivationAtomicCommand {
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
    expectedEntityId: PROVIDER_KEY,
    expectedAction: "activate",
    expectedItemStartedAt: ITEM_STARTED_AT,
    expectedAttemptCount: 1,
    providerId: PROVIDER_ID,
    expectedProviderKey: PROVIDER_KEY,
    expectedCurrentState: { deploymentProviderKey: PROVIDER_KEY, provisioningSource: "setup_draft", provisioningStatus: "placeholder", active: false },
    targetState: { deploymentProviderKey: PROVIDER_KEY, provisioningSource: "setup_draft", provisioningStatus: "active", active: true },
    proposedActivatedAt: ACTIVATED_AT,
    ...input,
  };
}

function rows(): ProviderShellActivationItemRow[] {
  return [
    itemRow(1, { execution_status: "succeeded", attempt_count: 1, started_at: "2026-01-01T12:01:00.000Z", completed_at: "2026-01-01T12:02:00.000Z" }),
    itemRow(2, { execution_status: "running", attempt_count: 1, started_at: ITEM_STARTED_AT }),
    itemRow(3),
  ];
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

function itemRow(sequence: number, input: Partial<ProviderShellActivationItemRow> = {}): ProviderShellActivationItemRow {
  return {
    id: itemId(sequence),
    session_id: SESSION_ID,
    execution_item_key: executionItemKey(sequence),
    plan_item_key: planItemKey(sequence),
    sequence,
    entity_type: sequence === 1 ? "clinic" : "provider_shell",
    entity_id: sequence === 1 ? CLINIC_ID : PROVIDER_KEY,
    action: "activate",
    execution_status: "pending",
    attempt_count: 0,
    started_at: null,
    completed_at: null,
    rolled_back_at: null,
    error_code: null,
    error_message: null,
    dependency_keys: sequence === 1 ? [] : [planItemKey(sequence - 1)],
    expected_current_state: { provisioningStatus: "placeholder", active: false },
    target_state: { provisioningStatus: "active", active: true },
    ...input,
  };
}

function providerRow(input: Partial<ProviderShellActivationProviderRow> = {}): ProviderShellActivationProviderRow {
  return {
    id: PROVIDER_ID,
    clinic_id: CLINIC_ID,
    deployment_provider_key: PROVIDER_KEY,
    display_name: "Dentist Placeholder 001",
    title: "Dentist Placeholder",
    active: false,
    provisioning_source: "setup_draft",
    provisioning_status: "placeholder",
    ...input,
  };
}

function rpcRow(status: "activated" | "already_activated" | "blocked" | "conflict" | "not_found") {
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
    provider_id: PROVIDER_ID,
    deployment_provider_key: PROVIDER_KEY,
    provider_state_before: { provisioningStatus: "placeholder", active: false },
    provider_state_after: status === "activated" || status === "already_activated" ? { provisioningStatus: "active", active: true } : { provisioningStatus: "placeholder", active: false },
    activated_at: status === "activated" ? ACTIVATED_AT : null,
    issue_code: status === "activated" || status === "already_activated" ? null : "blocked_issue",
    message: `${status} message`,
  };
}

function mockClient(input: { sessions?: unknown[]; items?: unknown[]; providers?: unknown[]; sessionError?: unknown; itemError?: unknown; providerError?: unknown; rpcData?: unknown; rpcError?: unknown } = {}) {
  const calls = { from: 0, rpc: 0 };
  const client = {
    calls,
    from(table: string) {
      calls.from += 1;
      const response = table === "deployment_activation_execution_sessions"
        ? { data: input.sessions ?? [sessionRow()], error: input.sessionError ?? null }
        : table === "deployment_activation_execution_items"
          ? { data: input.items ?? rows(), error: input.itemError ?? null }
          : { data: input.providers ?? [providerRow()], error: input.providerError ?? null };
      return queryBuilder(response);
    },
    async rpc(_name: string, _payload: Record<string, unknown>) {
      calls.rpc += 1;
      return { data: input.rpcData ?? [rpcRow("activated")], error: input.rpcError ?? null };
    },
  };
  return client as unknown as SupabaseClient & { calls: typeof calls };
}

function queryBuilder(response: { data: unknown; error: unknown }) {
  return {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return Promise.resolve(response); },
    then(resolve: (value: { data: unknown; error: unknown }) => unknown) { return Promise.resolve(response).then(resolve); },
  };
}

function itemId(sequence: number): string { return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`; }
function executionItemKey(sequence: number): string { return `${EXECUTION_KEY}:${planItemKey(sequence)}`; }
function planItemKey(sequence: number): string { return sequence === 1 ? `${PLAN_KEY}:clinic` : `${PLAN_KEY}:provider-${String(sequence - 1).padStart(3, "0")}`; }

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => key === "p_ownership_token" || key === "ownershipToken" ? "[redacted]" : entry));
}

function expectNoMethods(name: string, forbidden: readonly string[]): DeploymentProviderShellActivationSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentProviderShellActivationRepository.prototype as Record<string, unknown>;
  return expectScenario(name, forbidden.every((method) => !(method in prototype)), forbidden.filter((method) => method in prototype).join(","));
}

function expectScenario(name: string, passed: boolean, message: string): DeploymentProviderShellActivationSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}