import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentSterilizerRepository,
  DeploymentSterilizerShellPersistenceResult,
} from "./deployment-sterilizer-repository";
import type {
  CreateDeploymentSterilizerShellPayload,
  DeploymentSterilizerShellRecord,
} from "./deployment-sterilizer-types";

type DeploymentSterilizerDatabasePayload = {
  clinic_id: string;
  deployment_sterilizer_key: string;
  name: string;
  type: string;
  active: false;
  provisioning_source: "setup_draft";
  provisioning_status: "planned";
  created_at?: string;
};

type DeploymentSterilizerDatabaseRow = DeploymentSterilizerDatabasePayload & {
  id: string;
  clinic_id: string | null;
  deployment_sterilizer_key: string | null;
  name: string;
  type: string | null;
  active: boolean;
  provisioning_source: string | null;
  provisioning_status: "planned" | "active" | "archived";
  created_at: string;
  updated_at?: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentSterilizerRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentSterilizerRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentSterilizerRepository
  implements DeploymentSterilizerRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async findSterilizerByDeploymentKey(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<DeploymentSterilizerShellRecord | null> {
    const { data, error } = await this.client
      .from("sterilizers")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("deployment_sterilizer_key", deploymentSterilizerKey)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapSterilizerRowToRecord(data) : null;
  }

  async createSterilizerShell(
    payload: CreateDeploymentSterilizerShellPayload,
  ): Promise<DeploymentSterilizerShellPersistenceResult> {
    const payloadValidationMessage = validateSterilizerShellPayload(payload);

    if (payloadValidationMessage) {
      return {
        ok: false,
        sterilizer: null,
        message: payloadValidationMessage,
      };
    }

    const existingSterilizer = await this.findSterilizerByDeploymentKey(
      payload.clinicId,
      payload.deploymentSterilizerKey,
    );

    if (existingSterilizer) {
      return resolveExistingSterilizerShell(existingSterilizer);
    }

    const { data, error } = await this.client
      .from("sterilizers")
      .insert(mapCreatePayloadToDatabasePayload(payload))
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return this.resolveCreateConflictAfterUniqueViolation(payload);
      }

      throw toRepositoryError(error);
    }

    return {
      ok: true,
      sterilizer: mapSterilizerRowToRecord(data),
      message: "Sterilizer planned shell provisioned for draft clinic.",
    };
  }

  async listDeploymentSterilizerShells(
    clinicId: string,
  ): Promise<readonly DeploymentSterilizerShellRecord[]> {
    const { data, error } = await this.client
      .from("sterilizers")
      .select("*")
      .eq("clinic_id", clinicId)
      .not("deployment_sterilizer_key", "is", null)
      .order("deployment_sterilizer_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return (data ?? []).map((row) =>
      mapSterilizerRowToRecord(row as DeploymentSterilizerDatabaseRow),
    );
  }

  private async resolveCreateConflictAfterUniqueViolation(
    payload: CreateDeploymentSterilizerShellPayload,
  ): Promise<DeploymentSterilizerShellPersistenceResult> {
    const existingSterilizer = await this.findSterilizerByDeploymentKey(
      payload.clinicId,
      payload.deploymentSterilizerKey,
    );

    if (existingSterilizer) {
      return resolveExistingSterilizerShell(existingSterilizer);
    }

    return {
      ok: false,
      sterilizer: null,
      message:
        "Sterilizer shell unique conflict could not be resolved safely; this may be a global name uniqueness collision.",
    };
  }
}

export function mapCreatePayloadToDatabasePayload(
  payload: CreateDeploymentSterilizerShellPayload,
): DeploymentSterilizerDatabasePayload {
  return {
    clinic_id: payload.clinicId,
    deployment_sterilizer_key: payload.deploymentSterilizerKey,
    name: payload.name,
    type: payload.type,
    active: false,
    provisioning_source: "setup_draft",
    provisioning_status: "planned",
    created_at: payload.createdAt,
  };
}

export function mapSterilizerRowToRecord(
  row: DeploymentSterilizerDatabaseRow,
): DeploymentSterilizerShellRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentSterilizerKey: row.deployment_sterilizer_key,
    name: row.name,
    type: row.type,
    active: row.active,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

function validateSterilizerShellPayload(
  payload: CreateDeploymentSterilizerShellPayload,
): string | null {
  if (!payload.clinicId.trim()) {
    return "Sterilizer shell creation requires a clinic id.";
  }

  if (!payload.deploymentSterilizerKey.trim()) {
    return "Sterilizer shell creation requires a deployment sterilizer key.";
  }

  if (!payload.name.trim()) {
    return "Sterilizer shell creation requires a globally unique name.";
  }

  if (!payload.type.trim()) {
    return "Sterilizer shell creation requires a sterilizer type.";
  }

  if (
    payload.provisioningSource !== "setup_draft" ||
    payload.provisioningStatus !== "planned" ||
    payload.active !== false
  ) {
    return "Sterilizer shell creation accepts only inactive setup_draft planned shells.";
  }

  return null;
}

function resolveExistingSterilizerShell(
  sterilizer: DeploymentSterilizerShellRecord,
): DeploymentSterilizerShellPersistenceResult {
  if (isReusableSterilizerShell(sterilizer)) {
    return {
      ok: true,
      sterilizer,
      message:
        "Sterilizer planned shell already exists for this clinic; reuse it.",
    };
  }

  return {
    ok: false,
    sterilizer,
    message:
      "Sterilizer deployment key is already used by a non-planned sterilizer record.",
  };
}

function isReusableSterilizerShell(
  sterilizer: DeploymentSterilizerShellRecord,
): boolean {
  return (
    sterilizer.clinicId !== null &&
    sterilizer.deploymentSterilizerKey !== null &&
    sterilizer.provisioningSource === "setup_draft" &&
    sterilizer.provisioningStatus === "planned" &&
    sterilizer.active === false
  );
}

function isUniqueViolation(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentSterilizerRepositoryError {
  return new DeploymentSterilizerRepositoryError(
    error.message,
    error.code ?? null,
  );
}
