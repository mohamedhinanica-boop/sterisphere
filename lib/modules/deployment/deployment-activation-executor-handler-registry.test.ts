import {
  createDeploymentActivationExecutorHandlerRegistry,
} from "./deployment-activation-executor-handler-registry";
import {
  DeploymentActivationExecutorRegistry,
  DeploymentActivationExecutorRegistryError,
} from "./deployment-activation-executor-registry";
import {
  createDeploymentActivationExecutorService,
} from "./deployment-activation-executor-service";
import type {
  DeploymentActivationExecutorContext,
  DeploymentActivationExecutorItem,
  DeploymentActivationExecutorResult,
} from "./deployment-activation-executor-types";
import {
  DeploymentActivationExecutorClinicHandler,
  type DeploymentActivationExecutorClinicActivationCommand,
  type DeploymentActivationExecutorClinicActivationResult,
} from "./deployment-activation-executor-clinic-handler";
import {
  DeploymentActivationExecutorProviderShellHandler,
  type DeploymentActivationExecutorProviderShellActivationCommand,
  type DeploymentActivationExecutorProviderShellActivationResult,
} from "./deployment-activation-executor-provider-shell-handler";

export interface DeploymentActivationExecutorHandlerRegistryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutorHandlerRegistryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutorHandlerRegistryHarnessScenario[];
}

const TOKEN = "sensitive-handler-adapter-token";
const PROVIDER_ID = "f74f1056-0e59-474c-9676-0230d4936114";
const PROVIDER_KEY = "dentist-001";

export async function runDeploymentActivationExecutorHandlerRegistryHarness(): Promise<DeploymentActivationExecutorHandlerRegistryHarnessResult> {
  const scenarios = [
    await scenarioClinicDispatchResolvesAdapter(),
    await scenarioProviderDispatchResolvesAdapter(),
    await scenarioClinicStatus("activated", "handled"),
    await scenarioClinicStatus("already_activated", "already_applied"),
    await scenarioClinicStatus("blocked", "blocked"),
    await scenarioClinicStatus("conflict", "conflict"),
    await scenarioClinicStatus("not_found", "not_found"),
    await scenarioClinicStatus("error", "error"),
    await scenarioProviderStatus("activated", "handled"),
    await scenarioProviderStatus("already_activated", "already_applied"),
    await scenarioProviderStatus("blocked", "blocked"),
    await scenarioProviderStatus("conflict", "conflict"),
    await scenarioProviderStatus("not_found", "not_found"),
    await scenarioProviderStatus("error", "error"),
    await scenarioProviderUuidForwardedAsEntityIdentity(),
    await scenarioProviderDeploymentKeyForwardedSeparately(),
    await scenarioProviderUuidAndKeyNeverConflated(),
    await scenarioExpectedCurrentStateForwardedImmutably(),
    await scenarioTargetStateForwardedImmutably(),
    await scenarioClaimantSessionExecutionIdentityMapping(),
    await scenarioOwnershipTokenForwardedInternally(),
    await scenarioOwnershipTokenAbsentFromSerializedResult(),
    await scenarioSafeDiagnosticsPreserved(),
    await scenarioHandlerInvokedExactlyOnce(),
    await scenarioNoRetryAfterHandlerFailure(),
    await scenarioUnsupportedSterilizerRemainsUnsupported(),
    scenarioSterilizerRegistrationResolves(),
    await scenarioUnsupportedHardwareBindingRemainsUnsupported(),
    await scenarioDuplicateRegistrationRejected(),
    await scenarioExplicitRegistryOrderDoesNotAffectDispatch(),
    await scenarioSourceContextItemImmutability(),
    await scenarioNoCompletionServiceDependency(),
    await scenarioNoProgressionServiceDependency(),
    await scenarioNoNextItemStartDependency(),
    await scenarioZeroGenericDownstreamCounters(),
    await scenarioNoSetupOrDeploymentEngineReferences(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioClinicDispatchResolvesAdapter() {
  const harness = harnessFor(clinicResult("activated"));
  const result = await dispatch(harness, clinicItem());
  return expectScenario("clinic activate dispatch resolves clinic adapter", result.handlerId === "deployment-activation-executor-clinic-activate" && harness.clinic.calls.length === 1, JSON.stringify(redact(result)));
}

async function scenarioProviderDispatchResolvesAdapter() {
  const harness = harnessFor(clinicResult("activated"), providerResult("activated"));
  const result = await dispatch(harness, providerItem());
  return expectScenario("provider_shell activate dispatch resolves provider adapter", result.handlerId === "deployment-activation-executor-provider-shell-activate" && harness.provider.calls.length === 1, JSON.stringify(redact(result)));
}

async function scenarioClinicStatus(sourceStatus: DeploymentActivationExecutorClinicActivationResult["status"], expectedStatus: string) {
  const result = await dispatch(harnessFor(clinicResult(sourceStatus)), clinicItem());
  return expectScenario(`clinic ${sourceStatus} maps to ${expectedStatus}`, result.status === expectedStatus, JSON.stringify(redact(result)));
}

async function scenarioProviderStatus(sourceStatus: DeploymentActivationExecutorProviderShellActivationResult["status"], expectedStatus: string) {
  const result = await dispatch(harnessFor(clinicResult("activated"), providerResult(sourceStatus)), providerItem());
  return expectScenario(`provider ${sourceStatus} maps to ${expectedStatus}`, result.status === expectedStatus, JSON.stringify(redact(result)));
}

async function scenarioProviderUuidForwardedAsEntityIdentity() {
  const harness = harnessFor(clinicResult("activated"), providerResult("activated"));
  await dispatch(harness, providerItem());
  const command = harness.provider.calls[0];
  return expectScenario("provider UUID forwarded as entity identity", command?.providerId === PROVIDER_ID && command.deploymentActivationExecutionNextItemStart.entityId === PROVIDER_ID, JSON.stringify(command));
}

async function scenarioProviderDeploymentKeyForwardedSeparately() {
  const harness = harnessFor(clinicResult("activated"), providerResult("activated"));
  await dispatch(harness, providerItem());
  const command = harness.provider.calls[0];
  return expectScenario("provider deployment key forwarded separately", command?.deploymentProviderKey === PROVIDER_KEY, JSON.stringify(command));
}

async function scenarioProviderUuidAndKeyNeverConflated() {
  const harness = harnessFor(clinicResult("activated"), providerResult("activated"));
  const result = await dispatch(harness, providerItem());
  const evidence = result.handlerEvidence ?? {};
  return expectScenario("UUID and provider key are never conflated", evidence.providerId === PROVIDER_ID && evidence.deploymentProviderKey === PROVIDER_KEY && evidence.providerId !== evidence.deploymentProviderKey, JSON.stringify(evidence));
}

async function scenarioExpectedCurrentStateForwardedImmutably() {
  const source = providerItem();
  const harness = harnessFor(clinicResult("activated"), providerResult("activated"));
  await dispatch(harness, source);
  const command = harness.provider.calls[0];
  if (command?.expectedCurrentState) {
    command.expectedCurrentState.active = true;
  }
  return expectScenario("expected current state forwarded immutably", source.expectedCurrentState?.active === false, JSON.stringify(source.expectedCurrentState));
}

async function scenarioTargetStateForwardedImmutably() {
  const source = providerItem();
  const harness = harnessFor(clinicResult("activated"), providerResult("activated"));
  await dispatch(harness, source);
  const command = harness.provider.calls[0];
  if (command?.targetState) {
    command.targetState.active = false;
  }
  return expectScenario("target state forwarded immutably", source.targetState?.active === true, JSON.stringify(source.targetState));
}

async function scenarioClaimantSessionExecutionIdentityMapping() {
  const harness = harnessFor(clinicResult("activated"));
  await dispatch(harness, clinicItem());
  const command = harness.clinic.calls[0];
  return expectScenario("claimant/session/execution identity mapping", command?.deploymentActivationExecutionClaim.claimantId === context().claimantId && command.deploymentActivationExecutionClaim.sessionId === clinicItem().sessionId && command.deploymentActivationExecutionClaim.executionKey === clinicItem().executionKey, JSON.stringify(redact(command)));
}

async function scenarioOwnershipTokenForwardedInternally() {
  const harness = harnessFor(clinicResult("activated"));
  await dispatch(harness, clinicItem());
  return expectScenario("ownership token forwarded internally", harness.clinic.calls[0]?.ownershipToken === TOKEN, "token forwarded to fake runner");
}

async function scenarioOwnershipTokenAbsentFromSerializedResult() {
  const result = await dispatch(harnessFor(clinicResult("blocked", `blocked ${TOKEN}`)), clinicItem());
  return expectScenario("ownership token absent from serialized result", !JSON.stringify(result).includes(TOKEN) && JSON.stringify(result).includes("[redacted]"), JSON.stringify(redact(result)));
}

async function scenarioSafeDiagnosticsPreserved() {
  const result = await dispatch(harnessFor(clinicResult("error", "repository failed", { layer: "atomic_rpc", errorCode: "23514" })), clinicItem());
  return expectScenario("safe diagnostics preserved", result.issues[0]?.diagnostics?.errorCode === "23514" && result.issues[0]?.diagnostics?.layer === "atomic_rpc", JSON.stringify(result.issues));
}

async function scenarioHandlerInvokedExactlyOnce() {
  const harness = harnessFor(clinicResult("activated"));
  await dispatch(harness, clinicItem());
  return expectScenario("handler invoked exactly once", harness.clinic.calls.length === 1, String(harness.clinic.calls.length));
}

async function scenarioNoRetryAfterHandlerFailure() {
  const harness = harnessFor(clinicResult("error", `thrown ${TOKEN}`));
  harness.clinic.shouldThrow = true;
  const result = await dispatch(harness, clinicItem());
  return expectScenario("no retry after handler failure", result.status === "error" && harness.clinic.calls.length === 1 && !JSON.stringify(result).includes(TOKEN), JSON.stringify(redact(result)));
}

function scenarioSterilizerRegistrationResolves() {
  const harness = harnessFor(clinicResult("activated"), providerResult("activated"));
  const registry = createDeploymentActivationExecutorHandlerRegistry({
    clinicActivation: harness.clinic,
    providerShellActivation: harness.provider,
    sterilizerShellActivation: {
      async activateSterilizerShell() { throw new Error("registration-only fake must not execute"); },
      async completeSterilizerShellExecutionItem() { throw new Error("registration-only fake must not execute"); },
    },
  });
  return expectScenario("production registry resolves sterilizer_shell:activate when composed", registry.has("sterilizer_shell", "activate"), registry.registrationKeys.join(","));
}
async function scenarioUnsupportedSterilizerRemainsUnsupported() {
  const result = await dispatch(harnessFor(clinicResult("activated")), clinicItem({ entityType: "sterilizer_shell", entityId: "sterilizer-001" }));
  return expectScenario("unsupported sterilizer remains unsupported", result.status === "unsupported", JSON.stringify(result));
}

async function scenarioUnsupportedHardwareBindingRemainsUnsupported() {
  const result = await dispatch(harnessFor(clinicResult("activated")), clinicItem({ entityType: "hardware_binding", action: "bind", entityId: "binding-001" }));
  return expectScenario("unsupported hardware binding remains unsupported", result.status === "unsupported", JSON.stringify(result));
}

async function scenarioDuplicateRegistrationRejected() {
  try {
    new DeploymentActivationExecutorRegistry([
      new DeploymentActivationExecutorClinicHandler(new FakeClinicRunner(clinicResult("activated"))),
      new DeploymentActivationExecutorClinicHandler(new FakeClinicRunner(clinicResult("activated"))),
    ]);
    return expectScenario("duplicate registration remains rejected", false, "duplicate accepted");
  } catch (caught) {
    return expectScenario("duplicate registration remains rejected", caught instanceof DeploymentActivationExecutorRegistryError, caught instanceof Error ? caught.message : "unknown");
  }
}

async function scenarioExplicitRegistryOrderDoesNotAffectDispatch() {
  const first = await dispatchWithRegistry(new DeploymentActivationExecutorRegistry([
    new DeploymentActivationExecutorProviderShellHandler(new FakeProviderRunner(providerResult("activated"))),
    new DeploymentActivationExecutorClinicHandler(new FakeClinicRunner(clinicResult("activated"))),
  ]), clinicItem());
  const second = await dispatchWithRegistry(new DeploymentActivationExecutorRegistry([
    new DeploymentActivationExecutorClinicHandler(new FakeClinicRunner(clinicResult("activated"))),
    new DeploymentActivationExecutorProviderShellHandler(new FakeProviderRunner(providerResult("activated"))),
  ]), clinicItem());
  return expectScenario("explicit registry order does not affect dispatch", first.handlerId === second.handlerId && first.dispatchKey === second.dispatchKey, `${first.handlerId}:${second.handlerId}`);
}

async function scenarioSourceContextItemImmutability() {
  const sourceItem = providerItem();
  const sourceContext = context();
  const before = `${JSON.stringify(sourceItem)}|${JSON.stringify(sourceContext)}`;
  await dispatch(harnessFor(clinicResult("activated"), providerResult("activated")), sourceItem, sourceContext);
  return expectScenario("source context/item immutability", `${JSON.stringify(sourceItem)}|${JSON.stringify(sourceContext)}` === before, "sources unchanged");
}

async function scenarioNoCompletionServiceDependency() {
  return expectScenario("no completion service dependency", noForbiddenMethod(new DeploymentActivationExecutorClinicHandler(new FakeClinicRunner(clinicResult("activated"))), ["complete", "completeItem", "itemCompletion"]), "checked handler prototype");
}

async function scenarioNoProgressionServiceDependency() {
  return expectScenario("no progression service dependency", noForbiddenMethod(new DeploymentActivationExecutorProviderShellHandler(new FakeProviderRunner(providerResult("activated"))), ["progress", "dependency", "dependencyProgression"]), "checked handler prototype");
}

async function scenarioNoNextItemStartDependency() {
  return expectScenario("no next-item-start dependency", noForbiddenMethod(new DeploymentActivationExecutorProviderShellHandler(new FakeProviderRunner(providerResult("activated"))), ["startNext", "nextItemStart", "startItem"]), "checked handler prototype");
}

async function scenarioZeroGenericDownstreamCounters() {
  const result = await dispatch(harnessFor(clinicResult("activated")), clinicItem());
  return expectScenario("zero generic downstream counters", Object.values(result.downstream).every((value) => value === 0), JSON.stringify(result.downstream));
}

async function scenarioNoSetupOrDeploymentEngineReferences() {
  const text = [
    String(DeploymentActivationExecutorClinicHandler),
    String(DeploymentActivationExecutorProviderShellHandler),
    String(createDeploymentActivationExecutorHandlerRegistry),
  ].join("\n");
  return expectScenario("no app/setup imports or DeploymentEngine.execute reference", !text.includes("app/setup") && !text.includes("DeploymentEngine.execute"), "source text checked");
}

async function dispatch(
  harness: Harness,
  item: DeploymentActivationExecutorItem,
  executionContext: DeploymentActivationExecutorContext = context(),
): Promise<DeploymentActivationExecutorResult> {
  return dispatchWithRegistry(
    createDeploymentActivationExecutorHandlerRegistry({
      clinicActivation: harness.clinic,
      providerShellActivation: harness.provider,
    }),
    item,
    executionContext,
  );
}

async function dispatchWithRegistry(
  registry: DeploymentActivationExecutorRegistry,
  item: DeploymentActivationExecutorItem,
  executionContext: DeploymentActivationExecutorContext = context(),
): Promise<DeploymentActivationExecutorResult> {
  return createDeploymentActivationExecutorService(registry).dispatch({
    item,
    context: executionContext,
  });
}

interface Harness {
  clinic: FakeClinicRunner;
  provider: FakeProviderRunner;
}

function harnessFor(
  clinicActivationResult: DeploymentActivationExecutorClinicActivationResult,
  providerActivationResult: DeploymentActivationExecutorProviderShellActivationResult = providerResult("activated"),
): Harness {
  return {
    clinic: new FakeClinicRunner(clinicActivationResult),
    provider: new FakeProviderRunner(providerActivationResult),
  };
}

class FakeClinicRunner {
  calls: DeploymentActivationExecutorClinicActivationCommand[] = [];
  shouldThrow = false;

  constructor(private readonly result: DeploymentActivationExecutorClinicActivationResult) {}

  async activateClinic(command: DeploymentActivationExecutorClinicActivationCommand): Promise<DeploymentActivationExecutorClinicActivationResult> {
    this.calls.push(clone(command));
    if (this.shouldThrow) {
      throw new Error(this.result.message);
    }
    return clone(this.result);
  }
}

class FakeProviderRunner {
  calls: DeploymentActivationExecutorProviderShellActivationCommand[] = [];

  constructor(private readonly result: DeploymentActivationExecutorProviderShellActivationResult) {}

  async activateProviderShell(command: DeploymentActivationExecutorProviderShellActivationCommand): Promise<DeploymentActivationExecutorProviderShellActivationResult> {
    this.calls.push(clone(command));
    return clone(this.result);
  }
}

function clinicResult(
  status: DeploymentActivationExecutorClinicActivationResult["status"],
  message = `Clinic activation returned ${status}.`,
  diagnostics: Record<string, unknown> | null = null,
): DeploymentActivationExecutorClinicActivationResult {
  return {
    ok: status === "activated" || status === "already_activated",
    status,
    message,
    clinicId: "clinic-handler-001",
    currentClinicState: { deploymentStatus: status === "already_activated" ? "deployed" : "draft" },
    targetClinicState: { deploymentStatus: "deployed" },
    deployedAt: status === "activated" || status === "already_activated" ? "2026-01-01T12:06:00.000Z" : null,
    activationResult: status,
    issues: status === "activated" || status === "already_activated" ? [] : [adapterIssue(status, message, diagnostics)],
  };
}

function providerResult(
  status: DeploymentActivationExecutorProviderShellActivationResult["status"],
  message = `Provider activation returned ${status}.`,
): DeploymentActivationExecutorProviderShellActivationResult {
  return {
    ok: status === "activated" || status === "already_activated",
    status,
    message,
    providerId: PROVIDER_ID,
    deploymentProviderKey: PROVIDER_KEY,
    provisioningSourceBefore: "setup_draft",
    provisioningSourceAfter: "setup_draft",
    provisioningStatusBefore: status === "already_activated" ? "active" : "planned",
    provisioningStatusAfter: status === "activated" || status === "already_activated" ? "active" : "planned",
    activeBefore: status === "already_activated" ? true : false,
    activeAfter: status === "activated" || status === "already_activated" ? true : false,
    activatedAt: status === "activated" || status === "already_activated" ? "2026-01-01T12:06:00.000Z" : null,
    activationResult: status,
    issues: status === "activated" || status === "already_activated" ? [] : [adapterIssue(status, message)],
  };
}

function adapterIssue(
  status: string,
  message: string,
  diagnostics: Record<string, unknown> | null = null,
) {
  return {
    code: status === "not_found" ? "missing_entity" : status === "conflict" ? "identity_mismatch" : status === "error" ? "repository_error" : "blocked",
    severity: "blocker" as const,
    message,
    diagnostics,
  };
}

function clinicItem(input: Partial<DeploymentActivationExecutorItem> = {}): DeploymentActivationExecutorItem {
  return {
    clinicId: "clinic-handler-001",
    deploymentRunKey: "deployment-run-handler-001",
    sessionId: "session-handler-001",
    executionKey: "execution-handler-001",
    planKey: "plan-handler-001",
    itemId: "item-handler-001",
    executionItemKey: "execution-handler-001:clinic",
    planItemKey: "plan-handler-001:clinic",
    sequence: 1,
    entityType: "clinic",
    entityId: "clinic-handler-001",
    deploymentKey: "clinic-handler-001",
    action: "activate",
    executionStatus: "running",
    attemptCount: 1,
    startedAt: "2026-01-01T12:05:00.000Z",
    completedAt: null,
    rolledBackAt: null,
    errorCode: null,
    errorMessage: null,
    expectedCurrentState: { deploymentStatus: "draft" },
    targetState: { deploymentStatus: "deployed" },
    dependencyKeys: [],
    reversible: false,
    rollbackBehavior: null,
    ...input,
  };
}

function providerItem(input: Partial<DeploymentActivationExecutorItem> = {}): DeploymentActivationExecutorItem {
  return clinicItem({
    itemId: "item-handler-002",
    executionItemKey: "execution-handler-001:provider-001",
    planItemKey: "plan-handler-001:provider-001",
    sequence: 2,
    entityType: "provider_shell",
    entityId: PROVIDER_ID,
    deploymentKey: PROVIDER_KEY,
    action: "activate",
    expectedCurrentState: { provisioningSource: "setup_draft", provisioningStatus: "planned", active: false },
    targetState: { provisioningSource: "setup_draft", provisioningStatus: "active", active: true },
    dependencyKeys: ["plan-handler-001:clinic"],
    ...input,
  });
}

function context(input: Partial<DeploymentActivationExecutorContext> = {}): DeploymentActivationExecutorContext {
  return {
    claimantId: "executor-handler-001",
    ownershipToken: TOKEN,
    leaseExpiresAt: "2026-01-01T12:15:00.000Z",
    executedAt: "2026-01-01T12:06:00.000Z",
    ...input,
  };
}

function noForbiddenMethod(instance: object, forbidden: readonly string[]): boolean {
  const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
  return forbidden.every((method) => !(method in prototype));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => key.toLowerCase().includes("token") ? "[redacted]" : entry));
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutorHandlerRegistryHarnessScenario {
  return { name, passed, message };
}
