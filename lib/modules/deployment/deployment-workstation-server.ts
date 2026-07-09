import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentWorkstationService,
  type DeploymentWorkstationService,
} from "./deployment-workstation-service";
import type {
  DeploymentWorkstationProvisionCommand,
  DeploymentWorkstationProvisionResult,
} from "./deployment-workstation-types";
import {
  SupabaseDeploymentWorkstationRepository,
} from "./deployment-workstation-supabase-repository";

export function createServerDeploymentWorkstationService(
  client: SupabaseClient,
): DeploymentWorkstationService {
  const repository = Object.assign(
    new SupabaseDeploymentWorkstationRepository(client),
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
      providerShellsProvisioned: async (
        clinicId: string,
      ): Promise<boolean> => {
        const { count, error } = await client
          .from("providers")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .not("deployment_provider_key", "is", null);

        if (error) {
          throw error;
        }

        return (count ?? 0) > 0;
      },
      sterilizerShellsProvisioned: async (
        clinicId: string,
      ): Promise<boolean> => {
        const { count, error } = await client
          .from("sterilizers")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .not("deployment_sterilizer_key", "is", null);

        if (error) {
          throw error;
        }

        return (count ?? 0) > 0;
      },
    },
  );

  return createDeploymentWorkstationService(repository);
}

export type ServerDeploymentWorkstationProvisionCommand = Omit<
  DeploymentWorkstationProvisionCommand,
  "createdAt"
> & {
  createdAt?: string;
};

export type ServerDeploymentWorkstationProvisionResult =
  DeploymentWorkstationProvisionResult;

export async function provisionWorkstationShellsForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentWorkstationProvisionCommand,
): Promise<ServerDeploymentWorkstationProvisionResult> {
  return createServerDeploymentWorkstationService(
    client,
  ).provisionWorkstationShellsForClinic({
    ...command,
    createdAt: command.createdAt ?? new Date().toISOString(),
  });
}
