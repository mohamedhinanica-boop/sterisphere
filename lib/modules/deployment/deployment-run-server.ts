import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentRunService,
  type DeploymentRunService,
} from "./deployment-run-service";
import type {
  DeploymentRunCreateCommand,
  DeploymentRunCreateResult,
} from "./deployment-run-service-types";
import {
  SupabaseDeploymentRunRepository,
} from "./deployment-run-supabase-repository";

/**
 * Trusted server-only factory for deployment_runs persistence.
 *
 * This boundary intentionally creates only the deployment-run service and
 * repository. It does not call DeploymentEngine.execute(), create clinics, or
 * persist downstream deployment stages.
 */
export function createServerDeploymentRunService(
  client: SupabaseClient,
): DeploymentRunService {
  return createDeploymentRunService(
    new SupabaseDeploymentRunRepository(client),
  );
}

export type ServerDeploymentRunCreateCommand = Omit<
  DeploymentRunCreateCommand,
  "id" | "deploymentRunId" | "createdAt"
> & {
  id?: string;
  deploymentRunId?: string;
  createdAt?: string;
};

export type ServerDeploymentRunCreateResult = DeploymentRunCreateResult;

export async function createOrReuseServerDeploymentRun(
  client: SupabaseClient,
  command: ServerDeploymentRunCreateCommand,
): Promise<ServerDeploymentRunCreateResult> {
  return createServerDeploymentRunService(client).createOrReuseDeploymentRun(
    mapServerDeploymentRunCreateCommand(command),
  );
}

export function mapServerDeploymentRunCreateCommand(
  command: ServerDeploymentRunCreateCommand,
): DeploymentRunCreateCommand {
  return {
    ...command,
    id: command.id ?? randomUUID(),
    deploymentRunId:
      command.deploymentRunId ?? `deployment-run-${randomUUID()}`,
    createdAt: command.createdAt ?? new Date().toISOString(),
  };
}
