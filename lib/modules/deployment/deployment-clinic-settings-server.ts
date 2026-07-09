import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentClinicSettingsService,
  type DeploymentClinicSettingsService,
} from "./deployment-clinic-settings-service";
import type {
  DeploymentClinicSettingsProvisionCommand,
  DeploymentClinicSettingsProvisionResult,
} from "./deployment-clinic-settings-types";
import {
  SupabaseDeploymentClinicSettingsRepository,
} from "./deployment-clinic-settings-supabase-repository";

export function createServerDeploymentClinicSettingsService(
  client: SupabaseClient,
): DeploymentClinicSettingsService {
  return createDeploymentClinicSettingsService(
    new SupabaseDeploymentClinicSettingsRepository(client),
  );
}

export type ServerDeploymentClinicSettingsProvisionCommand = Omit<
  DeploymentClinicSettingsProvisionCommand,
  "createdAt"
> & {
  createdAt?: string;
};

export type ServerDeploymentClinicSettingsProvisionResult =
  DeploymentClinicSettingsProvisionResult;

export async function provisionClinicSettingsForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentClinicSettingsProvisionCommand,
): Promise<ServerDeploymentClinicSettingsProvisionResult> {
  return createServerDeploymentClinicSettingsService(
    client,
  ).provisionClinicSettings({
    ...command,
    createdAt: command.createdAt ?? new Date().toISOString(),
  });
}
