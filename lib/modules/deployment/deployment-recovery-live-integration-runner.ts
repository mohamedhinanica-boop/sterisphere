import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  assessDeploymentRecoveryIntegrationSafety,
  DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE,
  runDeploymentRecoveryLiveIntegration,
  type DeploymentRecoveryIntegrationSafetyInput,
  type DeploymentRecoveryLiveIntegrationResult,
} from "./deployment-recovery-live-integration";
import { SupabaseDeploymentRecoveryIntegrationFixtureStore } from "./deployment-recovery-live-integration-supabase-fixture";
import { SupabaseDeploymentRecoveryRepository } from "./deployment-recovery-supabase-repository";

export function deploymentRecoveryIntegrationSafetyFromEnvironment(
  environment: NodeJS.ProcessEnv,
): DeploymentRecoveryIntegrationSafetyInput {
  return {
    allowFixture: environment.STERISPHERE_ALLOW_RECOVERY_INTEGRATION_FIXTURE,
    environment: environment.STERISPHERE_RECOVERY_INTEGRATION_ENVIRONMENT,
    nodeEnv: environment.NODE_ENV,
    vercelEnv: environment.VERCEL_ENV,
    supabaseUrl: environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL,
    productionSupabaseUrl: environment.STERISPHERE_PRODUCTION_SUPABASE_URL,
  };
}

export async function runDeploymentRecoveryLiveIntegrationFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<DeploymentRecoveryLiveIntegrationResult> {
  const safetyInput = deploymentRecoveryIntegrationSafetyFromEnvironment(environment);
  const safety = assessDeploymentRecoveryIntegrationSafety(safetyInput);
  if (!safety.allowed || !safetyInput.supabaseUrl || !environment.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      status: "blocked",
      message: safety.allowed ? "The isolated Supabase service-role configuration is incomplete." : safety.message,
      safety: safety.allowed ? { ...safety, allowed: false, issueCode: "environment_identity_unknown", environment: null } : safety,
      fixtureOwner: DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE.owner,
      recoveryKey: null,
      canonicalPayloadHash: null,
      conflictingPayloadHash: null,
      persisted: null,
      reused: null,
      conflict: null,
      immutableReplay: null,
      repositoryCalls: 0,
      rollbackItems: 0,
      cleanup: null,
      downstream: { rollbackExecuted: 0, entitiesCompensated: 0, bindingsRemoved: 0, sessionsRecovered: 0, finalized: 0 },
    };
  }
  const client = createClient(safetyInput.supabaseUrl, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return runDeploymentRecoveryLiveIntegration({
    safety: safetyInput,
    fixtureStore: new SupabaseDeploymentRecoveryIntegrationFixtureStore(client),
    repository: new SupabaseDeploymentRecoveryRepository(client),
  });
}
