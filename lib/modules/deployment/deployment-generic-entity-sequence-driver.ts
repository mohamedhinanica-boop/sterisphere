export interface GenericEntitySequenceIdentity {
  ok: boolean;
  status: string;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  claimantId: string | null;
  leaseExpiresAt: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityId: string | null;
  deploymentKey: string | null;
  action: string | null;
  startedAt: string | null;
}

export interface GenericEntitySequencePreparedItem<TPrepared> {
  source: TPrepared;
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
  entityType: string;
  entityId: string | null;
  deploymentKey: string | null;
  action: string;
}

export interface GenericEntitySequenceStepResult {
  ok: boolean;
  downstream: {
    entitiesActivated: number;
    itemsCompleted: number;
    dependenciesProgressed: number;
    itemsStarted: number;
    bindingsWritten: 0;
    assignmentsFinalized: 0;
    sessionsCompleted: 0;
    deploymentsFinalized: 0;
    rollbacksExecuted: 0;
  };
}

export interface GenericEntitySequenceResult<TStep extends GenericEntitySequenceStepResult, TEvidence, TRunning> {
  ok: boolean;
  message: string;
  itemsPlanned: number;
  itemsExecuted: number;
  lastStep: TStep | null;
  lastEvidence: TEvidence | null;
  nextRunningItem: TRunning | null;
}

export async function executeGenericEntitySequence<TPrepared, TRunning, TStep extends GenericEntitySequenceStepResult, TEvidence>(input: {
  entityType: string;
  action: string;
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  claimantId: string;
  leaseExpiresAt: string | null;
  executedAt: string;
  firstRunningItem: TRunning;
  preparedItems: readonly GenericEntitySequencePreparedItem<TPrepared>[];
  readRunningIdentity(item: TRunning): GenericEntitySequenceIdentity;
  validateEntityIdentity(running: GenericEntitySequenceIdentity, prepared: GenericEntitySequencePreparedItem<TPrepared>): boolean;
  executeOne(input: { running: TRunning; prepared: GenericEntitySequencePreparedItem<TPrepared> }): Promise<{ step: TStep; evidence: TEvidence; nextRunningItem: TRunning | null }>;
}): Promise<GenericEntitySequenceResult<TStep, TEvidence, TRunning>> {
  const items = input.preparedItems
    .filter((item) => item.entityType === input.entityType && item.action === input.action)
    .sort((left, right) => left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey));
  const seenItemIds = new Set<string>();
  let current = input.firstRunningItem;
  let lastStep: TStep | null = null;
  let lastEvidence: TEvidence | null = null;
  let nextRunningItem: TRunning | null = null;
  const downstream = { entitiesActivated: 0, itemsCompleted: 0, dependenciesProgressed: 0, itemsStarted: 0 };
  const stop = (message: string): GenericEntitySequenceResult<TStep, TEvidence, TRunning> => ({ ok: false, message, itemsPlanned: items.length, itemsExecuted: seenItemIds.size, lastStep, lastEvidence, nextRunningItem });

  if (items.length === 0) return stop("Entity sequence has no authoritative planned items.");
  if (!input.leaseExpiresAt || Date.parse(input.leaseExpiresAt) <= Date.parse(input.executedAt)) return stop("Entity sequence ownership lease is not active.");

  for (let index = 0; index < items.length; index += 1) {
    const prepared = items[index];
    const identity = input.readRunningIdentity(current);
    const validIdentity = identity.ok && ["started", "already_started"].includes(identity.status) && identity.clinicId === input.clinicId && identity.deploymentRunKey === input.deploymentRunKey && identity.sessionId === input.sessionId && identity.executionKey === input.executionKey && identity.planKey === input.planKey && identity.claimantId === input.claimantId && identity.leaseExpiresAt === input.leaseExpiresAt && identity.entityType === input.entityType && identity.action === input.action && identity.itemId && identity.startedAt && identity.executionItemKey === prepared.executionItemKey && identity.planItemKey === prepared.planItemKey && identity.sequence === prepared.sequence && identity.entityId === prepared.entityId && input.validateEntityIdentity(identity, prepared);
    if (!validIdentity) return stop("Entity sequence next-item evidence is malformed, foreign, or out of deterministic order.");
    if (seenItemIds.has(identity.itemId!)) return stop("Entity sequence refused duplicate execution-item evidence.");
    seenItemIds.add(identity.itemId!);

    const invocation = await input.executeOne({ running: current, prepared });
    lastEvidence = invocation.evidence;
    nextRunningItem = invocation.nextRunningItem;
    downstream.entitiesActivated += invocation.step.downstream.entitiesActivated;
    downstream.itemsCompleted += invocation.step.downstream.itemsCompleted;
    downstream.dependenciesProgressed += invocation.step.downstream.dependenciesProgressed;
    downstream.itemsStarted += invocation.step.downstream.itemsStarted;
    lastStep = { ...invocation.step, downstream: { ...invocation.step.downstream, ...downstream } };
    if (!invocation.step.ok) return stop("Entity sequence stopped because one execution step did not complete.");
    if (!nextRunningItem) return stop("Entity sequence stopped because no deterministic next item was started.");

    const nextIdentity = input.readRunningIdentity(nextRunningItem);
    if (!nextIdentity.ok || !["started", "already_started"].includes(nextIdentity.status)) return stop("Entity sequence stopped because no deterministic next item was started.");
    if (index + 1 < items.length) {
      if (nextIdentity.entityType !== input.entityType || nextIdentity.action !== input.action) return stop("Entity sequence reached a non-matching item before the authoritative bound.");
      current = nextRunningItem;
      continue;
    }
    if (nextIdentity.entityType === input.entityType && nextIdentity.action === input.action) return stop("Entity sequence exceeded the authoritative planned bound.");
    return { ok: true, message: "All deterministic entity items completed and the first non-matching item was started without execution.", itemsPlanned: items.length, itemsExecuted: seenItemIds.size, lastStep, lastEvidence, nextRunningItem };
  }
  return stop("Entity sequence terminated without a non-matching handoff.");
}
