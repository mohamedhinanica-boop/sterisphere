import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentRecoveryPersistenceInput, DeploymentRecoveryPersistenceServiceResult } from "./deployment-recovery-persistence-types";
import { DeploymentRecoveryPersistenceService } from "./deployment-recovery-service";
import { SupabaseDeploymentRecoveryRepository } from "./deployment-recovery-supabase-repository";

export function createDeploymentRecoveryPersistenceService(client: SupabaseClient): DeploymentRecoveryPersistenceService {
  return new DeploymentRecoveryPersistenceService(new SupabaseDeploymentRecoveryRepository(client));
}

export async function persistDeploymentRecoveryDecision(
  client: SupabaseClient,
  input: DeploymentRecoveryPersistenceInput,
): Promise<DeploymentRecoveryPersistenceServiceResult> {
  return createDeploymentRecoveryPersistenceService(client).persistRecoveryDecision(input);
}
