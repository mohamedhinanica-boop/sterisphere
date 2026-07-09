import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentProviderRepository,
  DeploymentProviderShellPersistenceResult,
} from "./deployment-provider-repository";
import type {
  CreateDeploymentProviderShellPayload,
  DeploymentProviderShellRecord,
} from "./deployment-provider-types";

type DeploymentProviderDatabasePayload = {
  clinic_id: string;
  deployment_provider_key: string;
  provisioning_source: "setup_draft";
  provisioning_status: "placeholder";
  first_name: null;
  last_name: null;
  title: string;
  display_name: string;
  full_name: string;
  role: string;
  active: false;
  created_at?: string;
  updated_at?: string;
};

type DeploymentProviderDatabaseRow = DeploymentProviderDatabasePayload & {
  id: string;
  clinic_id: string | null;
  deployment_provider_key: string | null;
  provisioning_source: string | null;
  provisioning_status: "placeholder" | "active" | "archived";
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  display_name: string | null;
  role: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentProviderRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentProviderRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentProviderRepository
  implements DeploymentProviderRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async findProviderByDeploymentKey(
    clinicId: string,
    deploymentProviderKey: string,
  ): Promise<DeploymentProviderShellRecord | null> {
    const { data, error } = await this.client
      .from("providers")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("deployment_provider_key", deploymentProviderKey)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapProviderRowToRecord(data) : null;
  }

  async createProviderShell(
    payload: CreateDeploymentProviderShellPayload,
  ): Promise<DeploymentProviderShellPersistenceResult> {
    const payloadValidationMessage = validateProviderShellPayload(payload);

    if (payloadValidationMessage) {
      return {
        ok: false,
        provider: null,
        message: payloadValidationMessage,
      };
    }

    const existingProvider = await this.findProviderByDeploymentKey(
      payload.clinicId,
      payload.deploymentProviderKey,
    );

    if (existingProvider) {
      return resolveExistingProviderShell(existingProvider);
    }

    const { data, error } = await this.client
      .from("providers")
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
      provider: mapProviderRowToRecord(data),
      message: "Provider placeholder shell provisioned for draft clinic.",
    };
  }

  async listDeploymentProviderShells(
    clinicId: string,
  ): Promise<readonly DeploymentProviderShellRecord[]> {
    const { data, error } = await this.client
      .from("providers")
      .select("*")
      .eq("clinic_id", clinicId)
      .not("deployment_provider_key", "is", null)
      .order("deployment_provider_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return (data ?? []).map((row) =>
      mapProviderRowToRecord(row as DeploymentProviderDatabaseRow),
    );
  }

  private async resolveCreateConflictAfterUniqueViolation(
    payload: CreateDeploymentProviderShellPayload,
  ): Promise<DeploymentProviderShellPersistenceResult> {
    const existingProvider = await this.findProviderByDeploymentKey(
      payload.clinicId,
      payload.deploymentProviderKey,
    );

    if (existingProvider) {
      return resolveExistingProviderShell(existingProvider);
    }

    return {
      ok: false,
      provider: null,
      message:
        "Provider shell unique conflict could not be resolved safely.",
    };
  }
}

export function mapCreatePayloadToDatabasePayload(
  payload: CreateDeploymentProviderShellPayload,
): DeploymentProviderDatabasePayload {
  return {
    clinic_id: payload.clinicId,
    deployment_provider_key: payload.deploymentProviderKey,
    provisioning_source: "setup_draft",
    provisioning_status: "placeholder",
    first_name: null,
    last_name: null,
    title: payload.title,
    display_name: payload.displayName,
    full_name: payload.fullName,
    role: payload.role,
    active: false,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
  };
}

export function mapProviderRowToRecord(
  row: DeploymentProviderDatabaseRow,
): DeploymentProviderShellRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentProviderKey: row.deployment_provider_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    firstName: row.first_name,
    lastName: row.last_name,
    title: row.title,
    displayName: row.display_name,
    fullName: row.full_name,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateProviderShellPayload(
  payload: CreateDeploymentProviderShellPayload,
): string | null {
  if (!payload.clinicId.trim()) {
    return "Provider shell creation requires a clinic id.";
  }

  if (!payload.deploymentProviderKey.trim()) {
    return "Provider shell creation requires a deployment provider key.";
  }

  if (
    payload.provisioningSource !== "setup_draft" ||
    payload.provisioningStatus !== "placeholder" ||
    payload.active !== false ||
    payload.firstName !== null ||
    payload.lastName !== null
  ) {
    return "Provider shell creation accepts only inactive setup_draft placeholders.";
  }

  return null;
}

function resolveExistingProviderShell(
  provider: DeploymentProviderShellRecord,
): DeploymentProviderShellPersistenceResult {
  if (isReusableProviderShell(provider)) {
    return {
      ok: true,
      provider,
      message:
        "Provider placeholder shell already exists for this clinic; reuse it.",
    };
  }

  return {
    ok: false,
    provider,
    message:
      "Provider deployment key is already used by a non-placeholder provider record.",
  };
}

function isReusableProviderShell(
  provider: DeploymentProviderShellRecord,
): boolean {
  return (
    provider.clinicId !== null &&
    provider.deploymentProviderKey !== null &&
    provider.provisioningSource === "setup_draft" &&
    provider.provisioningStatus === "placeholder" &&
    provider.active === false
  );
}

function isUniqueViolation(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentProviderRepositoryError {
  return new DeploymentProviderRepositoryError(
    error.message,
    error.code ?? null,
  );
}

