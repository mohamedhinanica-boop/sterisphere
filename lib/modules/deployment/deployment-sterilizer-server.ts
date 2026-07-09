import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentSterilizerService,
  type DeploymentSterilizerService,
} from "./deployment-sterilizer-service";
import type {
  DeploymentSterilizerProvisionCommand,
  DeploymentSterilizerProvisionResult,
} from "./deployment-sterilizer-types";
import {
  SupabaseDeploymentSterilizerRepository,
} from "./deployment-sterilizer-supabase-repository";

export function createServerDeploymentSterilizerService(
  client: SupabaseClient,
): DeploymentSterilizerService {
  const repository = Object.assign(
    new SupabaseDeploymentSterilizerRepository(client),
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
    },
  );

  return createDeploymentSterilizerService(repository);
}

export type ServerDeploymentSterilizerProvisionCommand = Omit<
  DeploymentSterilizerProvisionCommand,
  "createdAt"
> & {
  createdAt?: string;
};

export type ServerDeploymentSterilizerProvisionResult =
  DeploymentSterilizerProvisionResult;

export async function provisionSterilizerShellsForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentSterilizerProvisionCommand,
): Promise<ServerDeploymentSterilizerProvisionResult> {
  return createServerDeploymentSterilizerService(
    client,
  ).provisionSterilizerShellsForClinic({
    ...command,
    createdAt: command.createdAt ?? new Date().toISOString(),
  });
}
