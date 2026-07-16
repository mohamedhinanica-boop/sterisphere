import {
  createDeploymentActivationExecutorRegistry,
  DeploymentActivationExecutorRegistry,
  DeploymentActivationExecutorRegistryError,
} from "./deployment-activation-executor-registry";
import {
  createDeploymentActivationExecutorService,
} from "./deployment-activation-executor-service";
import {
  createActivationExecutorDispatchKey,
  type DeploymentActivationExecutorContext,
  type DeploymentActivationExecutorItem,
  type DeploymentActivationExecutorResult,
  type DeploymentActivationExecutorStatus,
} from "./deployment-activation-executor-types";
import {
  handlerResult,
  TestActivationExecutorHandler,
  TestClinicActivationHandler,
  TestProviderShellActivationHandler,
} from "./deployment-activation-executor-test-handler";

export interface DeploymentActivationExecutorHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutorHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutorHarnessScenario[];
}

const TOKEN = "sensitive-generic-executor-token";
const EXECUTED_AT = "2026-01-01T12:06:00.000Z";

export async function runDeploymentActivationExecutorServiceHarness(): Promise<DeploymentActivationExecutorHarnessResult> {
  const scenarios = [
    await scenarioClinicActivateResolvesClinicHandler(),
    await scenarioProviderActivateResolvesProviderHandler(),
    await scenarioUnsupportedSterilizerHandler(),
    await scenarioUnsupportedAction(),
    await scenarioDuplicateHandlerRegistration(),
    await scenarioDeterministicDispatchKey(),
    await scenarioRunningItemAccepted(),
    await scenarioNonRunningItemBlocked(),
    await scenarioAttemptCountZeroBlocked(),
    await scenarioAttemptCountGreaterThanOneBlocked(),
    await scenarioMissingStartedAtBlocked(),
    await scenarioCompletedItemBlocked(),
    await scenarioRolledBackItemBlocked(),
    await scenarioErrorEvidenceBlocked(),
    await scenarioHandlerStatus("handled"),
    await scenarioHandlerStatus("already_applied"),
    await scenarioHandlerStatus("blocked"),
    await scenarioHandlerStatus("conflict"),
    await scenarioHandlerStatus("not_found"),
    await scenarioHandlerStatus("error"),
    await scenarioHandlerInvokedExactlyOnce(),
    await scenarioNoSecondHandlerInvoked(),
    await scenarioNoRetryAfterHandlerError(),
    await scenarioDeterministicIssueOrdering(),
    await scenarioSourceItemImmutability(),
    await scenarioSourceContextImmutability(),
    await scenarioOwnershipTokenRedaction(),
    await scenarioZeroDownstreamCounters(),
    await scenarioRegistryExposesNoMutationMethods(),
    await scenarioHandlerContractExposesNoExecutionMethods(),
    await scenarioServicePerformsNoPersistenceCalls(),
    await scenarioRegistrationOrderDoesNotChangeDispatchResult(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioClinicActivateResolvesClinicHandler() {
  const clinic = new TestClinicActivationHandler();
  const result = await dispatch([clinic], { item: item({ entityType: "clinic", action: "activate" }) });
  return expectScenario(
    "clinic activate resolves clinic test handler",
    result.status === "handled" && result.handlerId === clinic.handlerId && clinic.calls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioProviderActivateResolvesProviderHandler() {
  const provider = new TestProviderShellActivationHandler();
  const result = await dispatch([provider], { item: item({ entityType: "provider_shell", action: "activate", deploymentKey: "dentist-001" }) });
  return expectScenario(
    "provider_shell activate resolves provider test handler",
    result.status === "handled" && result.handlerId === provider.handlerId && provider.calls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioUnsupportedSterilizerHandler() {
  const result = await dispatch([new TestClinicActivationHandler()], { item: item({ entityType: "sterilizer_shell", entityId: "sterilizer-001" }) });
  return expectScenario("unsupported sterilizer handler", result.status === "unsupported" && result.unsupportedCount === 1 && result.issues[0]?.code === "unsupported_execution_handler", JSON.stringify(result));
}

async function scenarioUnsupportedAction() {
  const result = await dispatch([new TestClinicActivationHandler()], { item: item({ action: "archive" }) });
  return expectScenario("unsupported action", result.status === "unsupported" && result.dispatchKey === "clinic:archive", JSON.stringify(result));
}

async function scenarioDuplicateHandlerRegistration() {
  try {
    createDeploymentActivationExecutorRegistry([
      new TestClinicActivationHandler(),
      new TestActivationExecutorHandler("duplicate-clinic", "clinic", "activate"),
    ]);
    return expectScenario("duplicate handler registration", false, "duplicate was accepted");
  } catch (caught) {
    return expectScenario(
      "duplicate handler registration",
      caught instanceof DeploymentActivationExecutorRegistryError && caught.issue.code === "duplicate_execution_handler",
      caught instanceof Error ? caught.message : "unknown",
    );
  }
}

async function scenarioDeterministicDispatchKey() {
  const key = createActivationExecutorDispatchKey(" Provider Shell ", "Activate");
  return expectScenario("deterministic dispatch key", key.key === "provider_shell:activate", JSON.stringify(key));
}

async function scenarioRunningItemAccepted() {
  const result = await dispatch([new TestClinicActivationHandler()]);
  return expectScenario("running item accepted", result.ok && result.status === "handled", JSON.stringify(result));
}

async function scenarioNonRunningItemBlocked() {
  const result = await dispatch([new TestClinicActivationHandler()], { item: item({ executionStatus: "ready" }) });
  return expectScenario("non-running item blocked", result.status === "conflict" && hasIssue(result, "item_not_running"), JSON.stringify(result));
}

async function scenarioAttemptCountZeroBlocked() {
  const result = await dispatch([new TestClinicActivationHandler()], { item: item({ attemptCount: 0 }) });
  return expectScenario("attempt count 0 blocked", result.status === "blocked" && hasIssue(result, "attempt_count_invalid"), JSON.stringify(result));
}

async function scenarioAttemptCountGreaterThanOneBlocked() {
  const result = await dispatch([new TestClinicActivationHandler()], { item: item({ attemptCount: 2 }) });
  return expectScenario("attempt count greater than 1 blocked", result.status === "blocked" && hasIssue(result, "attempt_count_invalid"), JSON.stringify(result));
}

async function scenarioMissingStartedAtBlocked() {
  const result = await dispatch([new TestClinicActivationHandler()], { item: item({ startedAt: null }) });
  return expectScenario("missing startedAt blocked", result.status === "blocked" && hasIssue(result, "started_at_missing"), JSON.stringify(result));
}

async function scenarioCompletedItemBlocked() {
  const result = await dispatch([new TestClinicActivationHandler()], { item: item({ completedAt: "2026-01-01T12:07:00.000Z" }) });
  return expectScenario("completed item blocked", result.status === "blocked" && hasIssue(result, "completion_evidence_present"), JSON.stringify(result));
}

async function scenarioRolledBackItemBlocked() {
  const result = await dispatch([new TestClinicActivationHandler()], { item: item({ rolledBackAt: "2026-01-01T12:07:00.000Z" }) });
  return expectScenario("rolled-back item blocked", result.status === "blocked" && hasIssue(result, "rollback_evidence_present"), JSON.stringify(result));
}

async function scenarioErrorEvidenceBlocked() {
  const result = await dispatch([new TestClinicActivationHandler()], { item: item({ errorCode: "boom", errorMessage: "failed" }) });
  return expectScenario("error evidence blocked", result.status === "blocked" && hasIssue(result, "item_error_evidence_present"), JSON.stringify(result));
}

async function scenarioHandlerStatus(status: DeploymentActivationExecutorStatus) {
  const handler = new TestClinicActivationHandler(handlerResult(status));
  const result = await dispatch([handler]);
  return expectScenario(
    `handler returns ${status}`,
    result.status === status && result.handlerId === handler.handlerId && handler.calls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioHandlerInvokedExactlyOnce() {
  const handler = new TestClinicActivationHandler();
  await dispatch([handler]);
  return expectScenario("handler invoked exactly once", handler.calls.length === 1, String(handler.calls.length));
}

async function scenarioNoSecondHandlerInvoked() {
  const clinic = new TestClinicActivationHandler();
  const provider = new TestProviderShellActivationHandler();
  await dispatch([clinic, provider], { item: item({ entityType: "clinic" }) });
  return expectScenario("no second handler invoked", clinic.calls.length === 1 && provider.calls.length === 0, `${clinic.calls.length}:${provider.calls.length}`);
}

async function scenarioNoRetryAfterHandlerError() {
  const handler = new TestClinicActivationHandler(handlerResult("error", `handler threw ${TOKEN}`), true);
  const result = await dispatch([handler]);
  return expectScenario("no retry after handler error", result.status === "error" && handler.calls.length === 1, JSON.stringify(redact(result)));
}

async function scenarioDeterministicIssueOrdering() {
  const result = await dispatch([new TestClinicActivationHandler()], {
    item: item({ attemptCount: 0, startedAt: null, completedAt: "2026-01-01T12:07:00.000Z" }),
  });
  const codes = result.issues.map((issue) => issue.code).join(",");
  return expectScenario("deterministic issue ordering", codes === "attempt_count_invalid,completion_evidence_present,started_at_missing", codes);
}

async function scenarioSourceItemImmutability() {
  const source = item();
  const before = JSON.stringify(source);
  await dispatch([new TestClinicActivationHandler()], { item: source });
  return expectScenario("source item immutability", JSON.stringify(source) === before, "source unchanged");
}

async function scenarioSourceContextImmutability() {
  const source = context();
  const before = JSON.stringify(source);
  await dispatch([new TestClinicActivationHandler()], { context: source });
  return expectScenario("source context immutability", JSON.stringify(source) === before, "context unchanged");
}

async function scenarioOwnershipTokenRedaction() {
  const handler = new TestClinicActivationHandler(handlerResult("blocked", `blocked because ${TOKEN}`));
  const result = await dispatch([handler]);
  return expectScenario("ownership-token redaction", !JSON.stringify(result).includes(TOKEN) && JSON.stringify(result).includes("[redacted]"), JSON.stringify(redact(result)));
}

async function scenarioZeroDownstreamCounters() {
  const result = await dispatch([new TestClinicActivationHandler()]);
  return expectScenario("zero downstream counters", Object.values(result.downstream).every((value) => value === 0), JSON.stringify(result.downstream));
}

async function scenarioRegistryExposesNoMutationMethods() {
  const prototype = Object.getPrototypeOf(new DeploymentActivationExecutorRegistry()) as Record<string, unknown>;
  const forbidden = ["insert", "update", "upsert", "delete", "save", "mutate", "activate", "complete", "progress", "start", "rollback"];
  return expectScenario("registry exposes no generic mutation methods", forbidden.every((method) => !(method in prototype)), JSON.stringify(forbidden.filter((method) => method in prototype)));
}

async function scenarioHandlerContractExposesNoExecutionMethods() {
  const prototype = Object.getPrototypeOf(new TestClinicActivationHandler()) as Record<string, unknown>;
  const forbidden = ["completeItem", "progressDependency", "startNextItem", "retry", "persist", "update", "upsert", "delete"];
  return expectScenario("handler contract exposes no completion/progression/start methods", forbidden.every((method) => !(method in prototype)), JSON.stringify(forbidden.filter((method) => method in prototype)));
}

async function scenarioServicePerformsNoPersistenceCalls() {
  const prototype = Object.getPrototypeOf(createDeploymentActivationExecutorService(new DeploymentActivationExecutorRegistry())) as Record<string, unknown>;
  const forbidden = ["load", "insert", "update", "upsert", "delete", "rpc", "persist", "save"];
  return expectScenario("service performs no persistence calls", forbidden.every((method) => !(method in prototype)), JSON.stringify(forbidden.filter((method) => method in prototype)));
}

async function scenarioRegistrationOrderDoesNotChangeDispatchResult() {
  const first = await dispatch([new TestProviderShellActivationHandler(), new TestClinicActivationHandler()]);
  const second = await dispatch([new TestClinicActivationHandler(), new TestProviderShellActivationHandler()]);
  return expectScenario("explicit registration order does not change dispatch result", first.handlerId === second.handlerId && first.dispatchKey === second.dispatchKey, `${first.handlerId}:${second.handlerId}`);
}

async function dispatch(
  handlers: readonly TestActivationExecutorHandler[],
  input: {
    item?: DeploymentActivationExecutorItem;
    context?: DeploymentActivationExecutorContext;
  } = {},
): Promise<DeploymentActivationExecutorResult> {
  const registry = createDeploymentActivationExecutorRegistry(handlers);
  const service = createDeploymentActivationExecutorService(registry);
  return service.dispatch({
    item: input.item ?? item(),
    context: input.context ?? context(),
  });
}

function item(input: Partial<DeploymentActivationExecutorItem> = {}): DeploymentActivationExecutorItem {
  return {
    clinicId: "clinic-generic-executor-001",
    deploymentRunId: "deployment-run-generic-executor-001",
    sessionId: "activation-session-generic-executor-001",
    executionKey: "activation-execution-generic-executor-001",
    planKey: "activation-plan-generic-executor-001",
    itemId: "activation-item-generic-executor-001",
    executionItemKey: "activation-execution-generic-executor-001:clinic",
    planItemKey: "activation-plan-generic-executor-001:clinic",
    sequence: 1,
    entityType: "clinic",
    entityId: "clinic-generic-executor-001",
    deploymentKey: "clinic-generic-executor-001",
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

function context(input: Partial<DeploymentActivationExecutorContext> = {}): DeploymentActivationExecutorContext {
  return {
    claimantId: "executor-generic-001",
    ownershipToken: TOKEN,
    leaseExpiresAt: "2026-01-01T12:15:00.000Z",
    executedAt: EXECUTED_AT,
    ...input,
  };
}

function hasIssue(result: DeploymentActivationExecutorResult, code: string): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry) => key.toLowerCase().includes("token") ? "[redacted]" : entry));
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutorHarnessScenario {
  return { name, passed, message };
}
