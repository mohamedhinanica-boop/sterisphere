import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentHardwareService,
  type DeploymentHardwareService,
} from "./deployment-hardware-service";
import type {
  DeploymentHardwareProvisionCommand,
  DeploymentHardwareProvisionResult,
} from "./deployment-hardware-types";
import {
  SupabaseDeploymentHardwareRepository,
} from "./deployment-hardware-supabase-repository";

export function createServerDeploymentHardwareService(
  client: SupabaseClient,
): DeploymentHardwareService {
  const repository = Object.assign(
    new SupabaseDeploymentHardwareRepository(client),
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
      workstationShellsProvisioned: async (
        clinicId: string,
      ): Promise<boolean> => {
        const { count, error } = await client
          .from("clinical_workstations")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .not("deployment_workstation_key", "is", null);

        if (error) {
          throw error;
        }

        return (count ?? 0) > 0;
      },
    },
  );

  return createDeploymentHardwareService(repository);
}

export type ServerDeploymentHardwareProvisionCommand = Omit<
  DeploymentHardwareProvisionCommand,
  "createdAt"
> & {
  createdAt?: string;
};

export type ServerDeploymentHardwareProvisionResult =
  DeploymentHardwareProvisionResult;

export async function provisionHardwareShellsForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentHardwareProvisionCommand,
): Promise<ServerDeploymentHardwareProvisionResult> {
  return createServerDeploymentHardwareService(
    client,
  ).provisionHardwareShellsForClinic({
    ...command,
    createdAt: command.createdAt ?? new Date().toISOString(),
  });
}