import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentClinicSettingsPersistenceResult,
  DeploymentClinicSettingsRepository,
} from "./deployment-clinic-settings-repository";
import type {
  CreateDeploymentClinicSettingsPayload,
  DeploymentClinicSettingsRecord,
} from "./deployment-clinic-settings-types";

type DeploymentClinicSettingsDatabasePayload = {
  clinic_id: string;
  clinic_name: string | null;
  clinic_address: string | null;
  clinic_phone: string | null;
  clinic_email: string | null;
  pack_expiration_days: number;
  auto_print_labels: boolean;
  sound_alerts_enabled: boolean;
  sound_alert_cycle_complete: boolean;
  sound_alert_cycle_overdue: boolean;
  sound_alert_failed_cycle: boolean;
  sound_alert_expiring_packs: boolean;
  sound_alert_expired_packs: boolean;
  created_at?: string;
  updated_at?: string;
};

type DeploymentClinicSettingsDatabaseRow =
  DeploymentClinicSettingsDatabasePayload & {
    id: string;
    pack_expiration_days: number | null;
    auto_print_labels: boolean | null;
    created_at: string;
    updated_at: string | null;
  };

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentClinicSettingsRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentClinicSettingsRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentClinicSettingsRepository
  implements DeploymentClinicSettingsRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async clinicExists(clinicId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("clinics")
      .select("id")
      .eq("id", clinicId)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return Boolean(data);
  }

  async findSettingsByClinicId(
    clinicId: string,
  ): Promise<DeploymentClinicSettingsRecord | null> {
    const { data, error } = await this.client
      .from("clinic_settings")
      .select("*")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapSettingsRowToRecord(data) : null;
  }

  async createSettings(
    payload: CreateDeploymentClinicSettingsPayload,
  ): Promise<DeploymentClinicSettingsPersistenceResult> {
    const existingSettings = await this.findSettingsByClinicId(
      payload.clinicId,
    );

    if (existingSettings) {
      return {
        ok: true,
        settings: existingSettings,
        message: "Clinic settings already exist for this clinic; reuse them.",
      };
    }

    const { data, error } = await this.client
      .from("clinic_settings")
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
      settings: mapSettingsRowToRecord(data),
      message: "Clinic settings provisioned for draft clinic.",
    };
  }

  private async resolveCreateConflictAfterUniqueViolation(
    payload: CreateDeploymentClinicSettingsPayload,
  ): Promise<DeploymentClinicSettingsPersistenceResult> {
    const existingSettings = await this.findSettingsByClinicId(
      payload.clinicId,
    );

    return {
      ok: Boolean(existingSettings),
      settings: existingSettings,
      message: existingSettings
        ? "Clinic settings already exist for this clinic; reuse them."
        : "Clinic settings unique conflict could not be resolved safely.",
    };
  }
}

export function mapCreatePayloadToDatabasePayload(
  payload: CreateDeploymentClinicSettingsPayload,
): DeploymentClinicSettingsDatabasePayload {
  return {
    clinic_id: payload.clinicId,
    clinic_name: payload.clinicName,
    clinic_address: payload.clinicAddress,
    clinic_phone: payload.clinicPhone,
    clinic_email: payload.clinicEmail,
    pack_expiration_days: payload.packExpirationDays,
    auto_print_labels: payload.autoPrintLabels,
    sound_alerts_enabled: payload.soundAlertsEnabled,
    sound_alert_cycle_complete: payload.soundAlertCycleComplete,
    sound_alert_cycle_overdue: payload.soundAlertCycleOverdue,
    sound_alert_failed_cycle: payload.soundAlertFailedCycle,
    sound_alert_expiring_packs: payload.soundAlertExpiringPacks,
    sound_alert_expired_packs: payload.soundAlertExpiredPacks,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
  };
}

export function mapSettingsRowToRecord(
  row: DeploymentClinicSettingsDatabaseRow,
): DeploymentClinicSettingsRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    clinicName: row.clinic_name,
    clinicAddress: row.clinic_address,
    clinicPhone: row.clinic_phone,
    clinicEmail: row.clinic_email,
    packExpirationDays: row.pack_expiration_days,
    autoPrintLabels: row.auto_print_labels,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentClinicSettingsRepositoryError {
  return new DeploymentClinicSettingsRepositoryError(
    error.message,
    error.code ?? null,
  );
}
