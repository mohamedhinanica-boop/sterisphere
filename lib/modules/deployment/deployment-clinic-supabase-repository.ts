import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentClinicPersistenceResult,
  DeploymentClinicRepository,
} from "./deployment-clinic-repository";
import type {
  CreateDeploymentClinicPayload,
  DeploymentClinicLinkCommand,
  DeploymentClinicLinkResult,
  DeploymentClinicRecord,
  DeploymentClinicStatus,
} from "./deployment-clinic-types";
import {
  mapDeploymentRunRowToRecord,
} from "./deployment-run-supabase-repository";

type DeploymentClinicDatabasePayload = {
  name: string;
  legal_name: string | null;
  clinic_code: string;
  country: string;
  province_state: string;
  timezone: string;
  primary_language: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  deployment_status: "draft";
  deployed_at: null;
  deployment_version?: string;
  schema_version?: string;
  created_at?: string;
  updated_at?: string;
};

type DeploymentClinicDatabaseRow = Omit<
  DeploymentClinicDatabasePayload,
  "deployment_version" | "schema_version" | "created_at" | "updated_at"
> & {
  id: string;
  deployment_status: DeploymentClinicStatus;
  deployment_version: string | null;
  schema_version: string | null;
  created_at: string;
  updated_at: string;
};

interface DeploymentRunLinkRow {
  clinic_id: string | null;
}

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentClinicRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentClinicRepositoryError";
    this.code = code;
  }
}

export class DeploymentClinicCodeConflictError extends DeploymentClinicRepositoryError {
  readonly existingClinic: DeploymentClinicRecord | null;

  constructor(
    message: string,
    existingClinic: DeploymentClinicRecord | null,
  ) {
    super(message, "deployment_clinic_code_conflict");
    this.name = "DeploymentClinicCodeConflictError";
    this.existingClinic = existingClinic;
  }
}

export class DeploymentClinicLinkConflictError extends DeploymentClinicRepositoryError {
  constructor(message: string) {
    super(message, "deployment_clinic_link_conflict");
    this.name = "DeploymentClinicLinkConflictError";
  }
}

export class SupabaseDeploymentClinicRepository
  implements DeploymentClinicRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async findClinicById(
    clinicId: string,
  ): Promise<DeploymentClinicRecord | null> {
    const { data, error } = await this.client
      .from("clinics")
      .select("*")
      .eq("id", clinicId)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapClinicRowToRecord(data) : null;
  }

  async findClinicByCode(
    clinicCode: string,
  ): Promise<DeploymentClinicRecord | null> {
    const { data, error } = await this.client
      .from("clinics")
      .select("*")
      .eq("clinic_code", clinicCode)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapClinicRowToRecord(data) : null;
  }

  async createClinic(
    payload: CreateDeploymentClinicPayload,
  ): Promise<DeploymentClinicPersistenceResult> {
    const existingClinic = await this.findClinicByCode(payload.clinicCode);

    if (existingClinic) {
      throw new DeploymentClinicCodeConflictError(
        "Clinic code already belongs to an existing clinic root.",
        existingClinic,
      );
    }

    const { data, error } = await this.client
      .from("clinics")
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
      clinic: mapClinicRowToRecord(data),
      message: "Clinic root created in draft state.",
    };
  }

  async linkClinicToDeploymentRun(
    command: DeploymentClinicLinkCommand,
  ): Promise<DeploymentClinicLinkResult> {
    const existingRun = await this.findDeploymentRunLink(
      command.deploymentRunId,
    );

    if (!existingRun) {
      return {
        ok: false,
        status: "rejected",
        clinic: null,
        deploymentRun: null,
        message: "Deployment run was not found for clinic root linking.",
      };
    }

    const clinic = await this.findClinicById(command.clinicId);

    if (!clinic) {
      return {
        ok: false,
        status: "rejected",
        clinic: null,
        deploymentRun: null,
        message: "Clinic root was not found for deployment run linking.",
      };
    }

    if (existingRun.clinic_id === command.clinicId) {
      const deploymentRun = await this.findDeploymentRunRecord(
        command.deploymentRunId,
      );

      return {
        ok: Boolean(deploymentRun),
        status: deploymentRun ? "reused" : "rejected",
        clinic,
        deploymentRun,
        message: deploymentRun
          ? "Deployment run already links to this clinic root."
          : "Deployment run link could not be reloaded.",
      };
    }

    if (existingRun.clinic_id) {
      throw new DeploymentClinicLinkConflictError(
        "Deployment run already links to a different clinic root.",
      );
    }

    const { data, error } = await this.client
      .from("deployment_runs")
      .update({ clinic_id: command.clinicId })
      .eq("deployment_run_id", command.deploymentRunId)
      .is("clinic_id", null)
      .select("*")
      .single();

    if (error) {
      throw toRepositoryError(error);
    }

    return {
      ok: true,
      status: "linked",
      clinic,
      deploymentRun: mapDeploymentRunRowToRecord(
        data as Parameters<typeof mapDeploymentRunRowToRecord>[0],
      ),
      message: "Deployment run linked to clinic root.",
    };
  }

  private async resolveCreateConflictAfterUniqueViolation(
    payload: CreateDeploymentClinicPayload,
  ): Promise<DeploymentClinicPersistenceResult> {
    const existingClinic = await this.findClinicByCode(payload.clinicCode);

    throw new DeploymentClinicCodeConflictError(
      "Clinic code already belongs to an existing clinic root.",
      existingClinic,
    );
  }

  private async findDeploymentRunLink(
    deploymentRunId: string,
  ): Promise<DeploymentRunLinkRow | null> {
    const { data, error } = await this.client
      .from("deployment_runs")
      .select("clinic_id")
      .eq("deployment_run_id", deploymentRunId)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data;
  }

  private async findDeploymentRunRecord(
    deploymentRunId: string,
  ): Promise<DeploymentClinicLinkResult["deploymentRun"]> {
    const { data, error } = await this.client
      .from("deployment_runs")
      .select("*")
      .eq("deployment_run_id", deploymentRunId)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data
      ? mapDeploymentRunRowToRecord(
          data as Parameters<typeof mapDeploymentRunRowToRecord>[0],
        )
      : null;
  }
}

export function mapCreatePayloadToDatabasePayload(
  payload: CreateDeploymentClinicPayload,
): DeploymentClinicDatabasePayload {
  return {
    name: payload.name,
    legal_name: payload.legalName,
    clinic_code: payload.clinicCode,
    country: payload.country,
    province_state: payload.provinceState,
    timezone: payload.timezone,
    primary_language: payload.primaryLanguage,
    phone: payload.phone,
    email: payload.email,
    website: payload.website,
    address_street: payload.addressStreet,
    address_city: payload.addressCity,
    address_postal_code: payload.addressPostalCode,
    deployment_status: "draft",
    deployed_at: null,
    deployment_version: payload.deploymentVersion,
    schema_version: payload.schemaVersion,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
  };
}

export function mapClinicRowToRecord(
  row: DeploymentClinicDatabaseRow,
): DeploymentClinicRecord {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    clinicCode: row.clinic_code,
    country: row.country,
    provinceState: row.province_state,
    timezone: row.timezone,
    primaryLanguage: row.primary_language,
    phone: row.phone,
    email: row.email,
    website: row.website,
    addressStreet: row.address_street,
    addressCity: row.address_city,
    addressPostalCode: row.address_postal_code,
    deploymentStatus: row.deployment_status,
    deployedAt: row.deployed_at,
    deploymentVersion: row.deployment_version,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentClinicRepositoryError {
  return new DeploymentClinicRepositoryError(
    error.message,
    error.code ?? null,
  );
}
