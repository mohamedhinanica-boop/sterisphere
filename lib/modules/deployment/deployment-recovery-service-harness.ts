import type { DeploymentRecoveryRepository } from "./deployment-recovery-repository";
import { buildDeploymentRecoveryPersistenceCommand, DeploymentRecoveryPersistenceService } from "./deployment-recovery-service";
import type { DeploymentRecoveryPersistenceInput, DeploymentRecoveryPersistenceRepositoryResult } from "./deployment-recovery-persistence-types";
import type { DeploymentExecutionRecoveryResult, DeploymentExecutionRecoveryRollbackItem } from "./deployment-recovery-types";

export interface DeploymentRecoveryPersistenceHarnessScenario { name: string; passed: boolean; message: string }
export interface DeploymentRecoveryPersistenceHarnessResult { passed: boolean; scenarios: readonly DeploymentRecoveryPersistenceHarnessScenario[] }

const IDS = {
  clinicId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222",
  hardwareId: "33333333-3333-4333-8333-333333333333", targetId: "44444444-4444-4444-8444-444444444444",
  recoveryPlanId: "55555555-5555-4555-8555-555555555555", runKey: "deployment-run-001",
  executionKey: "execution-001", planKey: "plan-001",
} as const;

class MemoryRecoveryRepository implements DeploymentRecoveryRepository {
  calls = 0;
  commands: Parameters<DeploymentRecoveryRepository["persistRecoveryPlan"]>[0][] = [];
  constructor(public result: DeploymentRecoveryPersistenceRepositoryResult = repositoryResult("created")) {}
  async persistRecoveryPlan(command: Parameters<DeploymentRecoveryRepository["persistRecoveryPlan"]>[0]) {
    this.calls += 1; this.commands.push(command); return this.result;
  }
}

export async function runDeploymentRecoveryPersistenceServiceHarness(): Promise<DeploymentRecoveryPersistenceHarnessResult> {
  const scenarios: DeploymentRecoveryPersistenceHarnessScenario[] = [];
  const test = async (name: string, input: DeploymentRecoveryPersistenceInput, assertion: (value: Awaited<ReturnType<DeploymentRecoveryPersistenceService["persistRecoveryDecision"]>>, repo: MemoryRecoveryRepository) => boolean, result = repositoryResult("created")) => {
    const repo = new MemoryRecoveryRepository(result); const value = await new DeploymentRecoveryPersistenceService(repo).persistRecoveryDecision(input);
    scenarios.push({ name, passed: assertion(value, repo), message: JSON.stringify(value) });
  };
  await test("valid rollback_not_required result persists", input(), (v) => v.status === "persisted");
  await test("valid executable rollback_required result persists", input(bindingRecovery()), (v) => v.status === "persisted" && v.rollbackItemsRequested === 1);
  await test("valid non-executable rollback_required result persists", input(nonExecutableRecovery()), (v) => v.status === "persisted");
  await test("blocked recovery decision persists", input(statusRecovery("blocked")), (v) => v.status === "persisted");
  await test("not_found recovery decision persists", input(statusRecovery("not_found")), (v) => v.status === "persisted");
  await test("identical replay maps to reused", input(), (v) => v.status === "reused", repositoryResult("reused"));
  await test("repository conflict maps to conflict", input(), (v) => v.status === "conflict", repositoryResult("conflict"));
  await test("repository blocked maps safely", input(), (v) => v.status === "blocked", repositoryResult("blocked"));
  await test("repository not_found maps safely", input(), (v) => v.status === "not_found", repositoryResult("not_found"));
  await test("repository error maps to repository_error", input(), (v) => v.status === "repository_error", repositoryResult("error"));
  for (const [name, field] of [["clinic mismatch", "clinicId"], ["run mismatch", "deploymentRunKey"], ["session mismatch", "sessionId"], ["execution mismatch", "executionKey"], ["plan mismatch", "planKey"]] as const) {
    const value = input(); (value as unknown as Record<string, unknown>)[field] = "foreign";
    await test(name, value, (v, r) => v.status === "blocked" && r.calls === 0);
  }
  const invalidStatus = input(); (invalidStatus.recovery as unknown as { status: string }).status = "invalid";
  await test("malformed recovery status blocked", invalidStatus, (v, r) => v.status === "blocked" && r.calls === 0);
  const required = input(); required.recovery = { ...required.recovery, rollbackRequired: true };
  await test("rollbackRequired inconsistency blocked", required, (v) => v.status === "blocked");
  const executable = input(); executable.recovery = { ...executable.recovery, rollbackExecutable: true };
  await test("rollbackExecutable inconsistency blocked", executable, (v) => v.status === "blocked");
  for (const [name, completed, reversible] of [["negative completed count blocked", -1, 0], ["negative reversible count blocked", 0, -1], ["reversible exceeds completed blocked", 0, 1]] as const) {
    const value = input(); value.recovery = { ...value.recovery, completedMutationCount: completed, reversibleMutationCount: reversible };
    await test(name, value, (v) => v.status === "blocked");
  }
  const mutations: [string, (items: DeploymentExecutionRecoveryRollbackItem[]) => void][] = [
    ["duplicate rollback item key blocked", (x) => { x[1].rollbackItemKey = x[0].rollbackItemKey; }],
    ["duplicate rollback sequence blocked", (x) => { x[1].rollbackSequence = x[0].rollbackSequence; }],
    ["duplicate source execution item blocked", (x) => { x[1].sourceExecutionItemKey = x[0].sourceExecutionItemKey; }],
    ["invalid reverse sequence ordering blocked", (x) => { x[0].sourceSequence = 2; x[1].sourceSequence = 1; }],
  ];
  for (const [name, mutate] of mutations) { const value = input(twoItemRecovery()); const items = value.recovery.rollbackItems.map((x) => ({ ...x })); mutate(items); value.recovery = { ...value.recovery, rollbackItems: items }; await test(name, value, (v) => v.status === "blocked"); }
  const mixed = input(bindingRecovery()); mixed.recovery = { ...mixed.recovery, runningItemsToRecover: [{ executionItemKey: "item-1", planItemKey: "plan-item-1", sequence: 1, entityType: "hardware_binding", entityId: IDS.hardwareId, action: "bind", recoveryControl: "cancel_or_reset_required" }] };
  await test("running successor mixed into rollback items blocked", mixed, (v) => v.status === "blocked");
  const reused = input(bindingRecovery()); reused.recovery = { ...reused.recovery, rollbackItems: [{ ...reused.recovery.rollbackItems[0], expectedPriorState: { ...reused.recovery.rollbackItems[0].expectedPriorState, targetId: IDS.targetId } }] };
  await test("reused Hardware Binding destructive rollback blocked", reused, (v) => v.status === "blocked");
  const incomplete = input(bindingRecovery()); incomplete.recovery = { ...incomplete.recovery, rollbackItems: [{ ...incomplete.recovery.rollbackItems[0], entityId: null }] };
  await test("incomplete Hardware Binding identity blocked", incomplete, (v) => v.status === "blocked");
  const a = buildDeploymentRecoveryPersistenceCommand(input(bindingRecovery())); const b = buildDeploymentRecoveryPersistenceCommand(input(bindingRecovery()));
  scenarios.push(check("deterministic recovery key", a.recoveryKey === b.recoveryKey));
  scenarios.push(check("deterministic normalized payload hash", a.payloadHash === b.payloadHash));
  const reordered = input(bindingRecovery()); reordered.recovery = { ...reordered.recovery, issues: [...reordered.recovery.issues].reverse() };
  scenarios.push(check("semantically identical normalized input produces same hash", a.payloadHash === buildDeploymentRecoveryPersistenceCommand(reordered).payloadHash));
  const ordered = buildDeploymentRecoveryPersistenceCommand(input(twoItemRecovery())).command;
  scenarios.push(check("rollback items normalized in authoritative order", ordered?.rollbackItems.map((x) => x.rollbackSequence).join(",") === "1,2"));
  await test("repository called exactly once on success", input(), (_v, r) => r.calls === 1);
  const unsafe = input(); unsafe.recovery = { ...unsafe.recovery, failure: { ...unsafe.recovery.failure!, diagnostics: { ownershipToken: "secret" } } };
  await test("repository not called on validation failure", unsafe, (_v, r) => r.calls === 0);
  await test("all rollback execution counters remain zero", input(), (v) => v.downstream.rollbackExecuted === 0 && v.downstream.entitiesCompensated === 0 && v.downstream.bindingsRemoved === 0 && v.downstream.sessionsRecovered === 0 && v.downstream.finalized === 0);
  scenarios.push(check("no mutation dependency exists", !Object.keys(new DeploymentRecoveryPersistenceService(new MemoryRecoveryRepository())).some((x) => /rollback|mutation|session|final/i.test(x))));
  await test("safe issues only", unsafe, (v) => !JSON.stringify(v).includes("secret"));
  scenarios.push(check("repeated invocation remains deterministic", a.command?.idempotencyKey === b.command?.idempotencyKey));
  return { passed: scenarios.every((x) => x.passed), scenarios };
}

function check(name: string, passed: boolean): DeploymentRecoveryPersistenceHarnessScenario { return { name, passed, message: String(passed) }; }
function input(recovery = statusRecovery("rollback_not_required")): DeploymentRecoveryPersistenceInput { return { clinicId: IDS.clinicId, deploymentRunKey: IDS.runKey, sessionId: IDS.sessionId, executionKey: IDS.executionKey, planKey: IDS.planKey, recovery }; }
function statusRecovery(status: DeploymentExecutionRecoveryResult["status"]): DeploymentExecutionRecoveryResult {
  const rollbackRequired = status === "rollback_required";
  return { ok: true, status, message: "Recovery decision complete.", clinicId: IDS.clinicId, deploymentRunKey: IDS.runKey, sessionId: IDS.sessionId, executionKey: IDS.executionKey, planKey: IDS.planKey,
    failure: { failureCode: "execution_failed", failureLayer: "deployment", failedAt: "2026-01-01T12:00:00.000Z", message: "Deployment execution failure classified for recovery planning.", failedExecutionItemKey: null, failedPlanItemKey: null, failedSequence: null, failedEntityType: null, failedEntityId: null, failedAction: null, retryable: false, diagnostics: { operation: "execute" } },
    failedItem: null, rollbackRequired, rollbackExecutable: false, rollbackItems: [], unsupportedCompensations: [], runningItemsToRecover: [], completedMutationCount: 0, reversibleMutationCount: 0, issues: [], stoppedAtStage: "decision_complete",
    downstream: { failuresClassified: 1, rollbackItemsPlanned: 0, unsupportedCompensations: 0, runningItemsIdentified: 0, rollbackExecuted: 0, entitiesCompensated: 0, bindingsRemoved: 0, sessionsRecovered: 0, finalized: 0 } };
}
function bindingItem(sequence = 1): DeploymentExecutionRecoveryRollbackItem { return { rollbackItemKey: `rollback-${sequence}`, sourceExecutionItemKey: `item-${sequence}`, sourcePlanItemKey: `plan-item-${sequence}`, sourceSequence: sequence, rollbackSequence: sequence, entityType: "hardware_binding", entityId: IDS.hardwareId, originalAction: "bind", compensationAction: "remove_deployment_hardware_binding", compensationReason: "Remove newly written binding.", expectedCurrentState: { hardwareId: IDS.hardwareId, deploymentHardwareKey: "hardware-001", targetType: "workstation", targetId: IDS.targetId, targetDeploymentKey: "workstation-001" }, expectedPriorState: { hardwareId: IDS.hardwareId, deploymentHardwareKey: "hardware-001", targetType: "workstation", targetId: null, targetDeploymentKey: "workstation-001" }, reversible: true, blockedReason: null }; }
function bindingRecovery(): DeploymentExecutionRecoveryResult { const r = statusRecovery("rollback_required"); return { ...r, rollbackExecutable: true, rollbackItems: [bindingItem()], completedMutationCount: 1, reversibleMutationCount: 1, downstream: { ...r.downstream, rollbackItemsPlanned: 1 } }; }
function twoItemRecovery(): DeploymentExecutionRecoveryResult { const r = bindingRecovery(); const high = { ...bindingItem(2), rollbackSequence: 1 }; const low = { ...bindingItem(1), rollbackSequence: 2 }; return { ...r, rollbackItems: [low, high], completedMutationCount: 2, reversibleMutationCount: 2, downstream: { ...r.downstream, rollbackItemsPlanned: 2 } }; }
function nonExecutableRecovery(): DeploymentExecutionRecoveryResult { const r = statusRecovery("rollback_required"); const item: DeploymentExecutionRecoveryRollbackItem = { ...bindingItem(), entityType: "hardware_shell", originalAction: "activate", compensationAction: null, reversible: false, blockedReason: "unsupported" }; return { ...r, rollbackItems: [item], unsupportedCompensations: [{ entityType: "hardware_shell", action: "activate", support: "unsupported", compensationAction: null, reason: "Not implemented." }], completedMutationCount: 1, downstream: { ...r.downstream, rollbackItemsPlanned: 1, unsupportedCompensations: 1 } }; }
function repositoryResult(status: DeploymentRecoveryPersistenceRepositoryResult["status"]): DeploymentRecoveryPersistenceRepositoryResult { return { ok: status === "created" || status === "reused", status, recoveryPlanId: status === "created" || status === "reused" ? IDS.recoveryPlanId : null, recoveryKey: "ignored-by-memory-repository", payloadHash: "payload", recoveryStatus: "rollback_not_required", rollbackRequired: false, rollbackExecutable: false, rollbackItemsPersisted: status === "created" ? 0 : 0, rollbackItemsReused: 0, issueCode: status === "error" ? "rpc_failure" : null, message: `repository ${status}`, persistedAt: status === "created" || status === "reused" ? "2026-01-01T12:01:00.000Z" : null, repositoryError: status === "error" ? { code: "rpc_failure", layer: "deployment_recovery_repository", message: "safe", retryable: false } : null }; }
