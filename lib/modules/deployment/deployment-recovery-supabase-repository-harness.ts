import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentRecoveryPersistenceCommand } from "./deployment-recovery-persistence-types";
import { DEPLOYMENT_RECOVERY_PERSISTENCE_RPC_NAME, SupabaseDeploymentRecoveryRepository, deploymentRecoveryPersistenceRpcPayload } from "./deployment-recovery-supabase-repository";

export interface DeploymentRecoveryRepositoryHarnessScenario { name: string; passed: boolean; message: string }
export interface DeploymentRecoveryRepositoryHarnessResult { passed: boolean; scenarios: readonly DeploymentRecoveryRepositoryHarnessScenario[] }
const PLAN_ID = "55555555-5555-4555-8555-555555555555";

export async function runDeploymentRecoverySupabaseRepositoryHarness(): Promise<DeploymentRecoveryRepositoryHarnessResult> {
  const scenarios: DeploymentRecoveryRepositoryHarnessScenario[] = [];
  const run = async (name: string, data: unknown, error: unknown, assertion: (r: Awaited<ReturnType<SupabaseDeploymentRecoveryRepository["persistRecoveryPlan"]>>, mock: RpcMock) => boolean) => {
    const mock = new RpcMock(data, error); const result = await new SupabaseDeploymentRecoveryRepository(mock as unknown as SupabaseClient).persistRecoveryPlan(command());
    scenarios.push({ name, passed: assertion(result, mock), message: JSON.stringify(result) });
  };
  await run("created RPC result maps correctly", row("created"), null, (r) => r.status === "created" && r.ok);
  await run("reused RPC result maps correctly", row("reused"), null, (r) => r.status === "reused" && r.ok);
  await run("conflict maps without throwing", row("conflict"), null, (r) => r.status === "conflict" && !r.ok);
  await run("blocked maps without throwing", row("blocked"), null, (r) => r.status === "blocked");
  await run("not_found maps without throwing", row("not_found"), null, (r) => r.status === "not_found");
  await run("sanitized error maps safely", null, secretError(), (r) => r.status === "error" && !JSON.stringify(r).includes("sensitive"));
  await run("repository invokes exactly one RPC", row("created"), null, (_r, m) => m.calls === 1);
  await run("correct RPC name used", row("created"), null, (_r, m) => m.name === DEPLOYMENT_RECOVERY_PERSISTENCE_RPC_NAME);
  await run("parent identities mapped exactly", row("created"), null, (_r, m) => m.payload?.p_clinic_id === command().clinicId && m.payload?.p_execution_key === command().executionKey);
  await run("deterministic rollback item order preserved", row("created"), null, (_r, m) => (m.payload?.p_rollback_items as { rollbackSequence: number }[]).map((x) => x.rollbackSequence).join(",") === "1,2");
  const empty = command(); empty.rollbackItems = [];
  scenarios.push(check("empty rollback item list supported", (deploymentRecoveryPersistenceRpcPayload(empty).p_rollback_items as unknown[]).length === 0));
  scenarios.push(check("rollback_required executable plan mapped", deploymentRecoveryPersistenceRpcPayload(command()).p_rollback_executable === true));
  const nonexec = command(); nonexec.rollbackExecutable = false;
  scenarios.push(check("rollback_required non-executable plan mapped", deploymentRecoveryPersistenceRpcPayload(nonexec).p_rollback_executable === false));
  for (const [name, status] of [["rollback_not_required plan mapped", "rollback_not_required"], ["blocked recovery evidence mapped", "blocked"], ["not_found recovery evidence mapped", "not_found"]] as const) { const c = command(); c.recoveryStatus = status; scenarios.push(check(name, deploymentRecoveryPersistenceRpcPayload(c).p_recovery_status === status)); }
  scenarios.push(check("Hardware Binding exact identity mapped", JSON.stringify(deploymentRecoveryPersistenceRpcPayload(command()).p_rollback_items).includes("hardware-001")));
  scenarios.push(check("reused binding destructive compensation not fabricated", !JSON.stringify(deploymentRecoveryPersistenceRpcPayload(command())).includes("disposition")));
  scenarios.push(check("running successor remains outside rollback children", (deploymentRecoveryPersistenceRpcPayload(command()).p_running_items_to_recover as unknown[]).length === 1 && (deploymentRecoveryPersistenceRpcPayload(command()).p_rollback_items as unknown[]).length === 2));
  await run("unknown RPC status becomes sanitized error", { ...row("created")[0], persistence_status: "unknown" }, null, (r) => r.repositoryError?.code === "malformed_response");
  await run("malformed RPC response becomes sanitized error", [], null, (r) => r.repositoryError?.code === "malformed_response");
  for (const name of ["Postgres details discarded", "Postgres hint discarded", "stack discarded", "nested cause discarded", "service-role or request metadata not exposed"] as const) await run(name, null, secretError(), (r) => !JSON.stringify(r).includes("sensitive"));
  for (const name of ["direct table insert is never called", "execution-session mutation is never called", "execution-item mutation is never called", "entity/binding mutation is never called"] as const) await run(name, row("created"), null, (_r, m) => m.fromCalls === 0);
  await run("missing RPC maps rpc_unavailable", null, { code: "PGRST202", message: "sensitive" }, (r) => r.repositoryError?.code === "rpc_unavailable");
  await run("RPC error result is structured", row("error"), null, (r) => r.status === "error" && r.repositoryError?.layer === "deployment_recovery_repository");
  return { passed: scenarios.every((x) => x.passed), scenarios };
}

class RpcMock {
  calls = 0; fromCalls = 0; name: string | null = null; payload: Record<string, unknown> | null = null;
  constructor(private data: unknown, private error: unknown) {}
  async rpc(name: string, payload: Record<string, unknown>) { this.calls++; this.name = name; this.payload = payload; return { data: this.data, error: this.error }; }
  from() { this.fromCalls++; throw new Error("direct table access forbidden"); }
}
function check(name: string, passed: boolean): DeploymentRecoveryRepositoryHarnessScenario { return { name, passed, message: String(passed) }; }
function secretError() { return { code: "XX000", message: "sensitive token", details: "sensitive sql", hint: "sensitive hint", stack: "sensitive stack", cause: { token: "sensitive" }, headers: { authorization: "sensitive" } }; }
function row(status: "created" | "reused" | "conflict" | "blocked" | "not_found" | "error") { const c = command(); return [{ persistence_status: status, recovery_plan_id: status === "created" || status === "reused" ? PLAN_ID : null, recovery_key: c.recoveryKey, recovery_status: c.recoveryStatus, rollback_required: c.rollbackRequired, rollback_executable: c.rollbackExecutable, rollback_items_persisted: status === "created" ? 2 : 0, rollback_items_reused: status === "reused" ? 2 : 0, issue_code: status === "error" ? "persistence_error" : null, message: "ignored", persisted_at: status === "created" || status === "reused" ? "2026-01-01T12:00:00.000Z" : null }]; }
function command(): DeploymentRecoveryPersistenceCommand {
  const item = (source: number, rollback: number) => ({ rollbackItemKey: `rollback-${source}`, sourceExecutionItemKey: `item-${source}`, sourcePlanItemKey: `plan-item-${source}`, sourceSequence: source, rollbackSequence: rollback, entityType: "hardware_binding", entityId: "33333333-3333-4333-8333-333333333333", originalAction: "bind", compensationAction: "remove_deployment_hardware_binding", compensationReason: "Remove binding", expectedCurrentState: { hardwareId: "33333333-3333-4333-8333-333333333333", deploymentHardwareKey: "hardware-001", targetType: "workstation", targetId: "44444444-4444-4444-8444-444444444444", targetDeploymentKey: "workstation-001" }, expectedPriorState: { hardwareId: "33333333-3333-4333-8333-333333333333", deploymentHardwareKey: "hardware-001", targetType: "workstation", targetId: null, targetDeploymentKey: "workstation-001" }, reversible: true, blockedReason: null });
  return { clinicId: "11111111-1111-4111-8111-111111111111", deploymentRunKey: "deployment-run-001", sessionId: "22222222-2222-4222-8222-222222222222", executionKey: "execution-001", planKey: "plan-001", recoveryKey: "deployment-recovery:1234abcd", idempotencyKey: "deployment-recovery:1234abcd", payloadHash: "recovery-payload-1234abcd", recoveryStatus: "rollback_required", rollbackRequired: true, rollbackExecutable: true,
    sanitizedFailure: { failureCode: "execution_failed", failureLayer: "deployment", failedAt: "2026-01-01T12:00:00.000Z", message: "Deployment execution failure classified for recovery planning.", failedExecutionItemKey: "item-2", failedPlanItemKey: "plan-item-2", failedSequence: 2, failedEntityType: "hardware_binding", failedEntityId: "33333333-3333-4333-8333-333333333333", failedAction: "bind", retryable: false, diagnostics: { operation: "execute" } }, unsupportedCompensations: [], runningItemsToRecover: [{ executionItemKey: "successor", planItemKey: "successor-plan", sequence: 3, entityType: "hardware_binding", entityId: null, action: "bind", recoveryControl: "cancel_or_reset_required" }], completedMutationCount: 2, reversibleMutationCount: 2, downstream: { failuresClassified: 1, rollbackItemsPlanned: 2, unsupportedCompensations: 0, runningItemsIdentified: 1, rollbackExecuted: 0, entitiesCompensated: 0, bindingsRemoved: 0, sessionsRecovered: 0, finalized: 0 }, evidence: { message: "Recovery decision complete.", failedItem: null, issues: [], stoppedAtStage: "decision_complete" }, rollbackItems: [item(1, 2), item(2, 1)] };
}
