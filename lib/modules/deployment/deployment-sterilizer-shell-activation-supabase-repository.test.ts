import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateSterilizerShellActivationRows,
  assertAtMostOne,
  DeploymentSterilizerShellActivationRepositoryError,
  mapSterilizerShellActivationItemRow,
  mapSterilizerShellActivationSterilizerRow,
  mapSterilizerShellActivationRpcResult,
  mapSterilizerShellActivationSessionRow,
  sterilizerShellActivationRpcPayload,
  readSingleRpcRow,
  selectRunningSterilizerLookup,
  SupabaseDeploymentSterilizerShellActivationRepository,
  STERILIZER_ACTIVATION_RPC_NAME,
  type SterilizerShellActivationItemRow,
  type SterilizerShellActivationSterilizerRow,
} from "./deployment-sterilizer-shell-activation-supabase-repository";
import type {
  DeploymentSterilizerShellActivationAtomicCommand,
} from "./deployment-sterilizer-shell-activation-types";

export interface DeploymentSterilizerShellActivationSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentSterilizerShellActivationSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentSterilizerShellActivationSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const DEPLOYMENT_RUN_KEY = "deployment-run-sterilizer-activation-0001";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const EXECUTION_KEY = "activation-execution-sterilizer-activation-0001";
const PLAN_KEY = "activation-plan-sterilizer-activation-0001";
const OWNER = "executor-sterilizer-activation-001";
const TOKEN = "sensitive-sterilizer-activation-token";
const LEASE = "2026-01-01T12:20:00.000Z";
const STERILIZER_ID = "33333333-3333-4333-8333-333333333333";
const STERILIZER_KEY = "dentist-001";
const ITEM_STARTED_AT = "2026-01-01T12:05:00.000Z";
const ACTIVATED_AT = "2026-01-01T12:06:00.000Z";

export async function runDeploymentSterilizerShellActivationSupabaseRepositoryHarness(): Promise<DeploymentSterilizerShellActivationSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSessionMapping(),
    scenarioItemMapping(),
    scenarioSterilizerMapping(),
    scenarioSterilizerLookupUsesStateKeyWithUuidEntity(),
    scenarioSterilizerLookupFallsBackToLegacyEntityKey(),
    await scenarioSnapshotMapping(),
    await scenarioDeterministicItemOrdering(),
    scenarioAggregateCounts(),
    scenarioDuplicateSterilizerIdentityMapping(),
    await scenarioMissingSession(),
    scenarioMissingItem(),
    await scenarioMissingSterilizer(),
    await scenarioAmbiguousSterilizerIdentity(),
    scenarioRpcPayloadShape(),
    scenarioOwnerTokenLeasePayload(),
    scenarioItemIdentityPayload(),
    scenarioSterilizerIdentityPayload(),
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
    await scenarioExactRpcInvocation(),
    await scenarioRpcDatabaseErrorClassification(),
    await scenarioRpcTransportErrorClassification(),
    await scenarioRpcAbortClassification(),
    await scenarioRpcResponseMappingClassification(),
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
  const mapped = mapSterilizerShellActivationSessionRow(sessionRow());
  return expectScenario("deterministic session snapshot mapping", mapped.sessionId === SESSION_ID && mapped.itemsRequested === 3 && mapped.ownershipToken === TOKEN, JSON.stringify(redact(mapped)));
}

function scenarioItemMapping() {
  const mapped = mapSterilizerShellActivationItemRow(itemRow(2));
  return expectScenario("selected running item mapping", mapped.sequence === 2 && mapped.entityType === "sterilizer_shell" && mapped.entityId === STERILIZER_KEY && mapped.dependencyKeys[0] === planItemKey(1), JSON.stringify(mapped));
}

function scenarioSterilizerMapping() {
  const mapped = mapSterilizerShellActivationSterilizerRow(sterilizerRow());
  return expectScenario("sterilizer mapping", mapped.sterilizerId === STERILIZER_ID && mapped.clinicId === CLINIC_ID && mapped.deploymentSterilizerKey === STERILIZER_KEY && mapped.currentState?.provisioningStatus === "planned", JSON.stringify(mapped));
}

function scenarioSterilizerLookupUsesStateKeyWithUuidEntity() {
  const lookup = selectRunningSterilizerLookup(rowsWithUuidSterilizerEntity());
  return expectScenario(
    "sterilizer lookup uses state key with UUID entity id",
    lookup.attempted && lookup.deploymentSterilizerKey === STERILIZER_KEY && lookup.sterilizerId === STERILIZER_ID,
    JSON.stringify(lookup),
  );
}

function scenarioSterilizerLookupFallsBackToLegacyEntityKey() {
  const lookup = selectRunningSterilizerLookup(rows());
  return expectScenario(
    "sterilizer lookup falls back to legacy entity key",
    lookup.attempted && lookup.deploymentSterilizerKey === STERILIZER_KEY && lookup.sterilizerId === STERILIZER_KEY,
    JSON.stringify(lookup),
  );
}
async function scenarioSnapshotMapping() {
  const repository = new SupabaseDeploymentSterilizerShellActivationRepository(mockClient({ sessions: [sessionRow()], items: rows(), sterilizers: [sterilizerRow()] }));
  const snapshot = await repository.loadSterilizerShellActivationSnapshot(query());
  return expectScenario("deterministic snapshot mapping", snapshot.session?.sessionId === SESSION_ID && snapshot.items.length === 3 && snapshot.sterilizerShell?.sterilizerId === STERILIZER_ID, JSON.stringify(redact(snapshot)));
}

async function scenarioDeterministicItemOrdering() {
  const repository = new SupabaseDeploymentSterilizerShellActivationRepository(mockClient({ sessions: [sessionRow()], items: [rows()[2], rows()[0], rows()[1]], sterilizers: [sterilizerRow()] }));
  const snapshot = await repository.loadSterilizerShellActivationSnapshot(query());
  return expectScenario("deterministic item ordering", snapshot.items.map((item) => item.sequence).join(",") === "1,2,3", JSON.stringify(snapshot.items.map((item) => item.sequence)));
}

function scenarioAggregateCounts() {
  const aggregate = aggregateSterilizerShellActivationRows(rows(), [sterilizerRow()]);
  return expectScenario("aggregate count mapping", aggregate.totalItemCount === 3 && aggregate.succeededItemCount === 1 && aggregate.runningItemCount === 1 && aggregate.pendingItemCount === 1 && aggregate.sterilizerCandidateCount === 1, JSON.stringify(aggregate));
}

function scenarioDuplicateSterilizerIdentityMapping() {
  const aggregate = aggregateSterilizerShellActivationRows(rows(), [sterilizerRow(), sterilizerRow({ id: "44444444-4444-4444-8444-444444444444" })]);
  return expectScenario("duplicate sterilizer identity mapping", aggregate.sterilizerCandidateCount === 2 && aggregate.duplicateSterilizerIdentityCount === 1, JSON.stringify(aggregate));
}

async function scenarioMissingSession() {
  const repository = new SupabaseDeploymentSterilizerShellActivationRepository(mockClient({ sessions: [], items: rows(), sterilizers: [sterilizerRow()] }));
  const snapshot = await repository.loadSterilizerShellActivationSnapshot(query());
  return expectScenario("missing session", snapshot.session === null && snapshot.items.length === 0 && snapshot.sterilizerShell === null && snapshot.aggregate.totalItemCount === 0, JSON.stringify(snapshot));
}

function scenarioMissingItem() {
  const aggregate = aggregateSterilizerShellActivationRows([], [sterilizerRow()]);
  return expectScenario("missing item aggregate", aggregate.runningItemCount === 0 && aggregate.totalItemCount === 0, JSON.stringify(aggregate));
}

async function scenarioMissingSterilizer() {
  const repository = new SupabaseDeploymentSterilizerShellActivationRepository(mockClient({ sessions: [sessionRow()], items: rows(), sterilizers: [] }));
  const snapshot = await repository.loadSterilizerShellActivationSnapshot(query());
  return expectScenario("missing sterilizer", snapshot.sterilizerShell === null && snapshot.aggregate.sterilizerCandidateCount === 0, JSON.stringify(snapshot));
}

async function scenarioAmbiguousSterilizerIdentity() {
  const repository = new SupabaseDeploymentSterilizerShellActivationRepository(mockClient({ sessions: [sessionRow()], items: rows(), sterilizers: [sterilizerRow(), sterilizerRow({ id: "44444444-4444-4444-8444-444444444444" })] }));
  const snapshot = await repository.loadSterilizerShellActivationSnapshot(query());
  return expectScenario("ambiguous sterilizer identity", snapshot.sterilizerShell === null && snapshot.aggregate.sterilizerCandidateCount === 2 && snapshot.aggregate.duplicateSterilizerIdentityCount === 1, JSON.stringify(snapshot.aggregate));
}

function scenarioRpcPayloadShape() {
  const keys = Object.keys(sterilizerShellActivationRpcPayload(command())).sort().join(",");
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
    "p_expected_sterilizer_key",
    "p_expected_sequence",
    "p_item_id",
    "p_ownership_token",
    "p_plan_item_key",
    "p_sterilizer_id",
    "p_proposed_activated_at",
    "p_session_id",
    "p_target_state",
  ].sort().join(","), keys);
}

function scenarioOwnerTokenLeasePayload() { const payload = sterilizerShellActivationRpcPayload(command()); return expectScenario("owner/token/lease CAS payload", payload.p_claimant_id === OWNER && payload.p_ownership_token === TOKEN && payload.p_expected_lease_expires_at === LEASE, JSON.stringify(redact(payload))); }
function scenarioItemIdentityPayload() { const payload = sterilizerShellActivationRpcPayload(command()); return expectScenario("item identity payload", payload.p_item_id === itemId(2) && payload.p_execution_item_key === executionItemKey(2) && payload.p_plan_item_key === planItemKey(2) && payload.p_expected_sequence === 2 && payload.p_expected_entity_id === STERILIZER_ID, JSON.stringify(redact(payload))); }
function scenarioSterilizerIdentityPayload() { const payload = sterilizerShellActivationRpcPayload(command()); return expectScenario("sterilizer identity payload", payload.p_sterilizer_id === STERILIZER_ID && payload.p_expected_sterilizer_key === STERILIZER_KEY && payload.p_expected_entity_id !== payload.p_expected_sterilizer_key, JSON.stringify(redact(payload))); }
function scenarioExpectedCurrentStatePayload() { const source = command(); const payload = sterilizerShellActivationRpcPayload(source); (payload.p_expected_current_state as Record<string, unknown>).active = true; return expectScenario("expected current state payload", source.expectedCurrentState.active === false && (payload.p_expected_current_state as Record<string, unknown>).provisioningStatus === "planned", JSON.stringify(redact(payload))); }
function scenarioTargetStatePayload() { const payload = sterilizerShellActivationRpcPayload(command()); return expectScenario("target state payload", (payload.p_target_state as Record<string, unknown>).active === true && (payload.p_target_state as Record<string, unknown>).provisioningStatus === "active", JSON.stringify(redact(payload))); }
function scenarioProposedActivationTimestampPayload() { const payload = sterilizerShellActivationRpcPayload(command()); return expectScenario("proposed activation timestamp payload", payload.p_proposed_activated_at === ACTIVATED_AT, JSON.stringify(redact(payload))); }

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
    return expectScenario("malformed RPC response", caught instanceof DeploymentSterilizerShellActivationRepositoryError, String(caught));
  }
}

function scenarioMultipleRpcRows() {
  try {
    readSingleRpcRow([rpcRow("activated"), rpcRow("activated")]);
    return expectScenario("multiple RPC rows", false, "did not throw");
  } catch (caught) {
    return expectScenario("multiple RPC rows", caught instanceof DeploymentSterilizerShellActivationRepositoryError, String(caught));
  }
}

async function scenarioSnapshotErrorSanitization() {
  const repository = new SupabaseDeploymentSterilizerShellActivationRepository(mockClient({ sessionError: { message: `snapshot ${TOKEN}`, code: "PGRST100", details: `details ${TOKEN}`, hint: `hint ${TOKEN}` } }));
  try {
    await repository.loadSterilizerShellActivationSnapshot(query());
    return expectScenario("Supabase snapshot error sanitization", false, "did not throw");
  } catch (caught) {
    const serialized = JSON.stringify(caught);
    return expectScenario("Supabase snapshot error sanitization", caught instanceof DeploymentSterilizerShellActivationRepositoryError && !serialized.includes(TOKEN), serialized);
  }
}

async function scenarioExactRpcInvocation() {
  const client = mockClient();
  const repository = new SupabaseDeploymentSterilizerShellActivationRepository(client);
  await repository.activateSterilizerShellAtomically(command());
  return expectScenario("exact activation RPC invocation", client.calls.rpc === 1 && client.calls.lastRpcName === STERILIZER_ACTIVATION_RPC_NAME, JSON.stringify(client.calls));
}

async function scenarioRpcDatabaseErrorClassification() {
  return expectRepositoryFailure("RPC database error classification", { rpcError: { message: "database rejected", code: "23514", details: "constraint", hint: "check state" } }, "rpc_database_error", true, false);
}

async function scenarioRpcTransportErrorClassification() {
  return expectRepositoryFailure("RPC transport error classification", { rpcThrow: new TypeError("fetch failed") }, "rpc_transport_error", true, false);
}

async function scenarioRpcAbortClassification() {
  const aborted = new Error("request aborted");
  aborted.name = "AbortError";
  return expectRepositoryFailure("RPC timeout or abort classification", { rpcThrow: aborted }, "execution_timeout_or_abort", true, false);
}

async function scenarioRpcResponseMappingClassification() {
  return expectRepositoryFailure("RPC response mapping classification", { rpcData: [] }, "rpc_response_mapping_error", true, true);
}

async function expectRepositoryFailure(
  name: string,
  input: Parameters<typeof mockClient>[0],
  classification: DeploymentSterilizerShellActivationRepositoryError["failureClassification"],
  rpcAttempted: boolean,
  dataReturned: boolean,
) {
  try {
    await new SupabaseDeploymentSterilizerShellActivationRepository(mockClient(input)).activateSterilizerShellAtomically(command());
    return expectScenario(name, false, "did not throw");
  } catch (caught) {
    const error = caught as DeploymentSterilizerShellActivationRepositoryError;
    return expectScenario(
      name,
      caught instanceof DeploymentSterilizerShellActivationRepositoryError &&
        error.operation === STERILIZER_ACTIVATION_RPC_NAME &&
        error.failureClassification === classification &&
        error.rpcAttempted === rpcAttempted &&
        error.dataReturned === dataReturned,
      JSON.stringify(error),
    );
  }
}
async function scenarioRpcErrorSanitization() {
  const repository = new SupabaseDeploymentSterilizerShellActivationRepository(mockClient({ rpcError: { message: `rpc ${TOKEN}`, code: "42804", details: `details ${TOKEN}`, hint: `hint ${TOKEN}` } }));
  try {
    await repository.activateSterilizerShellAtomically(command());
    return expectScenario("Supabase RPC error sanitization", false, "did not throw");
  } catch (caught) {
    const serialized = JSON.stringify(caught);
    return expectScenario("Supabase RPC error sanitization", caught instanceof DeploymentSterilizerShellActivationRepositoryError && !serialized.includes(TOKEN), serialized);
  }
}

function scenarioTokenRedaction() { return expectScenario("token redaction", !JSON.stringify(redact(sterilizerShellActivationRpcPayload(command()))).includes(TOKEN), JSON.stringify(redact(sterilizerShellActivationRpcPayload(command())))); }
function scenarioSourceImmutability() { const source = command(); const before = JSON.stringify(source); sterilizerShellActivationRpcPayload(source); return expectScenario("source immutability", JSON.stringify(source) === before, JSON.stringify(source)); }

function scenarioNoFallbackMutationMethods() { return expectNoMethods("no fallback mutation methods", ["insert", "update", "upsert", "patch", "save", "delete", "activateAnySterilizer", "activateSterilizer", "completeItem", "progressDependency"]); }
function scenarioNoGenericUpdateUpsertMethods() { return expectNoMethods("no generic update/upsert methods", ["update", "upsert", "patch", "save"]); }
function scenarioNoExecutionItemMutationMethods() { return expectNoMethods("no execution item mutation methods", ["completeItem", "startItem", "progressItem", "failItem", "rollbackItem"]); }
function scenarioNoSessionMutationMethods() { return expectNoMethods("no session mutation methods", ["updateSession", "renewLease", "rotateToken", "completeSession"]); }

async function scenarioRepositoryDoesNotRetry() {
  const client = mockClient({ rpcError: { message: "rpc failed" } });
  const repository = new SupabaseDeploymentSterilizerShellActivationRepository(client);
  try {
    await repository.activateSterilizerShellAtomically(command());
  } catch {
    // expected
  }
  return expectScenario("repository does not retry", client.calls.rpc === 1, JSON.stringify(client.calls));
}

function scenarioSqlSourceExpectations() {
  const source = readFileSync("docs/architecture/supabase_deployment_sterilizer_shell_activation_and_completion.sql", "utf8").toLowerCase();
  const selectedSterilizerUpdate =
    source.includes("update public.sterilizers update_sterilizer") &&
    source.includes("where update_sterilizer.id = v_sterilizer.id") &&
    source.includes("and update_sterilizer.clinic_id = p_clinic_id") &&
    source.includes("and update_sterilizer.deployment_sterilizer_key = p_expected_sterilizer_key");
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
  const authoritativeStateProjection =
    source.includes("v_item_transition_state := jsonb_build_object") &&
    source.includes("'deploymentsterilizerkey', v_item.expected_current_state -> 'deploymentsterilizerkey'") &&
    source.includes("'provisioningsource', v_item.expected_current_state -> 'provisioningsource'") &&
    source.includes("'provisioningstatus', v_item.expected_current_state -> 'provisioningstatus'") &&
    source.includes("'active', v_item.expected_current_state -> 'active'") &&
    source.includes("v_item_transition_state is distinct from p_expected_current_state") &&
    !source.includes("v_item.expected_current_state is distinct from p_expected_current_state");
  const identityContract =
    source.includes("v_item.entity_id::text is distinct from p_expected_entity_id") &&
    source.includes("'entityidmatchessterilizerid', v_item.entity_id::text is not distinct from p_sterilizer_id::text") &&
    !source.includes("p_expected_entity_id is distinct from p_expected_sterilizer_key") &&
    !source.includes("v_item.entity_id::text is distinct from p_expected_sterilizer_key");

  return expectScenario(
    "SQL source mutation boundary",
    selectedSterilizerUpdate && noForbiddenUpdates && supportedTarget && identityContract && authoritativeStateProjection,
    JSON.stringify({ selectedSterilizerUpdate, noForbiddenUpdates, supportedTarget, identityContract, authoritativeStateProjection }),
  );
}

function expectRpcStatus(status: "activated" | "already_activated" | "blocked" | "conflict" | "not_found", ok: boolean) {
  const result = mapSterilizerShellActivationRpcResult(rpcRow(status));
  return expectScenario(`${status} mapping`, result.status === status && result.ok === ok && result.sterilizerId === STERILIZER_ID, JSON.stringify(result));
}

function query() {
  return {
    clinicId: CLINIC_ID,
    deploymentRunKey: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
  };
}

function command(input: Partial<DeploymentSterilizerShellActivationAtomicCommand> = {}): DeploymentSterilizerShellActivationAtomicCommand {
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
    expectedEntityType: "sterilizer_shell",
    expectedEntityId: STERILIZER_ID,
    expectedAction: "activate",
    expectedItemStartedAt: ITEM_STARTED_AT,
    expectedAttemptCount: 1,
    sterilizerId: STERILIZER_ID,
    expectedSterilizerKey: STERILIZER_KEY,
    expectedCurrentState: { deploymentSterilizerKey: STERILIZER_KEY, provisioningSource: "setup_draft", provisioningStatus: "planned", active: false },
    targetState: { provisioningStatus: "active", active: true },
    proposedActivatedAt: ACTIVATED_AT,
    ...input,
  };
}

function rows(): SterilizerShellActivationItemRow[] {
  return [
    itemRow(1, { execution_status: "succeeded", attempt_count: 1, started_at: "2026-01-01T12:01:00.000Z", completed_at: "2026-01-01T12:02:00.000Z" }),
    itemRow(2, { execution_status: "running", attempt_count: 1, started_at: ITEM_STARTED_AT }),
    itemRow(3),
  ];
}

function rowsWithUuidSterilizerEntity(): SterilizerShellActivationItemRow[] {
  return rows().map((row) => row.sequence === 2 ? { ...row, entity_id: STERILIZER_ID } : row);
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

function itemRow(sequence: number, input: Partial<SterilizerShellActivationItemRow> = {}): SterilizerShellActivationItemRow {
  return {
    id: itemId(sequence),
    session_id: SESSION_ID,
    execution_item_key: executionItemKey(sequence),
    plan_item_key: planItemKey(sequence),
    sequence,
    entity_type: sequence === 1 ? "clinic" : "sterilizer_shell",
    entity_id: sequence === 1 ? CLINIC_ID : STERILIZER_KEY,
    action: "activate",
    execution_status: "pending",
    attempt_count: 0,
    started_at: null,
    completed_at: null,
    rolled_back_at: null,
    error_code: null,
    error_message: null,
    dependency_keys: sequence === 1 ? [] : [planItemKey(sequence - 1)],
    expected_current_state: { deploymentSterilizerKey: STERILIZER_KEY, provisioningStatus: "planned", active: false },
    target_state: { provisioningStatus: "active", active: true },
    ...input,
  };
}

function sterilizerRow(input: Partial<SterilizerShellActivationSterilizerRow> = {}): SterilizerShellActivationSterilizerRow {
  return {
    id: STERILIZER_ID,
    clinic_id: CLINIC_ID,
    deployment_sterilizer_key: STERILIZER_KEY,
    display_name: "Dentist Placeholder 001",
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
    sterilizer_id: STERILIZER_ID,
    deployment_sterilizer_key: STERILIZER_KEY,
    sterilizer_state_before: { provisioningStatus: "planned", active: false },
    sterilizer_state_after: status === "activated" || status === "already_activated" ? { provisioningStatus: "active", active: true } : { provisioningStatus: "planned", active: false },
    activated_at: status === "activated" ? ACTIVATED_AT : null,
    issue_code: status === "activated" || status === "already_activated" ? null : "blocked_issue",
    message: `${status} message`,
  };
}

function mockClient(input: { sessions?: unknown[]; items?: unknown[]; sterilizers?: unknown[]; sessionError?: unknown; itemError?: unknown; sterilizerError?: unknown; rpcData?: unknown; rpcError?: unknown; rpcThrow?: unknown } = {}) {
  const calls = { from: 0, rpc: 0, lastRpcName: null as string | null };
  const client = {
    calls,
    from(table: string) {
      calls.from += 1;
      const response = table === "deployment_activation_execution_sessions"
        ? { data: input.sessions ?? [sessionRow()], error: input.sessionError ?? null }
        : table === "deployment_activation_execution_items"
          ? { data: input.items ?? rows(), error: input.itemError ?? null }
          : { data: input.sterilizers ?? [sterilizerRow()], error: input.sterilizerError ?? null };
      return queryBuilder(response);
    },
    async rpc(name: string, _payload: Record<string, unknown>) {
      calls.rpc += 1;
      calls.lastRpcName = name;
      if (input.rpcThrow) throw input.rpcThrow;
      return { data: input.rpcData ?? (input.rpcError ? null : [rpcRow("activated")]), error: input.rpcError ?? null };
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
function planItemKey(sequence: number): string { return sequence === 1 ? `${PLAN_KEY}:clinic` : `${PLAN_KEY}:sterilizer-${String(sequence - 1).padStart(3, "0")}`; }

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => key === "p_ownership_token" || key === "ownershipToken" ? "[redacted]" : entry));
}

function expectNoMethods(name: string, forbidden: readonly string[]): DeploymentSterilizerShellActivationSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentSterilizerShellActivationRepository.prototype as Record<string, unknown>;
  return expectScenario(name, forbidden.every((method) => !(method in prototype)), forbidden.filter((method) => method in prototype).join(","));
}

function expectScenario(name: string, passed: boolean, message: string): DeploymentSterilizerShellActivationSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}