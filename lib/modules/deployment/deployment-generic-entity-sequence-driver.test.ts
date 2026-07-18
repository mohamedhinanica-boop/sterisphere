import { executeGenericEntitySequence, type GenericEntitySequenceIdentity } from "./deployment-generic-entity-sequence-driver";

interface Evidence { final: string }
interface Running extends GenericEntitySequenceIdentity {}
type Step = { ok: boolean; downstream: { entitiesActivated: number; itemsCompleted: number; dependenciesProgressed: number; itemsStarted: number; bindingsWritten: 0; assignmentsFinalized: 0; sessionsCompleted: 0; deploymentsFinalized: 0; rollbacksExecuted: 0 } };
export interface GenericEntitySequenceDriverHarnessScenario { name: string; passed: boolean; message: string }
export interface GenericEntitySequenceDriverHarnessResult { passed: boolean; scenarios: readonly GenericEntitySequenceDriverHarnessScenario[] }

export async function runGenericEntitySequenceDriverHarness(): Promise<GenericEntitySequenceDriverHarnessResult> {
  const scenarios = [await successfulSequence(), ...(await validationFailures()), await duplicateFailure(), ...(await malformedAndBoundFailures()), sourceBoundary()];
  return { passed: scenarios.every((scenario) => scenario.passed), scenarios };
}

async function successfulSequence() {
  const calls: string[] = [];
  const result = await run({ calls });
  return scenario("generic driver executes each provider exactly once and stops at first non-provider", result.ok && calls.join(",") === "item-2,item-3" && result.itemsPlanned === 2 && result.itemsExecuted === 2 && result.nextRunningItem?.entityType === "sterilizer_shell" && result.lastEvidence?.final === "item-3" && result.lastStep?.downstream.entitiesActivated === 2 && result.lastStep.downstream.itemsCompleted === 2 && result.lastStep.downstream.dependenciesProgressed === 2 && result.lastStep.downstream.itemsStarted === 2, JSON.stringify({ calls, message: result.message }));
}

async function validationFailures() {
  const cases: Array<[string, Partial<Running>]> = [["identity mismatch", { entityId: "foreign-provider" }], ["clinic mismatch", { clinicId: "foreign-clinic" }], ["deployment-run mismatch", { deploymentRunKey: "foreign-run" }], ["session mismatch", { sessionId: "foreign-session" }], ["ownership mismatch", { claimantId: "foreign-claimant" }], ["lease mismatch", { leaseExpiresAt: "2026-01-01T12:14:00.000Z" }]];
  const results = [];
  for (const [name, patch] of cases) {
    const calls: string[] = [];
    const result = await run({ calls, first: running(2, "provider_shell", patch) });
    results.push(scenario(`${name} blocks before execution`, !result.ok && calls.length === 0, result.message));
  }
  const expired = await run({ calls: [], leaseExpiresAt: "2026-01-01T12:05:00.000Z" });
  results.push(scenario("expired ownership lease blocks before execution", !expired.ok && expired.itemsExecuted === 0, expired.message));
  return results;
}

async function duplicateFailure() {
  const calls: string[] = [];
  const result = await run({ calls, next: (current) => current.sequence === 2 ? running(3, "provider_shell", { itemId: "item-2" }) : running(4, "sterilizer_shell") });
  return scenario("duplicate execution-item evidence blocks exactly-once sequence", !result.ok && result.itemsExecuted === 1 && calls.length === 1, result.message);
}

async function malformedAndBoundFailures() {
  const malformed = await run({ calls: [], next: () => running(3, "provider_shell", { ok: false }) });
  const earlyHandoff = await run({ calls: [], next: () => running(3, "sterilizer_shell") });
  const exceeded = await run({ calls: [], prepared: [prepared(2)], next: () => running(3, "provider_shell") });
  return [scenario("malformed next-start evidence blocks", !malformed.ok, malformed.message), scenario("non-matching item before bound blocks", !earlyHandoff.ok, earlyHandoff.message), scenario("matching item beyond authoritative bound blocks", !exceeded.ok && exceeded.itemsExecuted === 1, exceeded.message)];
}

function sourceBoundary() {
  const source = String(executeGenericEntitySequence);
  const forbidden = ["provider_shell", "sterilizer_shell", "workstation_shell", "hardware_shell", "hardware_assignment", "while (", "retry", "queue", "worker", "poll", "setInterval"];
  return scenario("generic driver has no entity-specific or background runtime knowledge", forbidden.every((term) => !source.includes(term)), forbidden.filter((term) => source.includes(term)).join(",") || "none");
}

async function run(options: { calls: string[]; first?: Running; leaseExpiresAt?: string; prepared?: ReturnType<typeof prepared>[]; next?: (current: Running) => Running }) {
  return executeGenericEntitySequence({
    entityType: "provider_shell", action: "activate", clinicId: "clinic", deploymentRunKey: "run", sessionId: "session", executionKey: "execution", planKey: "plan", claimantId: "claimant", leaseExpiresAt: options.leaseExpiresAt ?? "2026-01-01T12:15:00.000Z", executedAt: "2026-01-01T12:06:00.000Z",
    firstRunningItem: options.first ?? running(2, "provider_shell"), preparedItems: options.prepared ?? [prepared(2), prepared(3), prepared(4, "sterilizer_shell")], readRunningIdentity: (item) => item,
    validateEntityIdentity: (_running, item) => Boolean(item.entityId && item.deploymentKey && item.entityId !== item.deploymentKey),
    executeOne: async ({ running: current }) => { options.calls.push(current.itemId!); const next = options.next?.(current) ?? (current.sequence === 2 ? running(3, "provider_shell") : running(4, "sterilizer_shell")); return { step: step(), evidence: { final: current.itemId! }, nextRunningItem: next }; },
  });
}

function running(sequence: number, entityType: string, patch: Partial<Running> = {}): Running { const provider = entityType === "provider_shell"; return { ok: true, status: "started", clinicId: "clinic", deploymentRunKey: "run", sessionId: "session", executionKey: "execution", planKey: "plan", claimantId: "claimant", leaseExpiresAt: "2026-01-01T12:15:00.000Z", itemId: `item-${sequence}`, executionItemKey: `execution:${provider ? "provider" : "sterilizer"}-${sequence}`, planItemKey: `plan:${provider ? "provider" : "sterilizer"}-${sequence}`, sequence, entityType, entityId: `${provider ? "provider" : "sterilizer"}-id-${sequence}`, deploymentKey: null, action: "activate", startedAt: "2026-01-01T12:05:00.000Z", ...patch }; }
function prepared(sequence: number, entityType = "provider_shell") { const provider = entityType === "provider_shell"; return { source: { sequence }, executionItemKey: `execution:${provider ? "provider" : "sterilizer"}-${sequence}`, planItemKey: `plan:${provider ? "provider" : "sterilizer"}-${sequence}`, sequence, entityType, entityId: `${provider ? "provider" : "sterilizer"}-id-${sequence}`, deploymentKey: `${provider ? "provider" : "sterilizer"}-key-${sequence}`, action: "activate" }; }
function step(): Step { return { ok: true, downstream: { entitiesActivated: 1, itemsCompleted: 1, dependenciesProgressed: 1, itemsStarted: 1, bindingsWritten: 0, assignmentsFinalized: 0, sessionsCompleted: 0, deploymentsFinalized: 0, rollbacksExecuted: 0 } }; }
function scenario(name: string, passed: boolean, message: string): GenericEntitySequenceDriverHarnessScenario { return { name, passed, message }; }
