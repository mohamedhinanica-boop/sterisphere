import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentHardwareAssignmentService,
  type DeploymentHardwareAssignmentService,
} from "./deployment-hardware-assignment-service";
import type {
  DeploymentHardwareAssignmentProvisionCommand,
  DeploymentHardwareAssignmentProvisionResult,
} from "./deployment-hardware-assignment-types";
import {
  SupabaseDeploymentHardwareAssignmentRepository,
} from "./deployment-hardware-assignment-supabase-repository";

export function createServerDeploymentHardwareAssignmentService(
  client: SupabaseClient,
): DeploymentHardwareAssignmentService {
  const repository = Object.assign(
    new SupabaseDeploymentHardwareAssignmentRepository(client),
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
      hardwareShellsProvisioned: async (
        clinicId: string,
      ): Promise<boolean> => {
        const { count, error } = await client
          .from("clinical_hardware_devices")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .not("deployment_hardware_key", "is", null);

        if (error) {
          throw error;
        }

        return (count ?? 0) > 0;
      },
    },
  );

  return createDeploymentHardwareAssignmentService(repository);
}

export type ServerDeploymentHardwareAssignmentProvisionCommand = Omit<
  DeploymentHardwareAssignmentProvisionCommand,
  "createdAt"
> & {
  createdAt?: string;
};

export type ServerDeploymentHardwareAssignmentProvisionResult =
  DeploymentHardwareAssignmentProvisionResult;

export async function provisionHardwareAssignmentsForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentHardwareAssignmentProvisionCommand,
): Promise<ServerDeploymentHardwareAssignmentProvisionResult> {
  return createServerDeploymentHardwareAssignmentService(
    client,
  ).provisionHardwareAssignmentsForClinic({
    ...command,
    createdAt: command.createdAt ?? new Date().toISOString(),
  });
}
