import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DeploymentHardwareBindingService } from "./deployment-hardware-binding-service";
import { SupabaseDeploymentHardwareBindingRepository } from "./deployment-hardware-binding-supabase-repository";

export function createDeploymentHardwareBindingService(
  client: SupabaseClient,
): DeploymentHardwareBindingService {
  return new DeploymentHardwareBindingService(
    new SupabaseDeploymentHardwareBindingRepository(client),
  );
}
