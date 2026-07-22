import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDeploymentRecoveryIntegrationInput,
  DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE,
  type DeploymentRecoveryIntegrationFixtureResult,
  type DeploymentRecoveryIntegrationFixtureStore,
} from "./deployment-recovery-live-integration";
import { buildDeploymentRecoveryPersistenceCommand } from "./deployment-recovery-service";

type FixtureTable =
  | "clinics"
  | "deployment_runs"
  | "deployment_activation_execution_sessions"
  | "deployment_recovery_plans"
  | "deployment_recovery_plan_items";

export class SupabaseDeploymentRecoveryIntegrationFixtureStore
  implements DeploymentRecoveryIntegrationFixtureStore
{
  constructor(private readonly client: SupabaseClient) {}

  async prepareFixture(): Promise<DeploymentRecoveryIntegrationFixtureResult> {
    const fixture = DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE;
    const steps: string[] = [];
    try {
      const clinic = await this.readOne("clinics", "id", fixture.clinicId, "id,clinic_code,name");
      if (clinic && !ownedClinic(clinic)) return blocked("A foreign clinic occupies the deterministic fixture identity.", steps);
      if (!clinic) {
        await this.insert("clinics", {
          id: fixture.clinicId,
          name: fixture.clinicName,
          legal_name: fixture.clinicName,
          clinic_code: fixture.clinicCode,
          country: "CA",
          province_state: "Integration Fixture",
          timezone: "UTC",
          primary_language: "en",
          deployment_status: "draft",
          deployment_version: "integration-fixture",
          schema_version: "recovery-persistence-validation-v1",
        });
        steps.push("clinic_created");
      } else steps.push("clinic_reused");

      const run = await this.readOne("deployment_runs", "id", fixture.deploymentRunRecordId, "id,deployment_run_id,clinic_id,idempotency_key,metadata");
      if (run && !ownedRun(run)) return blocked("A foreign deployment run occupies the deterministic fixture identity.", steps);
      if (!run) {
        await this.insert("deployment_runs", {
          id: fixture.deploymentRunRecordId,
          deployment_run_id: fixture.deploymentRunKey,
          clinic_id: fixture.clinicId,
          idempotency_key: fixture.runIdempotencyKey,
          payload_hash: fixture.runPayloadHash,
          lifecycle_state: "failed",
          deployment_status: "failed",
          draft_snapshot: { fixtureOwner: fixture.owner },
          audit_evidence: { fixtureOwner: fixture.owner, integrationOnly: true },
          rollback_recovery: null,
          lifecycle_summary: null,
          failed_at: fixture.failedAt,
          metadata: { fixtureOwner: fixture.owner, integrationOnly: true },
        });
        steps.push("deployment_run_created");
      } else steps.push("deployment_run_reused");

      const session = await this.readOne("deployment_activation_execution_sessions", "id", fixture.sessionId, "id,clinic_id,deployment_run_record_id,deployment_run_key,execution_key,plan_key,execution_metadata");
      if (session && !ownedSession(session)) return blocked("A foreign execution session occupies the deterministic fixture identity.", steps);
      if (!session) {
        await this.insert("deployment_activation_execution_sessions", {
          id: fixture.sessionId,
          clinic_id: fixture.clinicId,
          deployment_run_record_id: fixture.deploymentRunRecordId,
          deployment_run_key: fixture.deploymentRunKey,
          execution_key: fixture.executionKey,
          plan_key: fixture.planKey,
          payload_hash: fixture.runPayloadHash,
          preparation_status: "ready",
          execution_status: "failed",
          execution_owner: null,
          ownership_token: null,
          lease_expires_at: null,
          items_requested: 0,
          items_ready: 0,
          items_pending: 0,
          items_blocked: 0,
          reversible_items: 0,
          irreversible_items: 0,
          blockers: 0,
          warnings: 0,
          rollback_boundary: { fixtureOwner: fixture.owner, planningOnly: true },
          preparation_evidence: { fixtureOwner: fixture.owner, integrationOnly: true },
          execution_metadata: { fixtureOwner: fixture.owner, integrationOnly: true },
          failed_at: fixture.failedAt,
        });
        steps.push("execution_session_created");
      } else steps.push("execution_session_reused");
      return { ok: true, status: steps.some((step) => step.endsWith("_created")) ? "created" : "reused", message: "Deterministic isolated recovery integration fixture is prepared.", steps };
    } catch {
      return { ok: false, status: "error", message: "Recovery integration fixture preparation failed safely.", steps };
    }
  }

  async cleanupOwnedFixture(recoveryPlanId: string | null): Promise<DeploymentRecoveryIntegrationFixtureResult> {
    const fixture = DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE;
    const steps: string[] = [];
    try {
      const built = buildDeploymentRecoveryPersistenceCommand(buildDeploymentRecoveryIntegrationInput(false));
      if (!built.recoveryKey) return blocked("The deterministic recovery identity could not be derived for cleanup.", steps);
      const recovery = recoveryPlanId
        ? await this.readOne("deployment_recovery_plans", "id", recoveryPlanId, "id,clinic_id,deployment_run_key,session_id,execution_key,plan_key,recovery_key")
        : await this.readOne("deployment_recovery_plans", "recovery_key", built.recoveryKey, "id,clinic_id,deployment_run_key,session_id,execution_key,plan_key,recovery_key");
      if (recovery && !ownedRecovery(recovery, built.recoveryKey)) return blocked("Foreign recovery evidence is not eligible for fixture cleanup.", steps);
      const session = await this.readOne("deployment_activation_execution_sessions", "id", fixture.sessionId, "id,clinic_id,deployment_run_record_id,deployment_run_key,execution_key,plan_key,execution_metadata");
      if (session && !ownedSession(session)) return blocked("Foreign execution-session evidence is not eligible for fixture cleanup.", steps);
      const run = await this.readOne("deployment_runs", "id", fixture.deploymentRunRecordId, "id,deployment_run_id,clinic_id,idempotency_key,metadata");
      if (run && !ownedRun(run)) return blocked("Foreign deployment-run evidence is not eligible for fixture cleanup.", steps);
      const clinic = await this.readOne("clinics", "id", fixture.clinicId, "id,clinic_code,name");
      if (clinic && !ownedClinic(clinic)) return blocked("Foreign clinic evidence is not eligible for fixture cleanup.", steps);

      if (recovery) {
        await this.remove("deployment_recovery_plan_items", "recovery_plan_id", readString(recovery.id));
        steps.push("recovery_plan_items_deleted");
        await this.remove("deployment_recovery_plans", "id", readString(recovery.id));
        steps.push("recovery_plan_deleted");
      }
      if (session) { await this.remove("deployment_activation_execution_sessions", "id", fixture.sessionId); steps.push("execution_session_deleted"); }
      if (run) { await this.remove("deployment_runs", "id", fixture.deploymentRunRecordId); steps.push("deployment_run_deleted"); }
      if (clinic) { await this.remove("clinics", "id", fixture.clinicId); steps.push("clinic_deleted"); }

      const remaining = await Promise.all([
        this.readOne("deployment_recovery_plans", "recovery_key", built.recoveryKey, "id"),
        this.readOne("deployment_activation_execution_sessions", "id", fixture.sessionId, "id"),
        this.readOne("deployment_runs", "id", fixture.deploymentRunRecordId, "id"),
        this.readOne("clinics", "id", fixture.clinicId, "id"),
      ]);
      if (remaining.some(Boolean)) throw new Error("fixture_cleanup_incomplete");
      steps.push("fixture_absence_verified");
      return { ok: true, status: "cleaned", message: "Owned recovery integration fixture evidence was removed in foreign-key-safe order.", steps };
    } catch {
      return { ok: false, status: "error", message: "Recovery integration fixture cleanup failed safely; use a disposable isolated database reset before retrying.", steps };
    }
  }

  private async readOne(table: FixtureTable, field: string, value: string, columns: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.client.from(table).select(columns).eq(field, value).maybeSingle();
    if (error) throw new Error("fixture_read_failed");
    return isRecord(data) ? data : null;
  }

  private async insert(table: FixtureTable, value: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.from(table).insert(value);
    if (error) throw new Error("fixture_insert_failed");
  }

  private async remove(table: FixtureTable, field: string, value: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq(field, value);
    if (error) throw new Error("fixture_delete_failed");
  }
}

function ownedClinic(value: Record<string, unknown>): boolean {
  const fixture = DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE;
  return value.id === fixture.clinicId && value.clinic_code === fixture.clinicCode && value.name === fixture.clinicName;
}

function ownedRun(value: Record<string, unknown>): boolean {
  const fixture = DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE;
  return value.id === fixture.deploymentRunRecordId && value.deployment_run_id === fixture.deploymentRunKey &&
    value.clinic_id === fixture.clinicId && value.idempotency_key === fixture.runIdempotencyKey && fixtureMarker(value.metadata);
}

function ownedSession(value: Record<string, unknown>): boolean {
  const fixture = DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE;
  return value.id === fixture.sessionId && value.clinic_id === fixture.clinicId &&
    value.deployment_run_record_id === fixture.deploymentRunRecordId && value.deployment_run_key === fixture.deploymentRunKey &&
    value.execution_key === fixture.executionKey && value.plan_key === fixture.planKey && fixtureMarker(value.execution_metadata);
}

function ownedRecovery(value: Record<string, unknown>, recoveryKey: string): boolean {
  const fixture = DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE;
  return value.clinic_id === fixture.clinicId && value.deployment_run_key === fixture.deploymentRunKey &&
    value.session_id === fixture.sessionId && value.execution_key === fixture.executionKey && value.plan_key === fixture.planKey &&
    value.recovery_key === recoveryKey;
}

function fixtureMarker(value: unknown): boolean {
  return isRecord(value) && value.fixtureOwner === DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE.owner && value.integrationOnly === true;
}

function blocked(message: string, steps: readonly string[]): DeploymentRecoveryIntegrationFixtureResult {
  return { ok: false, status: "blocked", message, steps };
}

function readString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("fixture_identity_invalid");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
