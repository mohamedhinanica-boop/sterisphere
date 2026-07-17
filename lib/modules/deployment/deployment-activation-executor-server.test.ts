import type {
  DeploymentActivationExecutorClinicActivationCommand,
  DeploymentActivationExecutorClinicActivationResult,
} from "./deployment-activation-executor-clinic-handler";
import type {
  DeploymentActivationExecutorProviderShellActivationCommand,
  DeploymentActivationExecutorProviderShellActivationResult,
} from "./deployment-activation-executor-provider-shell-handler";
import {
  runDeploymentActivationExecutorHandlerRegistryHarness,
} from "./deployment-activation-executor-handler-registry.test";
import {
  createServerDeploymentActivationExecutor,
  executeActivationItemForServerDeployment,
} from "./deployment-activation-executor-server";
import type {
  DeploymentActivationExecutorContext,
  DeploymentActivationExecutorItem,
  DeploymentActivationExecutorResult,
} from "./deployment-activation-executor-types";

export interface DeploymentActivationExecutorServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

const TOKEN = "sensitive-server-composition-token";
const CLINIC_ID = "clinic-server-composition-001";
const PROVIDER_ID = "62bcfae5-f568-43a7-96bd-da806b7bf071";
const PROVIDER_KEY = "dentist-001";

export async function runDeploymentActivationExecutorServerHarness(): Promise<{
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutorServerHarnessScenario[];
}> {
  const inherited = await runDeploymentActivationExecutorHandlerRegistryHarness();
  const scenarios: DeploymentActivationExecutorServerHarnessScenario[] = [
    ...inherited.scenarios,
    await clinicCompositionScenario(),
    await providerCompositionScenario(),
    await identityAndStateScenario(),
    await sourceImmutabilityScenario(),
    await tokenRedactionScenario(),
    await thrownTokenRedactionScenario(),
    ...(await unsupportedScenarios()),
    ...(await lifecycleScenarios()),
    await exactlyOneHandlerScenario(),
    await zeroDownstreamScenario(),
    noOrchestrationSurfaceScenario(),
    ...compositionSourceAuditScenarios(),
  ];
  return { passed: scenarios.every((scenario) => scenario.passed), scenarios };
}

async function clinicCompositionScenario() {
  const harness = fakeDependencies();
  const result = await execute(harness, clinicItem());
  return scenario("server composition resolves and invokes clinic handler", result.status === "handled" && harness.clinic.calls.length === 1 && harness.provider.calls.length === 0, result.handlerId ?? "none");
}

async function providerCompositionScenario() {
  const harness = fakeDependencies();
  const result = await execute(harness, providerItem());
  return scenario("server composition resolves and invokes provider handler", result.status === "handled" && harness.provider.calls.length === 1 && harness.clinic.calls.length === 0, result.handlerId ?? "none");
}

async function identityAndStateScenario() {
  const harness = fakeDependencies();
  await execute(harness, clinicItem());
  await execute(harness, providerItem());
  const clinic = harness.clinic.calls[0];
  const provider = harness.provider.calls[0];
  const passed = clinic?.clinicId === CLINIC_ID && clinic.deploymentRunKey === item().deploymentRunKey && clinic.deploymentActivationExecutionItemStart.entityId === CLINIC_ID && provider?.providerId === PROVIDER_ID && provider.deploymentProviderKey === PROVIDER_KEY && provider.providerId !== provider.deploymentProviderKey && provider.deploymentRunKey === item().deploymentRunKey && provider.deploymentActivationExecutionNextItemStart.sessionId === item().sessionId && provider.deploymentActivationExecutionNextItemStart.executionKey === item().executionKey && provider.deploymentActivationExecutionNextItemStart.itemId === providerItem().itemId && provider.deploymentActivationExecutionNextItemStart.executionItemKey === providerItem().executionItemKey && provider.deploymentActivationExecutionNextItemStart.planItemKey === providerItem().planItemKey;
  return scenario("server composition preserves all entity and execution identities", passed, "identity mapping checked");
}

async function sourceImmutabilityScenario() {
  const harness = fakeDependencies();
  const sourceItem = providerItem();
  const sourceContext = context();
  const before = JSON.stringify({ sourceItem, sourceContext });
  await execute(harness, sourceItem, sourceContext);
  const command = harness.provider.calls[0];
  if (command?.expectedCurrentState) command.expectedCurrentState.active = true;
  if (command?.targetState) command.targetState.active = false;
  const passed = JSON.stringify({ sourceItem, sourceContext }) === before && sourceItem.expectedCurrentState?.active === false && sourceItem.targetState?.active === true;
  return scenario("server composition preserves source context item and state immutability", passed, "sources checked");
}

async function tokenRedactionScenario() {
  const harness = fakeDependencies();
  const clinicResult = await execute(harness, clinicItem());
  const providerResult = await execute(harness, providerItem());
  const forwarded = harness.clinic.calls[0]?.ownershipToken === TOKEN && harness.provider.calls[0]?.ownershipToken === TOKEN;
  return scenario("ownership token is internal-only for both runners", forwarded && !JSON.stringify([clinicResult, providerResult]).includes(TOKEN), "forwarding and serialization checked");
}

async function thrownTokenRedactionScenario() {
  const harness = fakeDependencies();
  harness.clinic.throwMessage = `runner rejected ${TOKEN}`;
  const result = await execute(harness, clinicItem());
  return scenario("thrown runner token is redacted without retry", result.status === "error" && harness.clinic.calls.length === 1 && !JSON.stringify(result).includes(TOKEN) && JSON.stringify(result).includes("[redacted]"), result.status);
}

async function unsupportedScenarios() {
  const pairs = [["sterilizer_shell", "activate"], ["workstation_shell", "activate"], ["hardware_shell", "activate"], ["hardware_binding", "bind"], ["hardware_assignment", "finalize"], ["deployment_run", "finalize"]] as const;
  return Promise.all(pairs.map(async ([entityType, action]) => {
    const harness = fakeDependencies();
    const result = await execute(harness, item({ entityType, action }));
    const passed = !result.ok && result.status === "unsupported" && result.issues.some((issue) => issue.code === "unsupported_execution_handler") && harness.clinic.calls.length === 0 && harness.provider.calls.length === 0 && Object.values(result.downstream).every((value) => value === 0);
    return scenario(`${entityType}:${action} remains unsupported`, passed, result.status);
  }));
}

async function lifecycleScenarios() {
  const cases: Array<[string, Partial<DeploymentActivationExecutorItem>]> = [
    ["non-running", { executionStatus: "ready" }],
    ["invalid attempt count", { attemptCount: 2 }],
    ["missing startedAt", { startedAt: null }],
    ["completed", { completedAt: "2026-01-01T12:07:00.000Z" }],
    ["rolled back", { rolledBackAt: "2026-01-01T12:07:00.000Z" }],
    ["error evidence", { errorCode: "failed", errorMessage: "failed safely" }],
  ];
  return Promise.all(cases.map(async ([name, override]) => {
    const harness = fakeDependencies();
    const result = await execute(harness, clinicItem(override));
    return scenario(`${name} item is blocked before handler invocation`, !result.ok && harness.clinic.calls.length === 0 && harness.provider.calls.length === 0, result.status);
  }));
}

async function exactlyOneHandlerScenario() {
  const harness = fakeDependencies();
  await execute(harness, providerItem());
  return scenario("one selected handler executes exactly once with no second handler", harness.provider.calls.length === 1 && harness.clinic.calls.length === 0, `${harness.clinic.calls.length}:${harness.provider.calls.length}`);
}

async function zeroDownstreamScenario() {
  const result = await execute(fakeDependencies(), clinicItem());
  return scenario("generic downstream orchestration counters remain zero", Object.values(result.downstream).every((value) => value === 0), JSON.stringify(result.downstream));
}

function noOrchestrationSurfaceScenario() {
  const executor = createServerDeploymentActivationExecutor(fakeDependencies());
  const prototype = Object.getPrototypeOf(executor) as Record<string, unknown>;
  const forbidden = ["complete", "progress", "start", "finalize", "rollback", "retry", "execute"];
  return scenario("composition exposes dispatch only and no orchestration surface", forbidden.every((name) => !(name in prototype)), forbidden.filter((name) => name in prototype).join(",") || "none");
}

function compositionSourceAuditScenarios(): DeploymentActivationExecutorServerHarnessScenario[] {
  const source = [
    String(createServerDeploymentActivationExecutor),
    String(executeActivationItemForServerDeployment),
  ].join("\n");
  const checks: Array<[string, readonly string[]]> = [
    ["no direct Supabase construction", ["createClient", "SupabaseClient", "new Supabase"]],
    ["no direct RPC call", [".rpc(", "rpc("]],
    ["no setup or UI import", ["app/setup", "app\\setup", "page.tsx"]],
    ["no DeploymentEngine execution", ["DeploymentEngine.execute"]],
    ["no loop or recursion", ["for (", "while (", "return executeActivationItemForServerDeployment("]],
    ["no worker queue polling or streaming behavior", ["worker", "queue", "poll", "stream", "setInterval"]],
    ["no completion progression start session or finalization dependency", ["completeItem", "itemCompletion", "progressDependency", "dependencyProgression", "nextItemStart", "completeSession", "finalizeDeployment"]],
  ];
  return checks.map(([name, forbidden]) => scenario(
    name,
    forbidden.every((term) => !source.includes(term)),
    forbidden.filter((term) => source.includes(term)).join(",") || "none",
  ));
}
async function execute(harness: Harness, executionItem: DeploymentActivationExecutorItem, executionContext = context()): Promise<DeploymentActivationExecutorResult> {
  return executeActivationItemForServerDeployment(harness, { item: executionItem, context: executionContext });
}

interface Harness { clinic: FakeClinicRunner; provider: FakeProviderRunner; clinicActivation: FakeClinicRunner; providerShellActivation: FakeProviderRunner }
function fakeDependencies(): Harness {
  const clinic = new FakeClinicRunner();
  const provider = new FakeProviderRunner();
  return { clinic, provider, clinicActivation: clinic, providerShellActivation: provider };
}

class FakeClinicRunner {
  calls: DeploymentActivationExecutorClinicActivationCommand[] = [];
  throwMessage: string | null = null;
  async activateClinic(command: DeploymentActivationExecutorClinicActivationCommand): Promise<DeploymentActivationExecutorClinicActivationResult> {
    this.calls.push(clone(command));
    if (this.throwMessage) throw new Error(this.throwMessage);
    return { ok: true, status: "activated", message: "clinic activated", clinicId: command.clinicId, currentClinicState: { deploymentStatus: "draft" }, targetClinicState: { deploymentStatus: "deployed" }, deployedAt: command.activationRequestedAt, activationResult: "activated", issues: [] };
  }
}

class FakeProviderRunner {
  calls: DeploymentActivationExecutorProviderShellActivationCommand[] = [];
  async activateProviderShell(command: DeploymentActivationExecutorProviderShellActivationCommand): Promise<DeploymentActivationExecutorProviderShellActivationResult> {
    this.calls.push(clone(command));
    return { ok: true, status: "activated", message: "provider activated", providerId: command.providerId, deploymentProviderKey: command.deploymentProviderKey, provisioningSourceBefore: "setup_draft", provisioningSourceAfter: "setup_draft", provisioningStatusBefore: "planned", provisioningStatusAfter: "active", activeBefore: false, activeAfter: true, activatedAt: command.providerActivatedAt, activationResult: "activated", issues: [] };
  }
}

function clinicItem(input: Partial<DeploymentActivationExecutorItem> = {}) { return item(input); }
function providerItem(input: Partial<DeploymentActivationExecutorItem> = {}) {
  return item({ itemId: "item-server-composition-002", executionItemKey: "execution-server-composition-001:provider", planItemKey: "plan-server-composition-001:provider", sequence: 2, entityType: "provider_shell", entityId: PROVIDER_ID, deploymentKey: PROVIDER_KEY, expectedCurrentState: { provisioningSource: "setup_draft", provisioningStatus: "planned", active: false }, targetState: { provisioningSource: "setup_draft", provisioningStatus: "active", active: true }, dependencyKeys: ["plan-server-composition-001:clinic"], ...input });
}
function item(input: Partial<DeploymentActivationExecutorItem> = {}): DeploymentActivationExecutorItem {
  return { clinicId: CLINIC_ID, deploymentRunKey: "deployment-run-server-composition-001", sessionId: "session-server-composition-001", executionKey: "execution-server-composition-001", planKey: "plan-server-composition-001", itemId: "item-server-composition-001", executionItemKey: "execution-server-composition-001:clinic", planItemKey: "plan-server-composition-001:clinic", sequence: 1, entityType: "clinic", entityId: CLINIC_ID, deploymentKey: CLINIC_ID, action: "activate", executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:05:00.000Z", completedAt: null, rolledBackAt: null, errorCode: null, errorMessage: null, expectedCurrentState: { deploymentStatus: "draft" }, targetState: { deploymentStatus: "deployed" }, dependencyKeys: [], reversible: false, rollbackBehavior: null, ...input };
}
function context(): DeploymentActivationExecutorContext { return { claimantId: "server-composition-executor", ownershipToken: TOKEN, leaseExpiresAt: "2026-01-01T12:15:00.000Z", executedAt: "2026-01-01T12:06:00.000Z" }; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function scenario(name: string, passed: boolean, message: string): DeploymentActivationExecutorServerHarnessScenario { return { name, passed, message }; }