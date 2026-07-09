import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentProviderService,
  type DeploymentProviderService,
} from "./deployment-provider-service";
import type {
  DeploymentProviderProvisionCommand,
  DeploymentProviderProvisionResult,
} from "./deployment-provider-types";
import {
  SupabaseDeploymentProviderRepository,
} from "./deployment-provider-supabase-repository";

export function createServerDeploymentProviderService(
  client: SupabaseClient,
): DeploymentProviderService {
  const repository = Object.assign(
    new SupabaseDeploymentProviderRepository(client),
    {
      clinicExists: async (clinicId: string): Promise<boolean> => {
        const { data, error } = await client
          .from("clinics")
          .select("id")
          .eq("id", clinicId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        return Boolean(data);
      },
      clinicSettingsExist: async (clinicId: string): Promise<boolean> => {
        const { data, error } = await client
          .from("clinic_settings")
          .select("id")
          .eq("clinic_id", clinicId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        return Boolean(data);
      },
    },
  );

  return createDeploymentProviderService(repository);
}

export type ServerDeploymentProviderProvisionCommand = Omit<
  DeploymentProviderProvisionCommand,
  "createdAt"
> & {
  createdAt?: string;
};

export type ServerDeploymentProviderProvisionResult =
  DeploymentProviderProvisionResult;

export async function provisionProviderShellsForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentProviderProvisionCommand,
): Promise<ServerDeploymentProviderProvisionResult> {
  return createServerDeploymentProviderService(
    client,
  ).provisionProviderShellsForClinic({
    ...command,
    createdAt: command.createdAt ?? new Date().toISOString(),
  });
}

