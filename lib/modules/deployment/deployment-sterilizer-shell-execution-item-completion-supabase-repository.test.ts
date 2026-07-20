import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateSterilizerShellItemCompletionRows,
  mapSterilizerShellItemCompletionItemRow,
  mapSterilizerShellItemCompletionSterilizerRow,
  mapSterilizerShellItemCompletionRpcResult,
  mapSterilizerShellItemCompletionSessionRow,
  sterilizerShellItemCompletionRpcPayload,
  readSingleRpcRow,
  selectSterilizerShellCompletionItem,
  SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository,
  type SterilizerShellItemCompletionItemRow,
  type SterilizerShellItemCompletionSterilizerRow,
} from "./deployment-sterilizer-shell-execution-item-completion-supabase-repository";
import type {
  DeploymentSterilizerShellExecutionAtomicItemCompletionCommand,
} from "./deployment-sterilizer-shell-execution-item-completion-types";

export interface DeploymentSterilizerShellExecutionItemCompletionSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentSterilizerShellExecutionItemCompletionSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentSterilizerShellExecutionItemCompletionSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const DEPLOYMENT_RUN_KEY = "deployment-run-sterilizer-item-completion-0001";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const EXECUTION_KEY = "activation-execution-sterilizer-item-completion-0001";
const PLAN_KEY = "activation-plan-sterilizer-item-completion-0001";
const CLAIMANT_ID = "executor-sterilizer-item-completion-001";
const TOKEN = "sensitive-sterilizer-item-completion-token";
const LEASE = "2026-01-01T12:30:00.000Z";
const STERILIZER_ID = "33333333-3333-4333-8333-333333333333";
const STERILIZER_KEY = "dentist-001";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const STARTED_AT = "2026-01-01T12:06:00.000Z";
const COMPLETED_AT = "2026-01-01T12:10:00.000Z";
const EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:${PLAN_KEY}:sterilizer-001`;
const PLAN_ITEM_KEY = `${PLAN_KEY}:sterilizer-001`;

export async function runDeploymentSterilizerShellExecutionItemCompletionSupabaseRepositoryHarness(): Promise<DeploymentSterilizerShellExecutionItemCompletionSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSnapshotSessionMapping(),
    scenarioDeterministicItemOrdering(),
    scenarioSterilizerUuidLookupSelection(),
    scenarioSterilizerKeyDerivation(),
    scenarioUuidKeyDistinction(),
    scenarioAggregateCountMapping(),
    scenarioDependencyMapping(),
    await scenarioMissingSession(),
    scenarioAmbiguousSession(),
    scenarioMissingItem(),
    await scenarioMissingSterilizer(),
    scenarioMalformedDependencyEvidence(),
    scenarioRpcPayloadShape(),
    scenarioOwnershipTokenLeasePayload(),
    scenarioItemIdentityPayload(),
    scenarioSterilizerIdentityPayload(),
    scenarioExpectedSterilizerStatePayload(),
    scenarioCompletedMapping(),
    scenarioAlreadyCompletedMapping(),
    scenarioBlockedMapping(),
    scenarioConflictMapping(),
    scenarioNotFoundMapping(),
    scenarioErrorMapping(),
    scenarioMalformedRpcResponse(),
    scenarioMultipleRpcRows(),
    await scenarioSupabaseErrorSanitization(),
    scenarioTokenRedaction(),
    scenarioSourceImmutability(),
    scenarioNoGenericMutationMethods(),
    await scenarioNoRetryFallbackPath(),
    scenarioSqlMutationBoundarySourceAssertions(),
    scenarioSterilizerSchemaContract(),
    scenarioExecutionItemSchemaContract(),
  ];

  return { passed: scenarios.every((scenario) => scenario.passed), scenarios };
}

function scenarioSnapshotSessionMapping() {
  const mapped = mapSterilizerShellItemCompletionSessionRow(sessionRow());
  return expectScenario("snapshot session mapping", mapped.sessionId === SESSION_ID && mapped.preparationStatus === "ready" && mapped.executionStatus === "running" && mapped.ownershipToken === TOKEN, JSON.stringify(redact(mapped)));
}

function scenarioDeterministicItemOrdering() {
  const aggregate = aggregateSterilizerShellItemCompletionRows([itemRow(3), itemRow(1), itemRow(2)], [sterilizerRow()]);
  const selected = selectSterilizerShellCompletionItem([itemRow(3), itemRow(1), itemRow(2)]);
  return expectScenario("deterministic item ordering", aggregate.totalItemCount === 3 && selected?.sequence === 2, JSON.stringify({ aggregate, selected }));
}

function scenarioSterilizerUuidLookupSelection() {
  const item = itemRow(2);
  return expectScenario("sterilizer UUID lookup", item.entity_id === STERILIZER_ID && item.deployment_key === STERILIZER_KEY, JSON.stringify(item));
}

function scenarioSterilizerKeyDerivation() {
  const mapped = mapSterilizerShellItemCompletionItemRow(itemRow(2, { deployment_key: null, target_state: { deploymentSterilizerKey: STERILIZER_KEY } }));
  return expectScenario("sterilizer key derivation", mapped?.deploymentKey === STERILIZER_KEY, JSON.stringify(mapped));
}

function scenarioUuidKeyDistinction() {
  const payload = sterilizerShellItemCompletionRpcPayload(command());
  return expectScenario("UUID/key distinction", payload.p_expected_entity_id === STERILIZER_ID && payload.p_sterilizer_id === STERILIZER_ID && payload.p_expected_deployment_sterilizer_key === STERILIZER_KEY && payload.p_sterilizer_id !== payload.p_expected_deployment_sterilizer_key, JSON.stringify(redactPayload(payload)));
}

function scenarioAggregateCountMapping() {
  const aggregate = aggregateSterilizerShellItemCompletionRows([itemRow(1), itemRow(2), itemRow(3)], [sterilizerRow()]);
  return expectScenario("aggregate count mapping", aggregate.succeededItemCount === 1 && aggregate.runningItemCount === 1 && aggregate.pendingItemCount === 1 && aggregate.runningSterilizerItemCount === 1 && aggregate.priorSucceededPrefixCount === 1, JSON.stringify(aggregate));
}

function scenarioDependencyMapping() {
  const mapped = mapSterilizerShellItemCompletionItemRow(itemRow(2));
  return expectScenario("dependency mapping", mapped?.dependencyKeys[0] === `${PLAN_KEY}:clinic`, JSON.stringify(mapped));
}

async function scenarioMissingSession() {
  const repository = new SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository(new MockSupabaseClient({}) as unknown as SupabaseClient);
  const snapshot = await repository.loadSterilizerShellExecutionItemCompletionSnapshot(query());
  return expectScenario("missing session", snapshot.session === null && snapshot.item === null && snapshot.sterilizer === null && snapshot.aggregate.totalItemCount === 0, JSON.stringify(snapshot));
}

function scenarioAmbiguousSession() {
  return expectThrows("ambiguous session", async () => new SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository(new MockSupabaseClient({ deployment_activation_execution_sessions: [sessionRow(), sessionRow()] }) as unknown as SupabaseClient).loadSterilizerShellExecutionItemCompletionSnapshot(query()), "Ambiguous");
}

function scenarioMissingItem() {
  const selected = selectSterilizerShellCompletionItem([itemRow(1), itemRow(3)]);
  return expectScenario("missing item", selected === null, JSON.stringify(selected));
}

async function scenarioMissingSterilizer() {
  const repository = new SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository(new MockSupabaseClient({ deployment_activation_execution_sessions: [sessionRow()], deployment_activation_execution_items: [itemRow(1), itemRow(2), itemRow(3)], sterilizers: [] }) as unknown as SupabaseClient);
  const snapshot = await repository.loadSterilizerShellExecutionItemCompletionSnapshot(query());
  return expectScenario("missing sterilizer", snapshot.sterilizer === null && snapshot.item?.entityId === STERILIZER_ID, JSON.stringify(snapshot));
}

function scenarioMalformedDependencyEvidence() {
  const mapped = mapSterilizerShellItemCompletionItemRow(itemRow(2, { dependency_keys: "not-json" }));
  return expectScenario("malformed dependency evidence", Array.isArray(mapped?.dependencyKeys) && mapped?.dependencyKeys.length === 0, JSON.stringify(mapped));
}

function scenarioRpcPayloadShape() {
  const keys = Object.keys(sterilizerShellItemCompletionRpcPayload(command())).sort();
  return expectScenario("RPC payload shape", keys.length === 21 && keys.includes("p_expected_deployment_sterilizer_key") && keys.includes("p_expected_sterilizer_state") && keys.includes("p_expected_target_state"), keys.join(","));
}

function scenarioOwnershipTokenLeasePayload() { const payload = sterilizerShellItemCompletionRpcPayload(command()); return expectScenario("ownership/token/lease CAS payload", payload.p_claimant_id === CLAIMANT_ID && payload.p_ownership_token === TOKEN && payload.p_expected_lease_expires_at === LEASE, JSON.stringify(redactPayload(payload))); }
function scenarioItemIdentityPayload() { const payload = sterilizerShellItemCompletionRpcPayload(command()); return expectScenario("item identity payload", payload.p_item_id === ITEM_ID && payload.p_execution_item_key === EXECUTION_ITEM_KEY && payload.p_plan_item_key === PLAN_ITEM_KEY && payload.p_expected_sequence === 2 && payload.p_expected_entity_type === "sterilizer_shell" && payload.p_expected_entity_id === STERILIZER_ID, JSON.stringify(redactPayload(payload))); }
function scenarioSterilizerIdentityPayload() { const payload = sterilizerShellItemCompletionRpcPayload(command()); return expectScenario("sterilizer identity payload", payload.p_sterilizer_id === STERILIZER_ID && payload.p_expected_deployment_sterilizer_key === STERILIZER_KEY, JSON.stringify(redactPayload(payload))); }
function scenarioExpectedSterilizerStatePayload() { const source = command(); const payload = sterilizerShellItemCompletionRpcPayload(source); (payload.p_expected_sterilizer_state as Record<string, unknown>).active = false; return expectScenario("expected sterilizer state payload", source.expectedSterilizerState.active === true && (payload.p_expected_target_state as Record<string, unknown>).provisioningStatus === "active", JSON.stringify(redactPayload(payload))); }
function scenarioCompletedMapping() { const result = mapSterilizerShellItemCompletionRpcResult(rpcRow({ status: "completed" })); return expectScenario("completed mapping", result.ok && result.status === "completed" && result.itemStatusAfter === "succeeded", JSON.stringify(result)); }
function scenarioAlreadyCompletedMapping() { const result = mapSterilizerShellItemCompletionRpcResult(rpcRow({ status: "already_completed", item_status_before: "succeeded" })); return expectScenario("already_completed mapping", result.ok && result.status === "already_completed", JSON.stringify(result)); }
function scenarioBlockedMapping() { const result = mapSterilizerShellItemCompletionRpcResult(rpcRow({ status: "blocked", issue_code: "lease_expired" })); return expectScenario("blocked mapping", !result.ok && result.status === "blocked" && result.issueCode === "lease_expired", JSON.stringify(result)); }
function scenarioConflictMapping() { const result = mapSterilizerShellItemCompletionRpcResult(rpcRow({ status: "conflict", issue_code: "ownership_conflict" })); return expectScenario("conflict mapping", !result.ok && result.status === "conflict", JSON.stringify(result)); }
function scenarioNotFoundMapping() { const result = mapSterilizerShellItemCompletionRpcResult(rpcRow({ status: "not_found", item_id: null })); return expectScenario("not_found mapping", !result.ok && result.status === "not_found" && result.itemId === null, JSON.stringify(result)); }
function scenarioErrorMapping() { const result = mapSterilizerShellItemCompletionRpcResult(rpcRow({ status: "error", issue_code: "repository_error" })); return expectScenario("error mapping", !result.ok && result.status === "error", JSON.stringify(result)); }
function scenarioMalformedRpcResponse() { return expectThrows("malformed RPC response", () => mapSterilizerShellItemCompletionRpcResult(rpcRow({ status: "surprise" })), "Malformed"); }
function scenarioMultipleRpcRows() { return expectThrows("multiple RPC rows", () => readSingleRpcRow([rpcRow(), rpcRow()]), "Ambiguous"); }

async function scenarioSupabaseErrorSanitization() {
  const repository = new SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository(new MockSupabaseClient({}, {}, { code: "PGRST000", message: `failed ${TOKEN}`, details: `details ${TOKEN}`, hint: `hint ${TOKEN}` }) as unknown as SupabaseClient);
  try { await repository.completeSterilizerShellExecutionItemAtomically(command()); } catch (error) {
    const serialized = JSON.stringify(error);
    return expectScenario("Supabase error sanitization", error instanceof Error && !serialized.includes(TOKEN), serialized);
  }
  return expectScenario("Supabase error sanitization", false, "error not thrown");
}

function scenarioTokenRedaction() {
  const payload = sterilizerShellItemCompletionRpcPayload(command());
  const result = mapSterilizerShellItemCompletionRpcResult(rpcRow({ status: "conflict", message: "Ownership compare-and-set failed." }));
  return expectScenario("token redaction", payload.p_ownership_token === TOKEN && !JSON.stringify(result).includes(TOKEN), JSON.stringify(result));
}

function scenarioSourceImmutability() {
  const source = command();
  const before = JSON.stringify(source);
  const payload = sterilizerShellItemCompletionRpcPayload(source);
  (payload.p_expected_sterilizer_state as Record<string, unknown>).active = false;
  return expectScenario("source immutability", JSON.stringify(source) === before, JSON.stringify(redactPayload(payload)));
}

function scenarioNoGenericMutationMethods() { return expectNoMethods("no generic mutation methods", ["update", "insert", "upsert", "delete", "patch", "save", "completeSession", "progressDependency", "startNextItem"]); }

async function scenarioNoRetryFallbackPath() {
  const client = new MockSupabaseClient({}, {}, { code: "PGRST000", message: "failed" });
  const repository = new SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository(client as unknown as SupabaseClient);
  try { await repository.completeSterilizerShellExecutionItemAtomically(command()); } catch { /* expected */ }
  return expectScenario("no retry/fallback path", client.rpcCalls.length === 1 && client.calls.length === 0, JSON.stringify({ rpc: client.rpcCalls.length, calls: client.calls }));
}

function scenarioSqlMutationBoundarySourceAssertions() {
  const sql = require("fs").readFileSync("docs/architecture/supabase_deployment_sterilizer_shell_activation_and_completion.sql", "utf8").toLowerCase();
  const source = sql.slice(sql.indexOf("create or replace function public.complete_deployment_sterilizer_shell_execution_item"));
  const selectedItemOnly = source.includes("update public.deployment_activation_execution_items update_item") && source.includes("where update_item.id = v_item.id") && source.includes("and update_item.session_id = v_session.id");
  const writesOnlyCompletion = source.includes("set execution_status = 'succeeded'") && source.includes("completed_at = p_proposed_completed_at") && !source.includes("started_at =") && !source.includes("attempt_count = attempt_count") && !source.includes("update public.sterilizers") && !source.includes("update public.deployment_activation_execution_sessions") && !source.includes("update public.clinics");
  const identitySafe = source.includes("v_item.entity_id is distinct from p_expected_entity_id") && source.includes("v_sterilizer.id is distinct from p_sterilizer_id") && source.includes("v_sterilizer.deployment_sterilizer_key is distinct from p_expected_deployment_sterilizer_key") && !source.includes("p_sterilizer_id::text = p_expected_deployment_sterilizer_key");
  return expectScenario("SQL mutation-boundary source assertions", selectedItemOnly && writesOnlyCompletion && identitySafe, JSON.stringify({ selectedItemOnly, writesOnlyCompletion, identitySafe }));
}

function scenarioSterilizerSchemaContract() {
  const source = require("fs").readFileSync("lib/modules/deployment/deployment-sterilizer-shell-execution-item-completion-supabase-repository.ts", "utf8").toLowerCase();
  const mapped = mapSterilizerShellItemCompletionSterilizerRow(sterilizerRow());
  return expectScenario(
    "actual nine-column sterilizer schema contract",
    !source.includes('"updated_at"') && !source.includes("row.updated_at") && mapped.active === true && mapped.provisioningStatus === "active",
    JSON.stringify(mapped),
  );
}
function scenarioExecutionItemSchemaContract() {
  const fs = require("fs") as typeof import("fs");
  const schema = fs.readFileSync("docs/architecture/supabase_deployment_activation_execution.sql", "utf8").toLowerCase();
  const repository = fs.readFileSync("lib/modules/deployment/deployment-sterilizer-shell-execution-item-completion-supabase-repository.ts", "utf8").toLowerCase();
  const table = schema.match(/create table if not exists public\.deployment_activation_execution_items \(([\s\S]*?)\n\);/)?.[1] ?? "";
  const hasAuthoritativeExecutionEvidence = /execution_evidence\s+jsonb\s+not null\s+default\s+'\{\}'::jsonb/.test(table);
  const hasNullableRollbackTimestamp = /rolled_back_at\s+timestamptz(?:\s+null)?\s*(?:,|$)/m.test(table);
  const noRollbackEvidenceColumn = !/\brollback_evidence\b/.test(table);
  const repositoryUsesRollbackTimestamp = repository.includes('"rolled_back_at"') && repository.includes("rolledbackat: row.rolled_back_at");
  const repositoryDoesNotProjectMissingColumn = !repository.includes('"rollback_evidence"') && !repository.includes("row.rollback_evidence");
  const executionEvidenceMeaningPreserved = schema.includes("prepared dependency evidence") && !repository.includes("execution_evidence");
  return expectScenario(
    "execution-item schema contract",
    hasAuthoritativeExecutionEvidence && hasNullableRollbackTimestamp && noRollbackEvidenceColumn && repositoryUsesRollbackTimestamp && repositoryDoesNotProjectMissingColumn && executionEvidenceMeaningPreserved,
    JSON.stringify({ hasAuthoritativeExecutionEvidence, hasNullableRollbackTimestamp, noRollbackEvidenceColumn, repositoryUsesRollbackTimestamp, repositoryDoesNotProjectMissingColumn, executionEvidenceMeaningPreserved }),
  );
}
function expectNoMethods(name: string, forbidden: readonly string[]) {
  const prototype = SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository.prototype as Record<string, unknown>;
  return expectScenario(name, forbidden.every((method) => !(method in prototype)), forbidden.filter((method) => method in prototype).join(","));
}

function query() { return { clinicId: CLINIC_ID, deploymentRunId: DEPLOYMENT_RUN_KEY, sessionId: SESSION_ID, executionKey: EXECUTION_KEY }; }
function command(input: Partial<DeploymentSterilizerShellExecutionAtomicItemCompletionCommand> = {}): DeploymentSterilizerShellExecutionAtomicItemCompletionCommand { return { clinicId: CLINIC_ID, deploymentRunId: DEPLOYMENT_RUN_KEY, sessionId: SESSION_ID, executionKey: EXECUTION_KEY, claimantId: CLAIMANT_ID, ownershipToken: TOKEN, expectedLeaseExpiresAt: LEASE, itemId: ITEM_ID, executionItemKey: EXECUTION_ITEM_KEY, planItemKey: PLAN_ITEM_KEY, expectedSequence: 2, expectedEntityType: "sterilizer_shell", expectedEntityId: STERILIZER_ID, expectedDeploymentSterilizerKey: STERILIZER_KEY, expectedAction: "activate", expectedItemStartedAt: STARTED_AT, expectedAttemptCount: 1, sterilizerId: STERILIZER_ID, expectedSterilizerState: sterilizerState(), expectedTargetState: sterilizerState(), proposedCompletedAt: COMPLETED_AT, ...input }; }
function sterilizerState() { return { deploymentSterilizerKey: STERILIZER_KEY, provisioningSource: "setup_draft", provisioningStatus: "active", active: true }; }
function sessionRow(input: Partial<Record<string, unknown>> = {}) { return { id: SESSION_ID, clinic_id: CLINIC_ID, deployment_run_key: DEPLOYMENT_RUN_KEY, execution_key: EXECUTION_KEY, preparation_status: "ready", execution_status: "running", execution_owner: CLAIMANT_ID, ownership_token: TOKEN, lease_expires_at: LEASE, started_at: "2026-01-01T12:00:00.000Z", completed_at: null, failed_at: null, items_requested: 3, created_at: "2026-01-01T00:00:00.000Z", ...input }; }
function itemRow(sequence = 2, input: Partial<SterilizerShellItemCompletionItemRow> = {}): SterilizerShellItemCompletionItemRow { const isClinic = sequence === 1; return { id: isClinic ? "55555555-5555-4555-8555-555555555555" : ITEM_ID, session_id: SESSION_ID, execution_item_key: isClinic ? `${EXECUTION_KEY}:${PLAN_KEY}:clinic` : sequence === 2 ? EXECUTION_ITEM_KEY : `${EXECUTION_KEY}:${PLAN_KEY}:sterilizer-002`, plan_item_key: isClinic ? `${PLAN_KEY}:clinic` : sequence === 2 ? PLAN_ITEM_KEY : `${PLAN_KEY}:sterilizer-002`, sequence, entity_type: isClinic ? "clinic" : "sterilizer_shell", entity_id: isClinic ? CLINIC_ID : STERILIZER_ID, deployment_key: isClinic ? CLINIC_ID : STERILIZER_KEY, action: "activate", execution_status: isClinic ? "succeeded" : sequence === 2 ? "running" : "pending", attempt_count: sequence === 3 ? 0 : 1, started_at: isClinic ? "2026-01-01T12:01:00.000Z" : sequence === 2 ? STARTED_AT : null, completed_at: isClinic ? "2026-01-01T12:02:00.000Z" : null, rolled_back_at: null, error_code: null, error_message: null, expected_current_state: isClinic ? { deploymentStatus: "draft" } : { deploymentSterilizerKey: STERILIZER_KEY, provisioningSource: "setup_draft", provisioningStatus: "placeholder", active: false }, target_state: isClinic ? { deploymentStatus: "deployed" } : { provisioningStatus: "active", active: true }, dependency_keys: isClinic ? [] : [`${PLAN_KEY}:clinic`], reversible: true, ...input }; }
function sterilizerRow(input: Partial<SterilizerShellItemCompletionSterilizerRow> = {}): SterilizerShellItemCompletionSterilizerRow { return { id: STERILIZER_ID, clinic_id: CLINIC_ID, deployment_sterilizer_key: STERILIZER_KEY, provisioning_source: "setup_draft", provisioning_status: "active", active: true, ...input }; }
function rpcRow(input: Partial<Record<string, unknown>> = {}) { return { status: "completed", claimant_id: CLAIMANT_ID, clinic_id: CLINIC_ID, deployment_run_key: DEPLOYMENT_RUN_KEY, session_id: SESSION_ID, execution_key: EXECUTION_KEY, item_id: ITEM_ID, execution_item_key: EXECUTION_ITEM_KEY, plan_item_key: PLAN_ITEM_KEY, sequence: 2, entity_type: "sterilizer_shell", entity_id: STERILIZER_ID, deployment_sterilizer_key: STERILIZER_KEY, action: "activate", sterilizer_id: STERILIZER_ID, item_status_before: "running", item_status_after: "succeeded", started_at: STARTED_AT, completed_at: COMPLETED_AT, attempt_count: 1, issue_code: null, message: "Sterilizer-shell item completed.", ...input }; }

function expectThrows(name: string, action: () => unknown | Promise<unknown>, expected: string) { try { const value = action(); if (value instanceof Promise) return value.then(() => expectScenario(name, false, "expected exception"), (error) => expectScenario(name, error instanceof Error && error.message.includes(expected), String(error))); } catch (error) { return expectScenario(name, error instanceof Error && error.message.includes(expected), String(error)); } return expectScenario(name, false, "expected exception"); }
function redactPayload(payload: Record<string, unknown>) { return { ...payload, p_ownership_token: "[redacted]" }; }
function redact(value: unknown): unknown { return JSON.parse(JSON.stringify(value, (key, entry) => key === "ownershipToken" ? "[redacted]" : entry)); }
function expectScenario(name: string, passed: boolean, message: string): DeploymentSterilizerShellExecutionItemCompletionSupabaseRepositoryHarnessScenario { return { name, passed, message }; }

class MockSupabaseClient {
  readonly calls: Array<{ table: string; operation: string }> = [];
  readonly rpcCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];
  constructor(readonly tableRows: Record<string, unknown[]> = {}, readonly rpcResults: Record<string, unknown> = {}, readonly error: { message: string; code?: string; details?: string; hint?: string } | null = null) {}
  from(table: string): MockQuery { return new MockQuery(this, table); }
  async rpc(name: string, payload: Record<string, unknown>) { this.rpcCalls.push({ name, payload }); return { data: this.rpcResults[name] ?? [rpcRow()], error: this.error }; }
}
class MockQuery {
  private filters: Array<{ key: string; value: unknown }> = [];
  private orders: Array<{ key: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  constructor(private readonly client: MockSupabaseClient, private readonly table: string) {}
  select(_columns: string): this { return this; }
  eq(key: string, value: unknown): this { this.filters.push({ key, value }); return this; }
  order(key: string, input: { ascending: boolean }): this { this.orders.push({ key, ascending: input.ascending }); return this; }
  limit(count: number): this { this.limitCount = count; return this; }
  then<TResult1 = { data: unknown[]; error: unknown }, TResult2 = never>(onfulfilled?: ((value: { data: unknown[]; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> { return Promise.resolve(this.execute()).then(onfulfilled, onrejected); }
  private execute() { this.client.calls.push({ table: this.table, operation: "select" }); if (this.client.error) return { data: [], error: this.client.error }; let rows = [...(this.client.tableRows[this.table] ?? [])] as Array<Record<string, unknown>>; for (const filter of this.filters) rows = rows.filter((row) => row[filter.key] === filter.value); for (const order of [...this.orders].reverse()) rows.sort((a, b) => (typeof a[order.key] === "number" && typeof b[order.key] === "number" ? Number(a[order.key]) - Number(b[order.key]) : String(a[order.key] ?? "").localeCompare(String(b[order.key] ?? ""))) * (order.ascending ? 1 : -1)); if (this.limitCount !== null) rows = rows.slice(0, this.limitCount); return { data: rows, error: null }; }
}
