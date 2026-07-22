import type { DeploymentRecoveryRepository } from "./deployment-recovery-repository";
import type { DeploymentRecoveryPersistenceCommand, DeploymentRecoveryPersistenceRepositoryResult } from "./deployment-recovery-persistence-types";
import { buildDeploymentRecoveryPersistenceCommand } from "./deployment-recovery-service";
import {
  assessDeploymentRecoveryIntegrationSafety,
  buildDeploymentRecoveryIntegrationInput,
  DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE,
  runDeploymentRecoveryLiveIntegration,
  type DeploymentRecoveryIntegrationFixtureResult,
  type DeploymentRecoveryIntegrationFixtureStore,
  type DeploymentRecoveryIntegrationSafetyInput,
} from "./deployment-recovery-live-integration";

export interface DeploymentRecoveryLiveIntegrationHarnessScenario { name: string; passed: boolean; message: string }
export interface DeploymentRecoveryLiveIntegrationHarnessResult { passed: boolean; scenarios: readonly DeploymentRecoveryLiveIntegrationHarnessScenario[] }

const SAFE_ENVIRONMENT: DeploymentRecoveryIntegrationSafetyInput = {
  allowFixture: "true",
  environment: "supabase_branch",
  nodeEnv: "test",
  vercelEnv: "preview",
  supabaseUrl: "https://isolated-recovery-fixture.supabase.co",
  productionSupabaseUrl: "https://production-sterisphere.supabase.co",
};

export async function runDeploymentRecoveryLiveIntegrationHarness(): Promise<DeploymentRecoveryLiveIntegrationHarnessResult> {
  const scenarios: DeploymentRecoveryLiveIntegrationHarnessScenario[] = [];
  const check = (name: string, passed: boolean, message = String(passed)) => scenarios.push({ name, passed, message });
  check("missing opt-in blocks", assessDeploymentRecoveryIntegrationSafety({ ...SAFE_ENVIRONMENT, allowFixture: undefined }).issueCode === "fixture_opt_in_missing");
  check("production NODE_ENV blocks", assessDeploymentRecoveryIntegrationSafety({ ...SAFE_ENVIRONMENT, nodeEnv: "production" }).issueCode === "production_environment_blocked");
  check("production Vercel environment blocks", assessDeploymentRecoveryIntegrationSafety({ ...SAFE_ENVIRONMENT, vercelEnv: "production" }).issueCode === "production_environment_blocked");
  check("production URL blocks", assessDeploymentRecoveryIntegrationSafety({ ...SAFE_ENVIRONMENT, supabaseUrl: SAFE_ENVIRONMENT.productionSupabaseUrl }).issueCode === "production_url_blocked");
  check("unknown environment blocks", assessDeploymentRecoveryIntegrationSafety({ ...SAFE_ENVIRONMENT, environment: undefined }).issueCode === "environment_identity_unknown");
  check("remote environment without production comparison blocks", assessDeploymentRecoveryIntegrationSafety({ ...SAFE_ENVIRONMENT, productionSupabaseUrl: undefined }).issueCode === "environment_identity_unknown");
  check("explicit isolated environment permits preparation", assessDeploymentRecoveryIntegrationSafety(SAFE_ENVIRONMENT).allowed);
  check("explicit localhost permits preparation", assessDeploymentRecoveryIntegrationSafety({ ...SAFE_ENVIRONMENT, environment: "local", supabaseUrl: "http://127.0.0.1:54321", productionSupabaseUrl: undefined }).allowed);
  check("deterministic fixture identities", DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE.clinicId === "9c2a0001-0000-4000-8000-000000000001" && DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE.owner.includes("integration-fixture"));
  const first = buildDeploymentRecoveryPersistenceCommand(buildDeploymentRecoveryIntegrationInput());
  const second = buildDeploymentRecoveryPersistenceCommand(buildDeploymentRecoveryIntegrationInput());
  const changed = buildDeploymentRecoveryPersistenceCommand(buildDeploymentRecoveryIntegrationInput(true));
  check("deterministic recovery key", first.recoveryKey !== null && first.recoveryKey === second.recoveryKey);
  check("deterministic canonical payload hash", first.payloadHash !== null && first.payloadHash === second.payloadHash);
  check("changed payload preserves recovery identity", first.recoveryKey === changed.recoveryKey);
  check("changed payload produces conflict hash", first.payloadHash !== changed.payloadHash);
  check("zero rollback items", first.command?.rollbackItems.length === 0);
  check("rollback decision flags remain false", first.command?.rollbackRequired === false && first.command.rollbackExecutable === false);
  check("recovery status is rollback_not_required", first.command?.recoveryStatus === "rollback_not_required");
  check("safe failure sanitization", first.command?.sanitizedFailure.message === "Deployment execution failure classified for recovery planning." && !JSON.stringify(first.command).match(/ownershipToken|serviceRoleKey|credentials/));

  const fixture = new MemoryFixtureStore();
  const repository = new SequenceRepository();
  const result = await runDeploymentRecoveryLiveIntegration({ safety: SAFE_ENVIRONMENT, fixtureStore: fixture, repository });
  check("fixture cleanup precedes preparation", fixture.events.slice(0, 2).join(",") === "cleanup,prepare", fixture.events.join(","));
  check("fixture creation order", fixture.prepareSteps.join(",") === "clinic_created,deployment_run_created,execution_session_created");
  check("cleanup order", fixture.cleanupSteps.join(",") === "recovery_plan_items_deleted,recovery_plan_deleted,execution_session_deleted,deployment_run_deleted,clinic_deleted,fixture_absence_verified");
  check("persistence follows fixture creation", repository.firstCallAfterPrepared && repository.calls > 0);
  check("persisted expected", result.persisted?.status === "persisted");
  check("identical replay expects reused", result.reused?.status === "reused");
  check("changed payload expects conflict", result.conflict?.status === "conflict");
  check("original evidence remains immutable", result.immutableReplay?.status === "reused" && result.immutableReplay.recoveryPlanId === result.persisted?.recoveryPlanId);
  check("repository called exactly once per service invocation", result.repositoryCalls === 4 && repository.calls === 4);
  check("deterministic replay", result.recoveryKey === first.recoveryKey && result.canonicalPayloadHash === first.payloadHash);
  check("no rollback execution counters", result.downstream.rollbackExecuted === 0);
  check("no entity compensation", result.downstream.entitiesCompensated === 0);
  check("no binding deletion", result.downstream.bindingsRemoved === 0);
  check("no session recovery", result.downstream.sessionsRecovered === 0);
  check("no finalization", result.downstream.finalized === 0);
  check("repository service boundaries reused", repository.commands.length === 4 && repository.commands.every((command) => command.rollbackItems.length === 0));
  check("direct recovery table inserts are not used", repository.directRecoveryTableInserts === 0);
  check("no RPC bypass", repository.calls === result.repositoryCalls);
  check("cleanup failure reported explicitly", (await runDeploymentRecoveryLiveIntegration({ safety: SAFE_ENVIRONMENT, fixtureStore: new MemoryFixtureStore({ cleanupFailsAtEnd: true }), repository: new SequenceRepository() })).status === "cleanup_failed");
  const repeat = await runDeploymentRecoveryLiveIntegration({ safety: SAFE_ENVIRONMENT, fixtureStore: new MemoryFixtureStore(), repository: new SequenceRepository() });
  check("repeated integration deterministic", repeat.recoveryKey === result.recoveryKey && repeat.canonicalPayloadHash === result.canonicalPayloadHash);
  const foreignFixture = new MemoryFixtureStore({ foreignOwned: true });
  const foreignRepository = new SequenceRepository();
  const foreign = await runDeploymentRecoveryLiveIntegration({ safety: SAFE_ENVIRONMENT, fixtureStore: foreignFixture, repository: foreignRepository });
  check("fixture-owned records only eligible for cleanup", result.cleanup?.ok === true);
  check("foreign or real records cannot be cleaned up", foreign.status === "cleanup_failed" && foreignRepository.calls === 0);
  const blockedRepository = new SequenceRepository();
  const blocked = await runDeploymentRecoveryLiveIntegration({ safety: { ...SAFE_ENVIRONMENT, allowFixture: undefined }, fixtureStore: new MemoryFixtureStore(), repository: blockedRepository });
  check("no production fallback", blocked.status === "blocked" && blockedRepository.calls === 0);
  check("integration runner is explicit opt-in only", blocked.safety.issueCode === "fixture_opt_in_missing");
  check("no Setup or runtime registration", DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE.owner.startsWith("sterisphere:integration-fixture:"));
  check("no deployment mutations", repository.commands.every((command) => command.downstream.rollbackExecuted === 0));
  return { passed: scenarios.every((scenario) => scenario.passed), scenarios };
}

class MemoryFixtureStore implements DeploymentRecoveryIntegrationFixtureStore {
  events: string[] = [];
  prepareSteps = ["clinic_created", "deployment_run_created", "execution_session_created"];
  cleanupSteps = ["recovery_plan_items_deleted", "recovery_plan_deleted", "execution_session_deleted", "deployment_run_deleted", "clinic_deleted", "fixture_absence_verified"];
  private cleanupCalls = 0;
  constructor(private readonly options: { cleanupFailsAtEnd?: boolean; foreignOwned?: boolean } = {}) {}
  async prepareFixture(): Promise<DeploymentRecoveryIntegrationFixtureResult> {
    this.events.push("prepare");
    return { ok: true, status: "created", message: "prepared", steps: this.prepareSteps };
  }
  async cleanupOwnedFixture(): Promise<DeploymentRecoveryIntegrationFixtureResult> {
    this.cleanupCalls += 1; this.events.push("cleanup");
    if (this.options.foreignOwned || (this.options.cleanupFailsAtEnd && this.cleanupCalls > 1)) return { ok: false, status: "blocked", message: "foreign or failed cleanup", steps: [] };
    return { ok: true, status: "cleaned", message: "cleaned", steps: this.cleanupCalls > 1 ? this.cleanupSteps : [] };
  }
}

class SequenceRepository implements DeploymentRecoveryRepository {
  calls = 0;
  commands: DeploymentRecoveryPersistenceCommand[] = [];
  directRecoveryTableInserts = 0;
  firstCallAfterPrepared = true;
  async persistRecoveryPlan(command: DeploymentRecoveryPersistenceCommand): Promise<DeploymentRecoveryPersistenceRepositoryResult> {
    this.calls += 1; this.commands.push(command);
    const status = this.calls === 1 ? "created" : this.calls === 3 ? "conflict" : "reused";
    return {
      ok: status === "created" || status === "reused",
      status,
      recoveryPlanId: "9c2a0004-0000-4000-8000-000000000004",
      recoveryKey: command.recoveryKey,
      payloadHash: command.payloadHash,
      recoveryStatus: command.recoveryStatus,
      rollbackRequired: command.rollbackRequired,
      rollbackExecutable: command.rollbackExecutable,
      rollbackItemsPersisted: 0,
      rollbackItemsReused: 0,
      issueCode: status === "conflict" ? "recovery_plan_identity_conflict" : null,
      message: status,
      persistedAt: "2026-07-21T12:01:00.000Z",
      repositoryError: null,
    };
  }
}
