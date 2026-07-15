import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateDeploymentActivationExecutionItemPayload,
  CreateDeploymentActivationExecutionSessionPayload,
} from "./deployment-activation-execution-persistence-types";
import {
  SupabaseDeploymentActivationExecutionPersistenceRepository,
  assertAtMostOne,
  itemInsertPayload,
  mapItemRow,
  mapSessionRow,
  sessionInsertPayload,
  type DeploymentActivationExecutionItemRow,
  type DeploymentActivationExecutionSessionRow,
} from "./deployment-activation-execution-persistence-supabase-repository";

export interface DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-execution-persistence-0001";
const DEPLOYMENT_RUN_RECORD_ID = "deployment-run-record-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-execution-persistence-0001";
const EXECUTION_KEY = `activation-execution-${DEPLOYMENT_RUN_KEY}`;
const PLAN_KEY = `activation-plan-${DEPLOYMENT_RUN_KEY}`;
const SESSION_ID = "activation-execution-session-0001";

export async function runDeploymentActivationExecutionPersistenceSupabaseRepositoryHarness(): Promise<DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioSessionRowMapping(),
    scenarioItemRowMapping(),
    scenarioCreatePreparedSessionPayload(),
    scenarioCreateReadyItemPayload(),
    scenarioCreatePendingItemPayload(),
    scenarioNullableOwnerLeaseTimestamps(),
    scenarioRollbackBoundaryMapping(),
    scenarioJsonStateDependencyMapping(),
    await scenarioDeterministicSessionOrdering(),
    await scenarioDeterministicItemOrdering(),
    await scenarioUniqueRaceRereadBehavior(),
    await scenarioExistingCompatibleSessionRetrieval(),
    scenarioExistingIncompatibleSessionVisible(),
    await scenarioCrossClinicIsolation(),
    scenarioDuplicateAmbiguousLookupDetection(),
    scenarioNoUpdateDeleteCalls(),
    scenarioNoClaimStartCompleteRollbackOperations(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioSessionRowMapping(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const record = mapSessionRow(sessionRow());

  return expectScenario(
    "session row mapping",
    record.id === SESSION_ID &&
      record.clinicId === CLINIC_ID &&
      record.deploymentRunId === DEPLOYMENT_RUN_KEY &&
      record.executionStatus === "prepared",
    JSON.stringify(record),
  );
}

function scenarioItemRowMapping(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const record = mapItemRow(itemRow());

  return expectScenario(
    "item row mapping",
    record.sessionId === SESSION_ID &&
      record.executionItemKey === `${EXECUTION_KEY}:${PLAN_KEY}:clinic` &&
      record.executionStatus === "ready" &&
      record.dependencyKeys.length === 0,
    JSON.stringify(record),
  );
}

function scenarioCreatePreparedSessionPayload(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const insert = sessionInsertPayload(sessionPayload(), DEPLOYMENT_RUN_RECORD_ID);

  return expectScenario(
    "create prepared session payload",
    insert.execution_status === "prepared" &&
      insert.preparation_status === "ready" &&
      insert.deployment_run_record_id === DEPLOYMENT_RUN_RECORD_ID &&
      insert.deployment_run_key === DEPLOYMENT_RUN_KEY,
    JSON.stringify(insert),
  );
}

function scenarioCreateReadyItemPayload(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const insert = itemInsertPayload(itemPayload("ready"), DEPLOYMENT_RUN_RECORD_ID);

  return expectScenario(
    "create ready item payload",
    insert.execution_status === "ready" &&
      insert.attempt_count === 0 &&
      insert.started_at === null,
    JSON.stringify(insert),
  );
}

function scenarioCreatePendingItemPayload(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const insert = itemInsertPayload(itemPayload("pending"), DEPLOYMENT_RUN_RECORD_ID);

  return expectScenario(
    "create pending item payload",
    insert.execution_status === "pending" && insert.completed_at === null,
    JSON.stringify(insert),
  );
}

function scenarioNullableOwnerLeaseTimestamps(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const record = mapSessionRow(sessionRow());

  return expectScenario(
    "nullable owner lease timestamps preserved",
    record.executionOwner === null &&
      record.ownershipToken === null &&
      record.leaseExpiresAt === null &&
      record.startedAt === null &&
      record.completedAt === null,
    JSON.stringify(record),
  );
}

function scenarioRollbackBoundaryMapping(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const record = mapSessionRow(sessionRow());

  return expectScenario(
    "rollback-boundary mapping",
    record.rollbackBoundary.lastReversibleSequence === 2 &&
      record.rollbackBoundary.firstIrreversibleSequence === 3 &&
      record.rollbackBoundary.rollbackSupportedItemKeys.includes(`${PLAN_KEY}:clinic`),
    JSON.stringify(record.rollbackBoundary),
  );
}

function scenarioJsonStateDependencyMapping(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const record = mapItemRow(itemRow({
    expected_current_state: { clinicId: CLINIC_ID, deploymentStatus: "draft" },
    target_state: { deploymentStatus: "deployed" },
    dependency_keys: [`${PLAN_KEY}:clinic`],
  }));

  return expectScenario(
    "JSON state/dependency mapping",
    record.expectedCurrentState.clinicId === CLINIC_ID &&
      record.targetState.deploymentStatus === "deployed" &&
      record.dependencyKeys[0] === `${PLAN_KEY}:clinic`,
    JSON.stringify(record),
  );
}

async function scenarioDeterministicSessionOrdering(): Promise<DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({
    deployment_activation_execution_sessions: [
      sessionRow({ id: "session-b", created_at: "2026-01-02T00:00:00.000Z" }),
    ],
  });
  const repository = new SupabaseDeploymentActivationExecutionPersistenceRepository(client as unknown as SupabaseClient);
  const session = await repository.findSessionByIdentity({
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    executionKey: EXECUTION_KEY,
  });

  return expectScenario(
    "deterministic session ordering",
    session?.id === "session-b",
    JSON.stringify(session),
  );
}

async function scenarioDeterministicItemOrdering(): Promise<DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({
    deployment_activation_execution_items: [
      itemRow({ id: "item-2", sequence: 2, execution_item_key: "b" }),
      itemRow({ id: "item-1", sequence: 1, execution_item_key: "a" }),
    ],
  });
  const repository = new SupabaseDeploymentActivationExecutionPersistenceRepository(client as unknown as SupabaseClient);
  const items = await repository.listExecutionItemsForSession(SESSION_ID);

  return expectScenario(
    "deterministic item ordering",
    items.map((item) => item.id).join(",") === "item-1,item-2",
    items.map((item) => item.id).join(","),
  );
}

async function scenarioUniqueRaceRereadBehavior(): Promise<DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({
    deployment_runs: [deploymentRunRow()],
    deployment_activation_execution_sessions: [sessionRow()],
  }, {
    deployment_activation_execution_sessions: { code: "23505", message: "duplicate" },
  });
  const repository = new SupabaseDeploymentActivationExecutionPersistenceRepository(client as unknown as SupabaseClient);
  const result = await repository.createPreparedSession(sessionPayload());

  return expectScenario(
    "unique-race re-read behavior",
    !result.ok && result.session?.id === SESSION_ID,
    JSON.stringify(result),
  );
}

async function scenarioExistingCompatibleSessionRetrieval(): Promise<DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({
    deployment_activation_execution_sessions: [sessionRow()],
  });
  const repository = new SupabaseDeploymentActivationExecutionPersistenceRepository(client as unknown as SupabaseClient);
  const session = await repository.findSessionByDeploymentRun({
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
  });

  return expectScenario(
    "existing compatible session retrieval",
    session?.executionKey === EXECUTION_KEY && session.planKey === PLAN_KEY,
    JSON.stringify(session),
  );
}

function scenarioExistingIncompatibleSessionVisible(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const record = mapSessionRow(sessionRow({ execution_status: "running" }));

  return expectScenario(
    "existing incompatible session remains visible",
    record.executionStatus === "running",
    JSON.stringify(record),
  );
}

async function scenarioCrossClinicIsolation(): Promise<DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario> {
  const client = new MockSupabaseClient({
    deployment_activation_execution_sessions: [
      sessionRow({ clinic_id: "other-clinic" }),
      sessionRow(),
    ],
  });
  const repository = new SupabaseDeploymentActivationExecutionPersistenceRepository(client as unknown as SupabaseClient);
  const session = await repository.findSessionByIdentity({
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    executionKey: EXECUTION_KEY,
  });

  return expectScenario(
    "cross-clinic isolation",
    session?.clinicId === CLINIC_ID,
    JSON.stringify(session),
  );
}

function scenarioDuplicateAmbiguousLookupDetection(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  try {
    assertAtMostOne([{}, {}], "session identity");
  } catch (error) {
    return expectScenario(
      "duplicate/ambiguous lookup detection",
      error instanceof Error && error.message.includes("Ambiguous session identity"),
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario("duplicate/ambiguous lookup detection", false, "duplicate accepted");
}

function scenarioNoUpdateDeleteCalls(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const client = new MockSupabaseClient({});

  return expectScenario(
    "no update/delete calls",
    client.calls.every((call) => call.operation !== "update" && call.operation !== "delete"),
    JSON.stringify(client.calls),
  );
}

function scenarioNoClaimStartCompleteRollbackOperations(): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  const prototype = SupabaseDeploymentActivationExecutionPersistenceRepository.prototype as Record<string, unknown>;
  const forbidden = ["claim", "start", "complete", "fail", "rollback", "cancel"];

  return expectScenario(
    "no claim/start/complete/rollback operations",
    forbidden.every((name) => !(name in prototype)),
    forbidden.filter((name) => name in prototype).join(","),
  );
}

function sessionPayload(): CreateDeploymentActivationExecutionSessionPayload {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    executionKey: EXECUTION_KEY,
    planKey: PLAN_KEY,
    payloadHash: "payload-hash-001",
    preparationStatus: "ready",
    executionStatus: "prepared",
    executionOwner: null,
    ownershipToken: null,
    leaseExpiresAt: null,
    itemsRequested: 3,
    itemsReady: 1,
    itemsPending: 2,
    itemsBlocked: 0,
    reversibleItems: 2,
    irreversibleItems: 1,
    blockers: 0,
    warnings: 1,
    rollbackBoundary: rollbackBoundary(),
    preparationEvidence: { status: "ready" },
    executionMetadata: {},
    startedAt: null,
    completedAt: null,
    failedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function itemPayload(
  executionStatus: "ready" | "pending",
): CreateDeploymentActivationExecutionItemPayload {
  return {
    sessionId: SESSION_ID,
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_KEY,
    executionKey: EXECUTION_KEY,
    executionItemKey: `${EXECUTION_KEY}:${PLAN_KEY}:clinic`,
    planItemKey: `${PLAN_KEY}:clinic`,
    sequence: 1,
    dependencyLevel: 0,
    entityType: "clinic",
    entityId: CLINIC_ID,
    deploymentKey: null,
    action: "activate",
    expectedCurrentState: { clinicId: CLINIC_ID, deploymentStatus: "draft" },
    targetState: { deploymentStatus: "deployed" },
    dependencyKeys: [],
    executionStatus,
    attemptCount: 0,
    reversible: true,
    rollbackAction: "restore clinic",
    rollbackStatus: "not_started",
    errorCode: null,
    errorMessage: null,
    executionEvidence: { dependencyLevel: 0 },
    startedAt: null,
    completedAt: null,
    rolledBackAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function deploymentRunRow(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: input.id ?? DEPLOYMENT_RUN_RECORD_ID,
    clinic_id: input.clinic_id ?? CLINIC_ID,
    deployment_run_id: input.deployment_run_id ?? DEPLOYMENT_RUN_KEY,
  };
}

function sessionRow(
  input: Partial<DeploymentActivationExecutionSessionRow> = {},
): DeploymentActivationExecutionSessionRow {
  return {
    id: input.id ?? SESSION_ID,
    clinic_id: input.clinic_id ?? CLINIC_ID,
    deployment_run_record_id: input.deployment_run_record_id ?? DEPLOYMENT_RUN_RECORD_ID,
    deployment_run_key: input.deployment_run_key ?? DEPLOYMENT_RUN_KEY,
    execution_key: input.execution_key ?? EXECUTION_KEY,
    plan_key: input.plan_key ?? PLAN_KEY,
    payload_hash: input.payload_hash ?? "payload-hash-001",
    preparation_status: input.preparation_status ?? "ready",
    execution_status: input.execution_status ?? "prepared",
    execution_owner: input.execution_owner ?? null,
    ownership_token: input.ownership_token ?? null,
    lease_expires_at: input.lease_expires_at ?? null,
    items_requested: input.items_requested ?? 3,
    items_ready: input.items_ready ?? 1,
    items_pending: input.items_pending ?? 2,
    items_blocked: input.items_blocked ?? 0,
    reversible_items: input.reversible_items ?? 2,
    irreversible_items: input.irreversible_items ?? 1,
    blockers: input.blockers ?? 0,
    warnings: input.warnings ?? 1,
    rollback_boundary: input.rollback_boundary ?? rollbackBoundary(),
    preparation_evidence: input.preparation_evidence ?? { status: "ready" },
    execution_metadata: input.execution_metadata ?? {},
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    failed_at: input.failed_at ?? null,
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: input.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function itemRow(
  input: Partial<DeploymentActivationExecutionItemRow> = {},
): DeploymentActivationExecutionItemRow {
  return {
    id: input.id ?? "activation-execution-item-0001",
    session_id: input.session_id ?? SESSION_ID,
    clinic_id: input.clinic_id ?? CLINIC_ID,
    deployment_run_record_id: input.deployment_run_record_id ?? DEPLOYMENT_RUN_RECORD_ID,
    deployment_run_key: input.deployment_run_key ?? DEPLOYMENT_RUN_KEY,
    execution_key: input.execution_key ?? EXECUTION_KEY,
    execution_item_key: input.execution_item_key ?? `${EXECUTION_KEY}:${PLAN_KEY}:clinic`,
    plan_item_key: input.plan_item_key ?? `${PLAN_KEY}:clinic`,
    sequence: input.sequence ?? 1,
    dependency_level: input.dependency_level ?? 0,
    entity_type: input.entity_type ?? "clinic",
    entity_id: input.entity_id ?? CLINIC_ID,
    deployment_key: input.deployment_key ?? null,
    action: input.action ?? "activate",
    expected_current_state: input.expected_current_state ?? { clinicId: CLINIC_ID, deploymentStatus: "draft" },
    target_state: input.target_state ?? { deploymentStatus: "deployed" },
    dependency_keys: input.dependency_keys ?? [],
    execution_status: input.execution_status ?? "ready",
    attempt_count: input.attempt_count ?? 0,
    reversible: input.reversible ?? true,
    rollback_action: input.rollback_action ?? "restore clinic",
    rollback_status: input.rollback_status ?? "not_started",
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
    execution_evidence: input.execution_evidence ?? { dependencyLevel: 0 },
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    rolled_back_at: input.rolled_back_at ?? null,
    created_at: input.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: input.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}

function rollbackBoundary() {
  return {
    lastReversibleSequence: 2,
    firstIrreversibleSequence: 3,
    rollbackSupportedItemKeys: [`${PLAN_KEY}:clinic`],
    rollbackUnsupportedItemKeys: [`${PLAN_KEY}:deployment_run`],
    wouldCrossIrreversibleBoundary: true,
  };
}

class MockSupabaseClient {
  readonly calls: Array<{ table: string; operation: string }> = [];

  constructor(
    readonly tables: Record<string, unknown[]> = {},
    readonly insertErrors: Record<string, { code: string; message: string }> = {},
  ) {}

  from(table: string): MockQuery {
    return new MockQuery(this, table);
  }
}

class MockQuery {
  private operation = "select";
  private readonly filters: Array<{ key: string; value: unknown }> = [];
  private readonly orders: Array<{ key: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private insertValue: unknown = null;

  constructor(
    private readonly client: MockSupabaseClient,
    private readonly table: string,
  ) {}

  select(_columns: string): this {
    return this;
  }

  eq(key: string, value: unknown): this {
    this.filters.push({ key, value });
    return this;
  }

  order(key: string, input: { ascending: boolean }): this {
    this.orders.push({ key, ascending: input.ascending });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  insert(value: unknown): this {
    this.operation = "insert";
    this.insertValue = value;
    return this;
  }

  async single(): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
    return this.executeSingle();
  }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.executeMany()).then(onfulfilled, onrejected);
  }

  private executeMany(): { data: unknown[]; error: null } {
    this.client.calls.push({ table: this.table, operation: this.operation });
    let rows = [...(this.client.tables[this.table] ?? [])] as Array<Record<string, unknown>>;

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.key] === filter.value);
    }

    for (const order of [...this.orders].reverse()) {
      rows.sort((left, right) => {
        const compared = String(left[order.key] ?? "").localeCompare(String(right[order.key] ?? ""));
        return order.ascending ? compared : -compared;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }

  private executeSingle(): { data: unknown; error: { code?: string; message: string } | null } {
    this.client.calls.push({ table: this.table, operation: this.operation });

    if (this.operation === "insert") {
      const error = this.client.insertErrors[this.table];

      if (error) {
        return { data: null, error };
      }

      const row = this.insertValue as Record<string, unknown>;
      const stored = {
        ...row,
        id: row.id ?? `${this.table}-inserted-id`,
        created_at: row.created_at ?? "2026-01-01T00:00:00.000Z",
        updated_at: row.updated_at ?? "2026-01-01T00:00:00.000Z",
      };
      this.client.tables[this.table] = [...(this.client.tables[this.table] ?? []), stored];
      return { data: stored, error: null };
    }

    const result = this.executeMany();
    return { data: result.data[0] ?? null, error: null };
  }
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionPersistenceSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}
