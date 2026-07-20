import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateHardwareShellActivationRows,
  assertAtMostOne,
  DeploymentHardwareShellActivationRepositoryError,
  mapHardwareShellActivationItemRow,
  mapHardwareShellActivationHardwareRow,
  mapHardwareShellActivationRpcResult,
  mapHardwareShellActivationSessionRow,
  hardwareShellActivationRpcPayload,
  readSingleRpcRow,
  selectRunningHardwareLookup,
  SupabaseDeploymentHardwareShellActivationRepository,
  type HardwareShellActivationItemRow,
  type HardwareShellActivationHardwareRow,
} from "./deployment-hardware-shell-activation-supabase-repository";
import type {
  DeploymentHardwareShellActivationAtomicCommand,
} from "./deployment-hardware-shell-activation-types";

export interface DeploymentHardwareShellActivationSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentHardwareShellActivationSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentHardwareShellActivationSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const DEPLOYMENT_RUN_KEY = "deployment-run-hardware-activation-0001";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const EXECUTION_KEY = "activation-execution-hardware-activation-0001";
const PLAN_KEY = "activation-plan-hardware-activation-0001";
const OWNER = "executor-hardware-activation-001";
const TOKEN = "sensitive-hardware-activation-token";
const LEASE = "2026-01-01T12:20:00.000Z";
const HARDWARE_ID = "33333333-3333-4333-8333-333333333333";
const HARDWARE_KEY = "dentist-001";
const ITEM_STARTED_AT = "2026-01-01T12:05:00.000Z";
const ACTIVATED_AT = "2026-01-01T12:06:00.000Z";

export async function runDeploymentHardwareShellActivationSupabaseRepositoryHarness(): Promise<DeploymentHardwareShellActivationSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSessionMapping(),
    scenarioItemMapping(),
    scenarioHardwareMapping(),
    scenarioHardwareLookupUsesStateKeyWithUuidEntity(),
    scenarioHardwareLookupRejectsLegacyEntityKey(),
    await scenarioSnapshotMapping(),
    await scenarioDeterministicItemOrdering(),
    scenarioAggregateCounts(),
    scenarioDuplicateHardwareIdentityMapping(),
    await scenarioMissingSession(),
    scenarioMissingItem(),
    await scenarioMissingHardware(),
    await scenarioAmbiguousHardwareIdentity(),
    scenarioRpcPayloadShape(),
    scenarioOwnerTokenLeasePayload(),
    scenarioItemIdentityPayload(),
    scenarioHardwareIdentityPayload(),
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
  const mapped = mapHardwareShellActivationSessionRow(sessionRow());
  return expectScenario("deterministic session snapshot mapping", mapped.sessionId === SESSION_ID && mapped.itemsRequested === 3 && mapped.ownershipToken === TOKEN, JSON.stringify(redact(mapped)));
}

function scenarioItemMapping() {
  const mapped = mapHardwareShellActivationItemRow(itemRow(2));
  return expectScenario("selected running item mapping", mapped.sequence === 2 && mapped.entityType === "hardware_shell" && mapped.entityId === HARDWARE_KEY && mapped.dependencyKeys[0] === planItemKey(1), JSON.stringify(mapped));
}

function scenarioHardwareMapping() {
  const mapped = mapHardwareShellActivationHardwareRow(hardwareRow());
  return expectScenario("hardware mapping", mapped.hardwareId === HARDWARE_ID && mapped.clinicId === CLINIC_ID && mapped.deploymentHardwareKey === HARDWARE_KEY && mapped.currentState?.provisioningStatus === "planned", JSON.stringify(mapped));
}

function scenarioHardwareLookupUsesStateKeyWithUuidEntity() {
  const lookup = selectRunningHardwareLookup(rowsWithUuidHardwareEntity());
  return expectScenario(
    "hardware lookup uses state key with UUID entity id",
    lookup.attempted && lookup.deploymentHardwareKey === HARDWARE_KEY && lookup.hardwareId === HARDWARE_ID,
    JSON.stringify(lookup),
  );
}

function scenarioHardwareLookupRejectsLegacyEntityKey() {
  const legacyRows = rows().map((row) => row.sequence === 2 ? { ...row, entity_id: HARDWARE_KEY, expected_current_state: null } : row);
  const lookup = selectRunningHardwareLookup(legacyRows);
  return expectScenario(
    "hardware lookup rejects legacy entity key",
    !lookup.attempted && lookup.deploymentHardwareKey === null && lookup.hardwareId === HARDWARE_KEY,
    JSON.stringify(lookup),
  );
}
async function scenarioSnapshotMapping() {
  const repository = new SupabaseDeploymentHardwareShellActivationRepository(mockClient({ sessions: [sessionRow()], items: rows(), hardwares: [hardwareRow()] }));
  const snapshot = await repository.loadHardwareShellActivationSnapshot(query());
  return expectScenario("deterministic snapshot mapping", snapshot.session?.sessionId === SESSION_ID && snapshot.items.length === 3 && snapshot.hardwareShell?.hardwareId === HARDWARE_ID, JSON.stringify(redact(snapshot)));
}

async function scenarioDeterministicItemOrdering() {
  const repository = new SupabaseDeploymentHardwareShellActivationRepository(mockClient({ sessions: [sessionRow()], items: [rows()[2], rows()[0], rows()[1]], hardwares: [hardwareRow()] }));
  const snapshot = await repository.loadHardwareShellActivationSnapshot(query());
  return expectScenario("deterministic item ordering", snapshot.items.map((item) => item.sequence).join(",") === "1,2,3", JSON.stringify(snapshot.items.map((item) => item.sequence)));
}

function scenarioAggregateCounts() {
  const aggregate = aggregateHardwareShellActivationRows(rows(), [hardwareRow()]);
  return expectScenario("aggregate count mapping", aggregate.totalItemCount === 3 && aggregate.succeededItemCount === 1 && aggregate.runningItemCount === 1 && aggregate.pendingItemCount === 1 && aggregate.hardwareCandidateCount === 1, JSON.stringify(aggregate));
}

function scenarioDuplicateHardwareIdentityMapping() {
  const aggregate = aggregateHardwareShellActivationRows(rows(), [hardwareRow(), hardwareRow({ id: "44444444-4444-4444-8444-444444444444" })]);
  return expectScenario("duplicate hardware identity mapping", aggregate.hardwareCandidateCount === 2 && aggregate.duplicateHardwareIdentityCount === 1, JSON.stringify(aggregate));
}

async function scenarioMissingSession() {
  const repository = new SupabaseDeploymentHardwareShellActivationRepository(mockClient({ sessions: [], items: rows(), hardwares: [hardwareRow()] }));
  const snapshot = await repository.loadHardwareShellActivationSnapshot(query());
  return expectScenario("missing session", snapshot.session === null && snapshot.items.length === 0 && snapshot.hardwareShell === null && snapshot.aggregate.totalItemCount === 0, JSON.stringify(snapshot));
}

function scenarioMissingItem() {
  const aggregate = aggregateHardwareShellActivationRows([], [hardwareRow()]);
  return expectScenario("missing item aggregate", aggregate.runningItemCount === 0 && aggregate.totalItemCount === 0, JSON.stringify(aggregate));
}

async function scenarioMissingHardware() {
  const repository = new SupabaseDeploymentHardwareShellActivationRepository(mockClient({ sessions: [sessionRow()], items: rows(), hardwares: [] }));
  const snapshot = await repository.loadHardwareShellActivationSnapshot(query());
  return expectScenario("missing hardware", snapshot.hardwareShell === null && snapshot.aggregate.hardwareCandidateCount === 0, JSON.stringify(snapshot));
}

async function scenarioAmbiguousHardwareIdentity() {
  const repository = new SupabaseDeploymentHardwareShellActivationRepository(mockClient({ sessions: [sessionRow()], items: rows(), hardwares: [hardwareRow(), hardwareRow({ id: "44444444-4444-4444-8444-444444444444" })] }));
  const snapshot = await repository.loadHardwareShellActivationSnapshot(query());
  return expectScenario("ambiguous hardware identity", snapshot.hardwareShell === null && snapshot.aggregate.hardwareCandidateCount === 2 && snapshot.aggregate.duplicateHardwareIdentityCount === 1, JSON.stringify(snapshot.aggregate));
}

function scenarioRpcPayloadShape() {
  const keys = Object.keys(hardwareShellActivationRpcPayload(command())).sort().join(",");
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
    "p_expected_hardware_key",
    "p_expected_sequence",
    "p_item_id",
    "p_ownership_token",
    "p_plan_item_key",
    "p_hardware_id",
    "p_proposed_activated_at",
    "p_session_id",
    "p_target_state",
  ].sort().join(","), keys);
}

function scenarioOwnerTokenLeasePayload() { const payload = hardwareShellActivationRpcPayload(command()); return expectScenario("owner/token/lease CAS payload", payload.p_claimant_id === OWNER && payload.p_ownership_token === TOKEN && payload.p_expected_lease_expires_at === LEASE, JSON.stringify(redact(payload))); }
function scenarioItemIdentityPayload() { const payload = hardwareShellActivationRpcPayload(command()); return expectScenario("item identity payload", payload.p_item_id === itemId(2) && payload.p_execution_item_key === executionItemKey(2) && payload.p_plan_item_key === planItemKey(2) && payload.p_expected_sequence === 2 && payload.p_expected_entity_id === HARDWARE_ID, JSON.stringify(redact(payload))); }
function scenarioHardwareIdentityPayload() { const payload = hardwareShellActivationRpcPayload(command()); return expectScenario("hardware identity payload", payload.p_hardware_id === HARDWARE_ID && payload.p_expected_hardware_key === HARDWARE_KEY && payload.p_expected_entity_id !== payload.p_expected_hardware_key, JSON.stringify(redact(payload))); }
function scenarioExpectedCurrentStatePayload() { const source = command(); const payload = hardwareShellActivationRpcPayload(source); (payload.p_expected_current_state as Record<string, unknown>).active = true; return expectScenario("expected current state payload", source.expectedCurrentState.active === false && (payload.p_expected_current_state as Record<string, unknown>).provisioningStatus === "planned", JSON.stringify(redact(payload))); }
function scenarioTargetStatePayload() { const payload = hardwareShellActivationRpcPayload(command()); return expectScenario("target state payload", (payload.p_target_state as Record<string, unknown>).active === true && (payload.p_target_state as Record<string, unknown>).provisioningStatus === "active", JSON.stringify(redact(payload))); }
function scenarioProposedActivationTimestampPayload() { const payload = hardwareShellActivationRpcPayload(command()); return expectScenario("proposed activation timestamp payload", payload.p_proposed_activated_at === ACTIVATED_AT, JSON.stringify(redact(payload))); }

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
    return expectScenario("malformed RPC response", caught instanceof DeploymentHardwareShellActivationRepositoryError, String(caught));
  }
}

function scenarioMultipleRpcRows() {
  try {
    readSingleRpcRow([rpcRow("activated"), rpcRow("activated")]);
    return expectScenario("multiple RPC rows", false, "did not throw");
  } catch (caught) {
    return expectScenario("multiple RPC rows", caught instanceof DeploymentHardwareShellActivationRepositoryError, String(caught));
  }
}

async function scenarioSnapshotErrorSanitization() {
  const repository = new SupabaseDeploymentHardwareShellActivationRepository(mockClient({ sessionError: { message: `snapshot ${TOKEN}`, code: "PGRST100", details: `details ${TOKEN}`, hint: `hint ${TOKEN}` } }));
  try {
    await repository.loadHardwareShellActivationSnapshot(query());
    return expectScenario("Supabase snapshot error sanitization", false, "did not throw");
  } catch (caught) {
    const serialized = JSON.stringify(caught);
    return expectScenario("Supabase snapshot error sanitization", caught instanceof DeploymentHardwareShellActivationRepositoryError && !serialized.includes(TOKEN), serialized);
  }
}

async function scenarioRpcErrorSanitization() {
  const repository = new SupabaseDeploymentHardwareShellActivationRepository(mockClient({ rpcError: { message: `rpc ${TOKEN}`, code: "42804", details: `details ${TOKEN}`, hint: `hint ${TOKEN}` } }));
  try {
    await repository.activateHardwareShellAtomically(command());
    return expectScenario("Supabase RPC error sanitization", false, "did not throw");
  } catch (caught) {
    const serialized = JSON.stringify(caught);
    return expectScenario("Supabase RPC error sanitization", caught instanceof DeploymentHardwareShellActivationRepositoryError && !serialized.includes(TOKEN), serialized);
  }
}

function scenarioTokenRedaction() { return expectScenario("token redaction", !JSON.stringify(redact(hardwareShellActivationRpcPayload(command()))).includes(TOKEN), JSON.stringify(redact(hardwareShellActivationRpcPayload(command())))); }
function scenarioSourceImmutability() { const source = command(); const before = JSON.stringify(source); hardwareShellActivationRpcPayload(source); return expectScenario("source immutability", JSON.stringify(source) === before, JSON.stringify(source)); }

function scenarioNoFallbackMutationMethods() { return expectNoMethods("no fallback mutation methods", ["insert", "update", "upsert", "patch", "save", "delete", "activateAnyHardware", "activateHardware", "completeItem", "progressDependency"]); }
function scenarioNoGenericUpdateUpsertMethods() { return expectNoMethods("no generic update/upsert methods", ["update", "upsert", "patch", "save"]); }
function scenarioNoExecutionItemMutationMethods() { return expectNoMethods("no execution item mutation methods", ["completeItem", "startItem", "progressItem", "failItem", "rollbackItem"]); }
function scenarioNoSessionMutationMethods() { return expectNoMethods("no session mutation methods", ["updateSession", "renewLease", "rotateToken", "completeSession"]); }

async function scenarioRepositoryDoesNotRetry() {
  const client = mockClient({ rpcError: { message: "rpc failed" } });
  const repository = new SupabaseDeploymentHardwareShellActivationRepository(client);
  try {
    await repository.activateHardwareShellAtomically(command());
  } catch {
    // expected
  }
  return expectScenario("repository does not retry", client.calls.rpc === 1, JSON.stringify(client.calls));
}

function scenarioSqlSourceExpectations() {
  const source = readFileSync("docs/architecture/supabase_deployment_hardware_shell_activation.sql", "utf8").toLowerCase();
  const selectedHardwareUpdate =
    source.includes("update public.clinical_hardware_devices update_hardware") &&
    source.includes("where update_hardware.id = v_hardware.id") &&
    source.includes("and update_hardware.clinic_id = p_clinic_id") &&
    source.includes("and update_hardware.deployment_hardware_key = p_expected_hardware_key");
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
  const identityContract =
    source.includes("v_item.entity_id::text is distinct from p_expected_entity_id") &&
    source.includes("'entityidmatcheshardwareid', v_item.entity_id::text is not distinct from p_hardware_id::text") &&
    !source.includes("p_expected_entity_id is distinct from p_expected_hardware_key") &&
    !source.includes("v_item.entity_id::text is distinct from p_expected_hardware_key");

  return expectScenario(
    "SQL source mutation boundary",
    selectedHardwareUpdate && noForbiddenUpdates && supportedTarget && identityContract,
    JSON.stringify({ selectedHardwareUpdate, noForbiddenUpdates, supportedTarget, identityContract }),
  );
}

function expectRpcStatus(status: "activated" | "already_activated" | "blocked" | "conflict" | "not_found", ok: boolean) {
  const result = mapHardwareShellActivationRpcResult(rpcRow(status));
  return expectScenario(`${status} mapping`, result.status === status && result.ok === ok && result.hardwareId === HARDWARE_ID, JSON.stringify(result));
}

function query() {
  return {
    clinicId: CLINIC_ID,
    deploymentRunKey: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  };
}

function command(input: Partial<DeploymentHardwareShellActivationAtomicCommand> = {}): DeploymentHardwareShellActivationAtomicCommand {
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
    expectedEntityType: "hardware_shell",
    expectedEntityId: HARDWARE_ID,
    expectedAction: "activate",
    expectedItemStartedAt: ITEM_STARTED_AT,
    expectedAttemptCount: 1,
    hardwareId: HARDWARE_ID,
    expectedHardwareKey: HARDWARE_KEY,
    expectedCurrentState: { deploymentHardwareKey: HARDWARE_KEY, provisioningSource: "setup_draft", provisioningStatus: "planned", active: false, operationalStatus: "discovered", agentId: null, defaultWorkstationId: null, currentWorkstationId: null },
    targetState: { provisioningStatus: "active", active: true },
    proposedActivatedAt: ACTIVATED_AT,
    ...input,
  };
}

function rows(): HardwareShellActivationItemRow[] {
  return [
    itemRow(1, { execution_status: "succeeded", attempt_count: 1, started_at: "2026-01-01T12:01:00.000Z", completed_at: "2026-01-01T12:02:00.000Z" }),
    itemRow(2, { execution_status: "running", attempt_count: 1, started_at: ITEM_STARTED_AT }),
    itemRow(3),
  ];
}

function rowsWithUuidHardwareEntity(): HardwareShellActivationItemRow[] {
  return rows().map((row) => row.sequence === 2 ? { ...row, entity_id: HARDWARE_ID } : row);
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

function itemRow(sequence: number, input: Partial<HardwareShellActivationItemRow> = {}): HardwareShellActivationItemRow {
  return {
    id: itemId(sequence),
    session_id: SESSION_ID,
    execution_item_key: executionItemKey(sequence),
    plan_item_key: planItemKey(sequence),
    sequence,
    entity_type: sequence === 1 ? "clinic" : "hardware_shell",
    entity_id: sequence === 1 ? CLINIC_ID : HARDWARE_ID,
    action: "activate",
    execution_status: "pending",
    attempt_count: 0,
    started_at: null,
    completed_at: null,
    rolled_back_at: null,
    error_code: null,
    error_message: null,
    dependency_keys: sequence === 1 ? [] : [planItemKey(sequence - 1)],
    expected_current_state: { deploymentHardwareKey: HARDWARE_KEY, provisioningSource: "setup_draft", provisioningStatus: "planned", active: false, operationalStatus: "discovered", agentId: null, defaultWorkstationId: null, currentWorkstationId: null },
    target_state: { provisioningStatus: "active", active: true },
    ...input,
  };
}

function hardwareRow(input: Partial<HardwareShellActivationHardwareRow> = {}): HardwareShellActivationHardwareRow {
  return {
    id: HARDWARE_ID,
    clinic_id: CLINIC_ID,
    deployment_hardware_key: HARDWARE_KEY,
    display_name: "Dentist Planned 001",
    active: false,
    provisioning_source: "setup_draft",
    provisioning_status: "planned",
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
    hardware_id: HARDWARE_ID,
    deployment_hardware_key: HARDWARE_KEY,
    hardware_state_before: { provisioningStatus: "planned", active: false, operationalStatus: "discovered", agentId: null, defaultWorkstationId: null, currentWorkstationId: null },
    hardware_state_after: status === "activated" || status === "already_activated" ? { provisioningStatus: "active", active: true } : { provisioningStatus: "planned", active: false, operationalStatus: "discovered", agentId: null, defaultWorkstationId: null, currentWorkstationId: null },
    activated_at: status === "activated" ? ACTIVATED_AT : null,
    issue_code: status === "activated" || status === "already_activated" ? null : "blocked_issue",
    message: `${status} message`,
  };
}

function mockClient(input: { sessions?: unknown[]; items?: unknown[]; hardwares?: unknown[]; sessionError?: unknown; itemError?: unknown; hardwareError?: unknown; rpcData?: unknown; rpcError?: unknown } = {}) {
  const calls = { from: 0, rpc: 0 };
  const client = {
    calls,
    from(table: string) {
      calls.from += 1;
      const response = table === "deployment_activation_execution_sessions"
        ? { data: input.sessions ?? [sessionRow()], error: input.sessionError ?? null }
        : table === "deployment_activation_execution_items"
          ? { data: input.items ?? rows(), error: input.itemError ?? null }
          : { data: input.hardwares ?? [hardwareRow()], error: input.hardwareError ?? null };
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
function planItemKey(sequence: number): string { return sequence === 1 ? `${PLAN_KEY}:clinic` : `${PLAN_KEY}:hardware-${String(sequence - 1).padStart(3, "0")}`; }

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => key === "p_ownership_token" || key === "ownershipToken" ? "[redacted]" : entry));
}

function expectNoMethods(name: string, forbidden: readonly string[]): DeploymentHardwareShellActivationSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentHardwareShellActivationRepository.prototype as Record<string, unknown>;
  return expectScenario(name, forbidden.every((method) => !(method in prototype)), forbidden.filter((method) => method in prototype).join(","));
}

function expectScenario(name: string, passed: boolean, message: string): DeploymentHardwareShellActivationSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}