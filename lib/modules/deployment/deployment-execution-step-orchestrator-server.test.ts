import type { DeploymentActivationExecutorClinicActivationCommand, DeploymentActivationExecutorClinicActivationResult } from "./deployment-activation-executor-clinic-handler";
import type { DeploymentActivationExecutorProviderShellActivationCommand, DeploymentActivationExecutorProviderShellActivationResult } from "./deployment-activation-executor-provider-shell-handler";
import type { DeploymentExecutionStepRunnerInput } from "./deployment-execution-step-orchestrator-runners";
import { createServerClinicDeploymentExecutionStepDependencies, createServerProviderDeploymentExecutionStepDependencies, executeServerProviderSequence, executeDeploymentExecutionStepForServer, type ServerDeploymentExecutionStepOrchestratorDependencies } from "./deployment-execution-step-orchestrator-server";
import type { DeploymentExecutionStepCompletionStatus, DeploymentExecutionStepNextStartStatus, DeploymentExecutionStepOrchestratorContext, DeploymentExecutionStepOrchestratorItem, DeploymentExecutionStepProgressionStatus } from "./deployment-execution-step-orchestrator-types";
import type { ServerDeploymentExecutionStepBoundaryIssue, ServerDeploymentExecutionStepCompletionBoundaryResult } from "./deployment-execution-step-completion-runner";
import type { ServerDeploymentExecutionStepProgressionBoundaryResult } from "./deployment-execution-step-progression-runner";
import type { ServerDeploymentExecutionStepNextStartBoundaryResult } from "./deployment-execution-step-next-start-runner";

export interface DeploymentExecutionStepOrchestratorServerHarnessScenario { name: string; passed: boolean; message: string }
export interface DeploymentExecutionStepOrchestratorServerHarnessResult { passed: boolean; scenarios: readonly DeploymentExecutionStepOrchestratorServerHarnessScenario[] }
const TOKEN = "sensitive-server-step-token";
const PROVIDER_ID = "f74f1056-0e59-474c-9676-0230d4936114";
const PROVIDER_KEY = "dentist-001";

export async function runDeploymentExecutionStepOrchestratorServerHarness(): Promise<DeploymentExecutionStepOrchestratorServerHarnessResult> {
  const scenarios = [
    await fullPathScenario(),
    await providerIdentityScenario(),
    await immutabilityAndTokenScenario(),
    ...(await completionMappingScenarios()),
    ...(await progressionMappingScenarios()),
    ...(await nextStartMappingScenarios()),
    ...(await entityGateScenarios()),
    ...(await malformedScenarios()),
    ...(await thrownScenarios()),
    adapterSurfaceScenario(),
    serverSourceSurfaceScenario(),
    clinicRuntimeCompositionScenario(),
    providerRuntimeCompositionScenario(),
    await providerSequenceScenario(),
  ];
  return { passed: scenarios.every((current) => current.passed), scenarios };
}

async function fullPathScenario() {
  const harness = createHarness(); const result = await execute(harness);
  return scenario("server composition creates and executes four production adapters in order", result.status === "completed_step" && harness.order.join(",") === "entity_execution,item_completion,dependency_progression,next_item_start" && counts(harness).every((count) => count === 1), harness.order.join(","));
}

async function providerIdentityScenario() {
  const harness = createHarness(); await execute(harness, providerItem());
  const entity = harness.provider.calls[0]; const completion = harness.completion.inputs[0]; const progression = harness.progression.inputs[0]; const next = harness.next.inputs[0];
  const passed = entity?.providerId === PROVIDER_ID && entity.deploymentProviderKey === PROVIDER_KEY && entity.providerId !== entity.deploymentProviderKey && [completion, progression, next].every((input) => input?.item.entityId === PROVIDER_ID && input.item.deploymentKey === PROVIDER_KEY && input.item.deploymentRunKey === item().deploymentRunKey && input.item.sessionId === item().sessionId && input.item.executionKey === item().executionKey && input.item.itemId === providerItem().itemId && input.item.executionItemKey === providerItem().executionItemKey && input.item.planItemKey === providerItem().planItemKey);
  return scenario("provider UUID key and exact execution identities remain separate", passed, "identity mapping checked");
}

async function immutabilityAndTokenScenario() {
  const harness = createHarness(); const sourceItem = providerItem(); const sourceContext = context(); const before = JSON.stringify({ sourceItem, sourceContext }); const result = await execute(harness, sourceItem, sourceContext);
  const inputs = [harness.completion.inputs[0], harness.progression.inputs[0], harness.next.inputs[0]];
  const forwarded = harness.provider.calls[0]?.ownershipToken === TOKEN && inputs.every((input) => input?.context.ownershipToken === TOKEN);
  return scenario("source state dependencies remain immutable and token remains internal", before === JSON.stringify({ sourceItem, sourceContext }) && forwarded && !JSON.stringify(result).includes(TOKEN), "immutability and credential forwarding checked");
}

async function completionMappingScenarios() {
  const statuses: Array<DeploymentExecutionStepCompletionStatus | "not_attempted"> = ["completed", "already_completed", "blocked", "conflict", "not_found", "error", "not_attempted"];
  return Promise.all(statuses.map(async (status) => { const harness = createHarness({ completion: boundaryResult(status) }); const result = await execute(harness); const expected = status === "not_attempted" ? "error" : status; const safe = status === "completed" || status === "already_completed"; return scenario(`completion production ${status} maps exactly`, result.itemCompletion?.status === expected && (safe ? harness.progression.inputs.length === 1 : harness.progression.inputs.length === 0), result.status); }));
}
async function progressionMappingScenarios() {
  const statuses: Array<DeploymentExecutionStepProgressionStatus | "not_attempted"> = ["progressed", "already_progressed", "no_dependencies", "blocked", "conflict", "not_found", "error", "not_attempted"];
  return Promise.all(statuses.map(async (status) => { const harness = createHarness({ progression: boundaryResult(status) }); const result = await execute(harness); const expected = status === "not_attempted" ? "error" : status; const safe = ["progressed", "already_progressed", "no_dependencies"].includes(status); return scenario(`progression production ${status} maps exactly`, result.dependencyProgression?.status === expected && (safe ? harness.next.inputs.length === 1 : harness.next.inputs.length === 0), result.status); }));
}
async function nextStartMappingScenarios() {
  const statuses: Array<DeploymentExecutionStepNextStartStatus | "not_attempted"> = ["started", "already_started", "no_runnable_item", "plan_complete", "blocked", "conflict", "not_found", "error", "not_attempted"];
  return Promise.all(statuses.map(async (status) => { const harness = createHarness({ next: boundaryResult(status) }); const result = await execute(harness); const expected = status === "not_attempted" ? "error" : status; const safe = ["started", "already_started", "no_runnable_item", "plan_complete"].includes(status); return scenario(`next-start production ${status} maps without finalization`, result.nextItemStart?.status === expected && (safe ? result.status === "completed_step" : result.status === expected) && result.downstream.sessionsCompleted === 0 && result.downstream.deploymentsFinalized === 0 && result.downstream.rollbacksExecuted === 0, result.status); }));
}

async function entityGateScenarios() {
  const statuses: DeploymentActivationExecutorClinicActivationResult["status"][] = ["activated", "already_activated", "blocked", "conflict", "not_found", "error"];
  return Promise.all(statuses.map(async (status) => { const harness = createHarness({ clinicStatus: status }); const result = await execute(harness); const safe = status === "activated" || status === "already_activated"; return scenario(`entity production ${status} gates completion`, safe ? harness.completion.inputs.length === 1 : harness.completion.inputs.length === 0, result.status); }));
}

async function malformedScenarios() {
  const stages = ["entity", "completion", "progression", "next"] as const;
  return Promise.all(stages.map(async (stage) => { const harness = createHarness(); if (stage === "entity") harness.clinic.status = "mystery" as never; else harness[stage].result = boundaryResult("mystery"); const result = await execute(harness); return scenario(`malformed production ${stage} result maps to error`, result.status === "error", result.stoppedAtStage); }));
}

async function thrownScenarios() {
  const stages = ["entity", "completion", "progression", "next"] as const;
  return Promise.all(stages.map(async (stage) => { const harness = createHarness(); (stage === "entity" ? harness.clinic : harness[stage]).throwMessage = `thrown ${TOKEN}`; const result = await execute(harness); return scenario(`${stage} thrown error is redacted with no retry or later call`, result.status === "error" && !JSON.stringify(result).includes(TOKEN) && counts(harness).every((count) => count <= 1), JSON.stringify(counts(harness))); }));
}

function adapterSurfaceScenario() {
  const harness = createHarness(); const forbidden = ["repository", "supabase", "rpc", "insert", "update", "upsert", "delete", "retry", "rollback", "finalize"];
  return scenario("production adapters expose no generic repository retry or finalization surface", [harness.clinic, harness.provider, harness.completion, harness.progression, harness.next].every((adapter) => forbidden.every((name) => !(name in adapter))), "adapter objects checked");
}
function clinicRuntimeCompositionScenario() {
  const source = String(createServerClinicDeploymentExecutionStepDependencies);
  const required = ["activateClinicForServerDeployment", "completeActivationExecutionItemForServerDeployment", "progressActivationExecutionDependencyForServerDeployment", "startNextActivationExecutionItemForServerDeployment"];
  const forbidden = ["activateProviderShellForServerDeployment", "completeProviderShellExecutionItemForServerDeployment", "retry", "while (", "for ("];
  return scenario("clinic runtime composition delegates once per RC8 boundary without provider migration or loops", required.every((term) => source.includes(term)) && forbidden.every((term) => !source.includes(term)), "clinic-only source checked");
}
function providerRuntimeCompositionScenario() {
  const composition = String(createServerProviderDeploymentExecutionStepDependencies);
  const actions = require("fs").readFileSync("app/setup/actions.ts", "utf8") as string;
  const providerBranch = actions.slice(actions.indexOf("const providerSequence"), actions.indexOf("return {", actions.indexOf("const providerSequence")));
  const helperCalls = String(executeServerProviderSequence).match(/executeDeploymentExecutionStepForServer\(/g)?.length ?? 0;
  const required = ["activateProviderShellForServerDeployment", "completeProviderShellExecutionItemForServerDeployment", "progressActivationExecutionDependencyForServerDeployment", "startNextActivationExecutionItemForServerDeployment"];
  const noDirectOldCalls = !providerBranch.includes("await activateProviderShellForServerDeployment") && !providerBranch.includes("await completeProviderShellExecutionItemForServerDeployment") && !providerBranch.includes("await progressActivationExecutionDependencyForServerDeployment") && !providerBranch.includes("await startNextActivationExecutionItemForServerDeployment");
  const driver = String(executeServerProviderSequence);
  const identitiesPreserved = driver.includes("entityId: prepared.entityId") && driver.includes("deploymentKey: prepared.deploymentKey") && providerBranch.includes("deploymentRunKey: result.deploymentRun.deploymentRunId");
  const clinicStillGeneric = actions.includes("const deploymentClinicExecutionStep") && actions.includes("createServerClinicDeploymentExecutionStepDependencies");
  const bounded = driver.includes("index < providerItems.length") && (driver.match(/executeServerProviderSequence\(/g)?.length ?? 0) === 1 && !driver.includes("retry") && !driver.includes("while (") && !driver.includes("completeSession") && !driver.includes("finalizeDeployment") && !driver.includes("rollback");
  const noDatabaseCompositionInAction = !providerBranch.includes("createClient") && !providerBranch.includes(".rpc(") && !providerBranch.includes("p_ownership_token");
  return scenario("provider runtime uses one generic step with preserved identity and no direct fallback", helperCalls === 1 && providerBranch.includes("executeServerProviderSequence") && required.every((term) => composition.includes(term)) && noDirectOldCalls && identitiesPreserved && clinicStillGeneric && bounded && noDatabaseCompositionInAction, JSON.stringify({ helperCalls, noDirectOldCalls, identitiesPreserved, clinicStillGeneric, bounded, noDatabaseCompositionInAction }));
}
async function providerSequenceScenario() {
  const prepared = [providerPrepared(2), providerPrepared(3), nonProviderPrepared(4)];
  const calls: string[] = [];
  const executeProviderStep = async ({ current, prepared: item }: { current: any; prepared: any }) => {
    calls.push(`${current.itemId}:${item.executionItemKey}:${item.entityId}:${item.deploymentKey}`);
    const next = current.sequence === 2 ? nextEvidence(3, "provider_shell") : nextEvidence(4, "sterilizer_shell");
    return { step: stepResult(next), evidence: { providerActivation: {} as any, itemCompletion: {} as any, dependencyProgression: {} as any, nextItemStart: next } };
  };
  const result = await executeServerProviderSequence({} as any, { ...sequenceInput(prepared), executeProviderStep });
  const foreign = await executeServerProviderSequence({} as any, { ...sequenceInput(prepared), initialNextItemStart: { ...nextEvidence(2, "provider_shell"), clinicId: "foreign" }, executeProviderStep });
  const duplicate = await executeServerProviderSequence({} as any, { ...sequenceInput(prepared), executeProviderStep: async ({ current, prepared: item }: any) => { const next = current.sequence === 2 ? { ...nextEvidence(3, "provider_shell"), itemId: current.itemId } : nextEvidence(4, "sterilizer_shell"); return { step: stepResult(next), evidence: { providerActivation: {} as any, itemCompletion: {} as any, dependencyProgression: {} as any, nextItemStart: next } }; } });
  const bounded = await executeServerProviderSequence({} as any, { ...sequenceInput([providerPrepared(2), nonProviderPrepared(3)]), executeProviderStep: async () => { const next = nextEvidence(3, "provider_shell"); return { step: stepResult(next), evidence: { providerActivation: {} as any, itemCompletion: {} as any, dependencyProgression: {} as any, nextItemStart: next } }; } });
  const passed = result.ok && result.providerItemsPlanned === 2 && result.providerItemsExecuted === 2 && calls.length === 2 && calls[0].includes("provider-id-2:provider-key-2") && calls[1].includes("provider-id-3:provider-key-3") && result.nextItemStart?.entityType === "sterilizer_shell" && result.lastStep?.downstream.entitiesActivated === 2 && result.lastStep.downstream.itemsCompleted === 2 && result.lastStep.downstream.dependenciesProgressed === 2 && result.lastStep.downstream.itemsStarted === 2 && !foreign.ok && !duplicate.ok && !bounded.ok;
  return scenario("bounded provider sequence executes each provider once then stops at sterilizer", passed, JSON.stringify({ calls, result: result.message, foreign: foreign.message, duplicate: duplicate.message, bounded: bounded.message }));
}
function sequenceInput(preparedExecutionItems: any[]) { return { context: context(), clinicId: "clinic-server-step", deploymentRunKey: "deployment-run-server-step", sessionId: "session-server-step", executionKey: "execution-server-step", planKey: "plan-server-step", deploymentActivationExecutionClaim: {} as any, initialNextItemStart: nextEvidence(2, "provider_shell"), preparedExecutionItems }; }
function providerPrepared(sequence: number) { return { executionItemKey: `execution-server-step:provider-${sequence}`, planItemKey: `plan-server-step:provider-${sequence}`, sequence, entityType: "provider_shell", entityId: `provider-id-${sequence}`, deploymentKey: `provider-key-${sequence}`, action: "activate", currentState: { active: false }, targetState: { active: true }, dependencyKeys: [], executionStatus: "pending", attemptCount: 0, reversible: true, rollbackAction: "restore", startedAt: null, completedAt: null, error: null, evidence: { dependencyLevel: 1, readyDependencyKeys: [], pendingDependencyKeys: [] }, downstream: {} }; }
function nonProviderPrepared(sequence: number) { return { ...providerPrepared(sequence), entityType: "sterilizer_shell", entityId: `sterilizer-id-${sequence}`, deploymentKey: `sterilizer-key-${sequence}` }; }
function nextEvidence(sequence: number, entityType: string) { return { ok: true, status: "started", message: "started", claimantId: "server-step", clinicId: "clinic-server-step", deploymentRunKey: "deployment-run-server-step", sessionId: "session-server-step", executionKey: "execution-server-step", planKey: "plan-server-step", itemId: `item-${sequence}`, executionItemKey: `execution-server-step:${entityType === "provider_shell" ? "provider" : "sterilizer"}-${sequence}`, planItemKey: `plan-server-step:${entityType === "provider_shell" ? "provider" : "sterilizer"}-${sequence}`, sequence, entityType, entityId: `${entityType === "provider_shell" ? "provider" : "sterilizer"}-id-${sequence}`, action: "activate", attemptCount: 1, startedAt: "2026-01-01T12:05:00.000Z", leaseExpiresAt: "2026-01-01T12:15:00.000Z", result: "started", startedCount: 1, reusedCount: 0, conflicts: 0, blockers: 0, warnings: 0, issues: [] } as any; }
function stepResult(next: any) { return { ok: true, status: "completed_step", message: "complete", claimantId: "server-step", clinicId: "clinic-server-step", deploymentRunKey: "deployment-run-server-step", sessionId: "session-server-step", executionKey: "execution-server-step", planKey: "plan-server-step", itemId: "item", executionItemKey: "item", planItemKey: "plan", sequence: 1, entityType: "provider_shell", entityId: "provider", deploymentKey: "key", action: "activate", stoppedAtStage: "next_item_start", completedStages: ["entity_execution", "item_completion", "dependency_progression", "next_item_start"], entityExecution: null, itemCompletion: null, dependencyProgression: null, nextItemStart: next, issues: [], blockers: 0, conflicts: 0, warnings: 0, downstream: { entitiesActivated: 1, itemsCompleted: 1, dependenciesProgressed: 1, itemsStarted: 1, bindingsWritten: 0, assignmentsFinalized: 0, sessionsCompleted: 0, deploymentsFinalized: 0, rollbacksExecuted: 0 } } as any; }
function serverSourceSurfaceScenario() {
  const source = String(executeDeploymentExecutionStepForServer); const forbidden = ["app/setup", "DeploymentEngine.execute", ".rpc(", "createClient", "for (", "while (", "setInterval", "worker", "queue", "poll", "stream"];
  return scenario("server helper has no runtime wiring database loop or background behavior", forbidden.every((term) => !source.includes(term)), forbidden.filter((term) => source.includes(term)).join(",") || "none");
}

interface Config { clinicStatus: DeploymentActivationExecutorClinicActivationResult["status"]; completion: ServerDeploymentExecutionStepCompletionBoundaryResult; progression: ServerDeploymentExecutionStepProgressionBoundaryResult; next: ServerDeploymentExecutionStepNextStartBoundaryResult; }
interface Harness extends ServerDeploymentExecutionStepOrchestratorDependencies { order: string[]; clinic: FakeClinicBoundary; provider: FakeProviderBoundary; completion: FakeCompletionBoundary; progression: FakeProgressionBoundary; next: FakeNextBoundary; }
function createHarness(config: Partial<Config> = {}): Harness { const order: string[] = []; const clinic = new FakeClinicBoundary(config.clinicStatus ?? "activated", order); const provider = new FakeProviderBoundary(order); const completion = new FakeCompletionBoundary(config.completion ?? boundaryResult("completed"), order); const progression = new FakeProgressionBoundary(config.progression ?? boundaryResult("progressed"), order); const next = new FakeNextBoundary(config.next ?? boundaryResult("started"), order); return { order, clinic, provider, completion, progression, next, entityExecution: { clinicActivation: clinic, providerShellActivation: provider }, itemCompletion: completion, dependencyProgression: progression, nextItemStart: next }; }

class FakeClinicBoundary { calls: DeploymentActivationExecutorClinicActivationCommand[] = []; throwMessage: string | null = null; constructor(public status: DeploymentActivationExecutorClinicActivationResult["status"], private readonly order: string[]) {} async activateClinic(command: DeploymentActivationExecutorClinicActivationCommand): Promise<DeploymentActivationExecutorClinicActivationResult> { this.order.push("entity_execution"); this.calls.push(clone(command)); if (this.throwMessage) throw new Error(this.throwMessage); const ok = this.status === "activated" || this.status === "already_activated"; return { ok, status: this.status, message: `clinic ${this.status}`, clinicId: command.clinicId, currentClinicState: {}, targetClinicState: {}, deployedAt: null, activationResult: this.status, issues: ok ? [] : [boundaryIssue(this.status)] }; } }
class FakeProviderBoundary { calls: DeploymentActivationExecutorProviderShellActivationCommand[] = []; throwMessage: string | null = null; constructor(private readonly order: string[]) {} async activateProviderShell(command: DeploymentActivationExecutorProviderShellActivationCommand): Promise<DeploymentActivationExecutorProviderShellActivationResult> { this.order.push("entity_execution"); this.calls.push(clone(command)); if (this.throwMessage) throw new Error(this.throwMessage); return { ok: true, status: "activated", message: "provider activated", providerId: command.providerId, deploymentProviderKey: command.deploymentProviderKey, provisioningSourceBefore: "setup_draft", provisioningSourceAfter: "setup_draft", provisioningStatusBefore: "planned", provisioningStatusAfter: "active", activeBefore: false, activeAfter: true, activatedAt: command.providerActivatedAt, activationResult: "activated", issues: [] }; } }
abstract class FakeStageBoundary<T extends { status: string; message: string }> { inputs: DeploymentExecutionStepRunnerInput[] = []; throwMessage: string | null = null; constructor(public result: T, private readonly stage: string, private readonly order: string[]) {} protected invoke(input: DeploymentExecutionStepRunnerInput): T { this.order.push(this.stage); this.inputs.push(clone(input)); if (this.throwMessage) throw new Error(this.throwMessage); return clone(this.result); } }
class FakeCompletionBoundary extends FakeStageBoundary<ServerDeploymentExecutionStepCompletionBoundaryResult> { constructor(result: ServerDeploymentExecutionStepCompletionBoundaryResult, order: string[]) { super(result, "item_completion", order); } completeCurrentItem(input: DeploymentExecutionStepRunnerInput) { return this.invoke(input); } }
class FakeProgressionBoundary extends FakeStageBoundary<ServerDeploymentExecutionStepProgressionBoundaryResult> { constructor(result: ServerDeploymentExecutionStepProgressionBoundaryResult, order: string[]) { super(result, "dependency_progression", order); } progressCurrentItemDependencies(input: DeploymentExecutionStepRunnerInput) { return this.invoke(input); } }
class FakeNextBoundary extends FakeStageBoundary<ServerDeploymentExecutionStepNextStartBoundaryResult> { constructor(result: ServerDeploymentExecutionStepNextStartBoundaryResult, order: string[]) { super(result, "next_item_start", order); } startAtMostOneNextItem(input: DeploymentExecutionStepRunnerInput) { return this.invoke(input); } }

async function execute(harness: Harness, sourceItem = item(), sourceContext = context()) { return executeDeploymentExecutionStepForServer(harness, { item: sourceItem, context: sourceContext }); }
function counts(harness: Harness) { return [harness.clinic.calls.length + harness.provider.calls.length, harness.completion.inputs.length, harness.progression.inputs.length, harness.next.inputs.length]; }
function boundaryResult(status: string): ServerDeploymentExecutionStepCompletionBoundaryResult { const safe = ["completed", "already_completed", "progressed", "already_progressed", "no_dependencies", "started", "already_started", "no_runnable_item", "plan_complete"].includes(status); return { status, message: `boundary ${status}`, issues: safe ? [] : [boundaryIssue(status)], diagnostics: { source: "safe-production-boundary" } }; }
function boundaryIssue(code: string): ServerDeploymentExecutionStepBoundaryIssue { return { code, severity: "blocker", message: `boundary ${code}`, diagnostics: { source: "safe-production-boundary" } }; }
function context(): DeploymentExecutionStepOrchestratorContext { return { claimantId: "server-step", ownershipToken: TOKEN, leaseExpiresAt: "2026-01-01T12:15:00.000Z", executedAt: "2026-01-01T12:06:00.000Z" }; }
function providerItem(): DeploymentExecutionStepOrchestratorItem { return item({ itemId: "item-server-step-provider", executionItemKey: "execution-server-step:provider", planItemKey: "plan-server-step:provider", sequence: 2, entityType: "provider_shell", entityId: PROVIDER_ID, deploymentKey: PROVIDER_KEY, expectedCurrentState: { active: false }, targetState: { active: true }, dependencyKeys: ["plan-server-step:clinic"] }); }
function item(input: Partial<DeploymentExecutionStepOrchestratorItem> = {}): DeploymentExecutionStepOrchestratorItem { return { clinicId: "clinic-server-step", deploymentRunKey: "deployment-run-server-step", sessionId: "session-server-step", executionKey: "execution-server-step", planKey: "plan-server-step", itemId: "item-server-step", executionItemKey: "execution-server-step:clinic", planItemKey: "plan-server-step:clinic", sequence: 1, entityType: "clinic", entityId: "clinic-server-step", deploymentKey: "clinic-server-step", action: "activate", executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:05:00.000Z", completedAt: null, rolledBackAt: null, errorCode: null, errorMessage: null, expectedCurrentState: { active: false }, targetState: { active: true }, dependencyKeys: [], reversible: false, rollbackBehavior: null, ...input }; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function scenario(name: string, passed: boolean, message: string): DeploymentExecutionStepOrchestratorServerHarnessScenario { return { name, passed, message }; }
