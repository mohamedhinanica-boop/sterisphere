import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentClinicService,
  type DeploymentClinicService,
} from "./deployment-clinic-service";
import type {
  DeploymentClinicCreateCommand,
  DeploymentClinicRootResult,
} from "./deployment-clinic-types";
import {
  SupabaseDeploymentClinicRepository,
} from "./deployment-clinic-supabase-repository";
import {
  SupabaseDeploymentRunRepository,
} from "./deployment-run-supabase-repository";

/**
 * Trusted server-only factory for clinic-root persistence.
 *
 * This composes only the clinic-root repository, deployment-run repository,
 * and clinic service. It does not call DeploymentEngine.execute(), create
 * downstream clinic configuration, or expose runtime UI/API wiring.
 */
export function createServerDeploymentClinicService(
  client: SupabaseClient,
): DeploymentClinicService {
  return createDeploymentClinicService(
    new SupabaseDeploymentClinicRepository(client),
    new SupabaseDeploymentRunRepository(client),
  );
}

export type ServerDeploymentClinicCreateCommand = Omit<
  DeploymentClinicCreateCommand,
  "createdAt"
> & {
  createdAt?: string;
};

export type ServerDeploymentClinicRootResult = DeploymentClinicRootResult;

export async function createClinicRootForServerDeploymentRun(
  client: SupabaseClient,
  command: ServerDeploymentClinicCreateCommand,
): Promise<ServerDeploymentClinicRootResult> {
  return createServerDeploymentClinicService(
    client,
  ).createClinicRootForDeploymentRun(
    mapServerDeploymentClinicCreateCommand(command),
  );
}

export function mapServerDeploymentClinicCreateCommand(
  command: ServerDeploymentClinicCreateCommand,
): DeploymentClinicCreateCommand {
  return {
    ...command,
    createdAt: command.createdAt ?? new Date().toISOString(),
  };
}
