"use server";

import { createClient } from "@supabase/supabase-js";
import {
  buildDeploymentAuditEvidenceEnvelope,
} from "@/lib/modules/deployment/deployment-audit-evidence";
import {
  hashDeploymentDraftInput,
  type DeploymentDraft,
} from "@/lib/modules/deployment/deployment-draft";
import { validateDeploymentDraft } from "@/lib/modules/deployment/deployment-draft-validation";
import { simulateDeployment } from "@/lib/modules/deployment/deployment-engine";
import {
  createClinicRootForServerDeploymentRun,
} from "@/lib/modules/deployment/deployment-clinic-server";
import {
  provisionClinicSettingsForServerDeployment,
} from "@/lib/modules/deployment/deployment-clinic-settings-server";
import {
  provisionProviderShellsForServerDeployment,
} from "@/lib/modules/deployment/deployment-provider-server";
import {
  createOrReuseServerDeploymentRun,
} from "@/lib/modules/deployment/deployment-run-server";
import {
  provisionSterilizerShellsForServerDeployment,
} from "@/lib/modules/deployment/deployment-sterilizer-server";
import {
  provisionWorkstationShellsForServerDeployment,
} from "@/lib/modules/deployment/deployment-workstation-server";
import {
  provisionHardwareShellsForServerDeployment,
} from "@/lib/modules/deployment/deployment-hardware-server";
import {
  provisionHardwareAssignmentsForServerDeployment,
} from "@/lib/modules/deployment/deployment-hardware-assignment-server";

export type PersistDeploymentRunActionStatus =
  | "created"
  | "reused"
  | "conflict"
  | "rejected"
  | "error";

export type ClinicRootActionStatus =
  | "created"
  | "linked"
  | "reused"
  | "conflict"
  | "rejected"
  | "error"
  | "skipped";

export interface ClinicRootActionResult {
  ok: boolean;
  status: ClinicRootActionStatus;
  clinicId: string | null;
  message: string;
}

export type ClinicSettingsActionStatus =
  | "created"
  | "reused"
  | "conflict"
  | "rejected"
  | "error"
  | "skipped";

export interface ClinicSettingsActionResult {
  ok: boolean;
  status: ClinicSettingsActionStatus;
  settingsId: string | null;
  clinicId: string | null;
  message: string;
}

export type ProviderShellsActionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected"
  | "error"
  | "skipped";

export interface ProviderShellsActionResult {
  ok: boolean;
  status: ProviderShellsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export type SterilizerShellsActionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected"
  | "error"
  | "skipped";

export interface SterilizerShellsActionResult {
  ok: boolean;
  status: SterilizerShellsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export type WorkstationShellsActionStatus = SterilizerShellsActionStatus;

export interface WorkstationShellsActionResult {
  ok: boolean;
  status: WorkstationShellsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export type HardwareShellsActionStatus = SterilizerShellsActionStatus;

export interface HardwareShellsActionResult {
  ok: boolean;
  status: HardwareShellsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export type HardwareAssignmentsActionStatus = SterilizerShellsActionStatus;

export interface HardwareAssignmentsActionResult {
  ok: boolean;
  status: HardwareAssignmentsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export interface PersistDeploymentRunActionResult {
  ok: boolean;
  status: PersistDeploymentRunActionStatus;
  deploymentRunId: string | null;
  deploymentSessionId: string | null;
  idempotencyKey: string | null;
  payloadHash: string | null;
  clinicRoot: ClinicRootActionResult;
  clinicSettings: ClinicSettingsActionResult;
  providerShells: ProviderShellsActionResult;
  sterilizerShells: SterilizerShellsActionResult;
  workstationShells: WorkstationShellsActionResult;
  hardwareShells: HardwareShellsActionResult;
  hardwareAssignments: HardwareAssignmentsActionResult;
  message: string;
}

const DEPLOYMENT_VERSION = "rc6-hardware-assignment-provisioning";
const SCHEMA_VERSION = "deployment-run-clinic-root-settings-providers-sterilizers-workstations-hardware-assignments";
const EVIDENCE_VERSION = "deployment-audit-evidence-rc6-slice1d";
const CLINIC_ROOT_NOT_ATTEMPTED: ClinicRootActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  message: "Clinic root persistence was not attempted.",
};
const CLINIC_SETTINGS_NOT_ATTEMPTED: ClinicSettingsActionResult = {
  ok: false,
  status: "skipped",
  settingsId: null,
  clinicId: null,
  message: "Clinic settings provisioning was not attempted.",
};
const PROVIDER_SHELLS_NOT_ATTEMPTED: ProviderShellsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Provider shell provisioning was not attempted.",
};
const STERILIZER_SHELLS_NOT_ATTEMPTED: SterilizerShellsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Sterilizer shell provisioning was not attempted.",
};
const WORKSTATION_SHELLS_NOT_ATTEMPTED: WorkstationShellsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Workstation shell provisioning was not attempted.",
};
const HARDWARE_SHELLS_NOT_ATTEMPTED: HardwareShellsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Hardware shell provisioning was not attempted.",
};
const HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED: HardwareAssignmentsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Hardware assignment provisioning was not attempted.",
};

export async function persistDeploymentRunAction(
  draft: DeploymentDraft,
  deploymentSessionId: string,
): Promise<PersistDeploymentRunActionResult> {
  const validation = validateDeploymentDraft(draft);
  const normalizedDeploymentSessionId = normalizeDeploymentSessionId(
    deploymentSessionId,
  );

  if (!validation.valid) {
    return {
      ok: false,
      status: "rejected",
      deploymentRunId: null,
      deploymentSessionId: normalizedDeploymentSessionId,
      idempotencyKey: null,
      payloadHash: null,
      clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
      clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
      providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
      sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
      workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
      hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
      hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
      message:
        "Deployment run was not persisted because the reviewed draft is incomplete.",
    };
  }

  if (!normalizedDeploymentSessionId) {
    return {
      ok: false,
      status: "rejected",
      deploymentRunId: null,
      deploymentSessionId: null,
      idempotencyKey: null,
      payloadHash: null,
      clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
      clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
      providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
      sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
      workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
      hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
      hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
      message:
        "Deployment run was not persisted because the setup session identity is missing.",
    };
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      status: "error",
      deploymentRunId: null,
      deploymentSessionId: normalizedDeploymentSessionId,
      idempotencyKey: null,
      payloadHash: null,
      clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
      clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
      providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
      sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
      workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
      hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
      hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
      message:
        "Deployment run persistence is not configured on the server.",
    };
  }

  const persistedAt = new Date().toISOString();
  const payloadHash = hashDeploymentDraftInput(draft);
  const deploymentKey = normalizedDeploymentSessionId;
  const idempotencyKey = `setup-deployment-session:${deploymentKey}`;
  const deploymentRunId = `deployment-run-${deploymentKey}`;
  const simulation = simulateDeployment(draft, {
    repositoryContext: {
      deploymentRunId,
      idempotencyKey,
      timestamp: persistedAt,
      deploymentVersion: DEPLOYMENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
    },
  });
  const auditEvidence = normalizeAuditEvidence(
    buildDeploymentAuditEvidenceEnvelope({
      draft,
      execution: simulation,
      generatedAt: persistedAt,
      evidenceVersion: EVIDENCE_VERSION,
    }),
    {
      deploymentRunId,
      payloadHash,
    },
  );
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const result = await createOrReuseServerDeploymentRun(client, {
      deploymentRunId,
      clinicId: null,
      idempotencyKey,
      payloadHash,
      draft,
      auditEvidence,
      lifecycleSummary: simulation.lifecycleSummary ?? null,
      createdAt: persistedAt,
      deploymentVersion: DEPLOYMENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      evidenceVersion: EVIDENCE_VERSION,
      metadata: {
        source: "setup_wizard_complete",
        runtimeSlice: "rc6-slice1d",
        boundary: "deployment_run_clinic_root_settings_provider_sterilizer_workstation_hardware_shells_and_assignments",
        clinicRootPersistence: "enabled",
        clinicSettingsProvisioning: "enabled",
        providerShellProvisioning: "enabled",
        sterilizerShellProvisioning: "enabled",
        workstationShellProvisioning: "enabled",
        hardwareShellProvisioning: "enabled",
        hardwareAssignmentProvisioning: "enabled",
        clinicConfigurationSimulated: true,
        deploymentSessionId: normalizedDeploymentSessionId,
        clinicCode: draft.clinicProfile.clinicCode || null,
      },
    });

    if (result.status === "conflict") {
      return {
        ok: false,
        status: "conflict",
        deploymentRunId: result.deploymentRun?.deploymentRunId ?? null,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
        clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        message:
          "This deployment session already has a run for a different reviewed draft. No clinic data was created.",
      };
    }

    if (!result.ok || !result.deploymentRun) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun?.deploymentRunId ?? null,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
        clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        message: result.message,
      };
    }

    const clinicRoot = await createClinicRootForServerDeploymentRun(client, {
      deploymentRunId: result.deploymentRun.deploymentRunId,
      draft,
      createdAt: persistedAt,
      deploymentVersion: DEPLOYMENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });

    if (!clinicRoot.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: false,
          status: clinicRoot.status,
          clinicId: clinicRoot.clinic?.id ?? null,
          message:
            clinicRoot.status === "conflict"
              ? "Clinic root was not linked because this clinic code is already assigned to another deployment session."
              : clinicRoot.message,
        },
        clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        message:
          "Deployment run persisted, but clinic root persistence failed safely. The deployment_run remains durable evidence; no downstream records were created.",
      };
    }

    const clinicId = clinicRoot.clinic?.id ?? null;

    if (!clinicId) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId: null,
          message: "Clinic root persisted but no clinic id was returned.",
        },
        clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        message:
          "Deployment run and clinic root persisted, but clinic settings provisioning failed safely. No downstream records were created.",
      };
    }

    const clinicSettings =
      await provisionClinicSettingsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!clinicSettings.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: false,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message: clinicSettings.message,
        },
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        message:
          "Deployment run and clinic root persisted, but clinic settings provisioning failed safely. No rollback was performed.",
      };
    }

    const providerShells =
      await provisionProviderShellsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!providerShells.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: false,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message: providerShells.message,
        },
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        message:
          "Deployment run, clinic root, and clinic settings are durable, but provider shell provisioning failed safely. No downstream records were created.",
      };
    }

    const sterilizerShells =
      await provisionSterilizerShellsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!sterilizerShells.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: true,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message:
            providerShells.status === "reused"
              ? "Provider placeholder shells already exist for this clinic; reuse them."
              : "Provider placeholder shells provisioned for this draft clinic.",
        },
        sterilizerShells: {
          ok: false,
          status: sterilizerShells.status,
          clinicId,
          requested: sterilizerShells.counts.requested,
          created: sterilizerShells.counts.created,
          reused: sterilizerShells.counts.reused,
          skipped: sterilizerShells.counts.skipped,
          conflicts: sterilizerShells.counts.conflicts,
          message: sterilizerShells.message,
        },
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        message:
          "Deployment run, clinic root, clinic settings, and provider shells are durable, but sterilizer shell provisioning failed safely. No downstream records were created.",
      };
    }

    const workstationShells =
      await provisionWorkstationShellsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!workstationShells.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: true,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message:
            providerShells.status === "reused"
              ? "Provider placeholder shells already exist for this clinic; reuse them."
              : "Provider placeholder shells provisioned for this draft clinic.",
        },
        sterilizerShells: {
          ok: true,
          status: sterilizerShells.status,
          clinicId,
          requested: sterilizerShells.counts.requested,
          created: sterilizerShells.counts.created,
          reused: sterilizerShells.counts.reused,
          skipped: sterilizerShells.counts.skipped,
          conflicts: sterilizerShells.counts.conflicts,
          message:
            sterilizerShells.status === "reused"
              ? "Sterilizer planned shells already exist for this clinic; reuse them."
              : "Sterilizer planned shells provisioned for this draft clinic.",
        },
        workstationShells: {
          ok: false,
          status: workstationShells.status,
          clinicId,
          requested: workstationShells.counts.requested,
          created: workstationShells.counts.created,
          reused: workstationShells.counts.reused,
          skipped: workstationShells.counts.skipped,
          conflicts: workstationShells.counts.conflicts,
          message: workstationShells.message,
        },
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        message:
          "Deployment run, clinic root, clinic settings, provider shells, and sterilizer shells are durable, but workstation shell provisioning failed safely. No downstream records were created.",
      };
    }
    const hardwareShells = await provisionHardwareShellsForServerDeployment(
      client,
      {
        clinicId,
        draft,
        createdAt: persistedAt,
      },
    );

    if (!hardwareShells.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: true,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message:
            providerShells.status === "reused"
              ? "Provider placeholder shells already exist for this clinic; reuse them."
              : "Provider placeholder shells provisioned for this draft clinic.",
        },
        sterilizerShells: {
          ok: true,
          status: sterilizerShells.status,
          clinicId,
          requested: sterilizerShells.counts.requested,
          created: sterilizerShells.counts.created,
          reused: sterilizerShells.counts.reused,
          skipped: sterilizerShells.counts.skipped,
          conflicts: sterilizerShells.counts.conflicts,
          message:
            sterilizerShells.status === "reused"
              ? "Sterilizer planned shells already exist for this clinic; reuse them."
              : "Sterilizer planned shells provisioned for this draft clinic.",
        },
        workstationShells: {
          ok: true,
          status: workstationShells.status,
          clinicId,
          requested: workstationShells.counts.requested,
          created: workstationShells.counts.created,
          reused: workstationShells.counts.reused,
          skipped: workstationShells.counts.skipped,
          conflicts: workstationShells.counts.conflicts,
          message:
            workstationShells.status === "reused"
              ? "Workstation planned shells already exist for this clinic; reuse them."
              : "Workstation planned shells provisioned for this draft clinic.",
        },
        hardwareShells: {
          ok: false,
          status: hardwareShells.status,
          clinicId,
          requested: hardwareShells.counts.requested,
          created: hardwareShells.counts.created,
          reused: hardwareShells.counts.reused,
          skipped: hardwareShells.counts.skipped,
          conflicts: hardwareShells.counts.conflicts,
          message: hardwareShells.message,
        },
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        message:
          "Deployment run, clinic root, clinic settings, provider shells, sterilizer shells, and workstation shells are durable, but hardware shell provisioning failed safely. No downstream records were created.",
      };
    }

    const hardwareAssignments =
      await provisionHardwareAssignmentsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!hardwareAssignments.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: true,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message:
            providerShells.status === "reused"
              ? "Provider placeholder shells already exist for this clinic; reuse them."
              : "Provider placeholder shells provisioned for this draft clinic.",
        },
        sterilizerShells: {
          ok: true,
          status: sterilizerShells.status,
          clinicId,
          requested: sterilizerShells.counts.requested,
          created: sterilizerShells.counts.created,
          reused: sterilizerShells.counts.reused,
          skipped: sterilizerShells.counts.skipped,
          conflicts: sterilizerShells.counts.conflicts,
          message:
            sterilizerShells.status === "reused"
              ? "Sterilizer planned shells already exist for this clinic; reuse them."
              : "Sterilizer planned shells provisioned for this draft clinic.",
        },
        workstationShells: {
          ok: true,
          status: workstationShells.status,
          clinicId,
          requested: workstationShells.counts.requested,
          created: workstationShells.counts.created,
          reused: workstationShells.counts.reused,
          skipped: workstationShells.counts.skipped,
          conflicts: workstationShells.counts.conflicts,
          message:
            workstationShells.status === "reused"
              ? "Workstation planned shells already exist for this clinic; reuse them."
              : "Workstation planned shells provisioned for this draft clinic.",
        },
        hardwareShells: {
          ok: true,
          status: hardwareShells.status,
          clinicId,
          requested: hardwareShells.counts.requested,
          created: hardwareShells.counts.created,
          reused: hardwareShells.counts.reused,
          skipped: hardwareShells.counts.skipped,
          conflicts: hardwareShells.counts.conflicts,
          message:
            hardwareShells.status === "reused"
              ? "Hardware planned shells already exist for this clinic; reuse them."
              : "Hardware planned shells provisioned for this draft clinic.",
        },
        hardwareAssignments: {
          ok: false,
          status: hardwareAssignments.status,
          clinicId,
          requested: hardwareAssignments.counts.requested,
          created: hardwareAssignments.counts.created,
          reused: hardwareAssignments.counts.reused,
          skipped: hardwareAssignments.counts.skipped,
          conflicts: hardwareAssignments.counts.conflicts,
          message: hardwareAssignments.message,
        },
        message:
          "Deployment run, clinic root, clinic settings, provider shells, sterilizer shells, workstation shells, and hardware shells are durable, but hardware assignment provisioning failed safely. No downstream records were created.",
      };
    }
    return {
      ok: true,
      status: result.status,
      deploymentRunId: result.deploymentRun.deploymentRunId,
      deploymentSessionId: normalizedDeploymentSessionId,
      idempotencyKey,
      payloadHash,
      clinicRoot: {
        ok: true,
        status: clinicRoot.status,
        clinicId,
        message:
          clinicRoot.status === "reused"
            ? "Draft clinic root reused and linked to this deployment run."
            : "Draft clinic root persisted and linked to this deployment run.",
      },
      clinicSettings: {
        ok: true,
        status: clinicSettings.status,
        settingsId: clinicSettings.settings?.id ?? null,
        clinicId,
        message:
          clinicSettings.status === "reused"
            ? "Clinic settings already exist for this clinic; reuse them."
            : "Clinic settings provisioned for this draft clinic.",
      },
      providerShells: {
        ok: true,
        status: providerShells.status,
        clinicId,
        requested: providerShells.counts.requested,
        created: providerShells.counts.created,
        reused: providerShells.counts.reused,
        skipped: providerShells.counts.skipped,
        conflicts: providerShells.counts.conflicts,
        message:
          providerShells.status === "reused"
            ? "Provider placeholder shells already exist for this clinic; reuse them."
            : "Provider placeholder shells provisioned for this draft clinic.",
      },
      sterilizerShells: {
        ok: true,
        status: sterilizerShells.status,
        clinicId,
        requested: sterilizerShells.counts.requested,
        created: sterilizerShells.counts.created,
        reused: sterilizerShells.counts.reused,
        skipped: sterilizerShells.counts.skipped,
        conflicts: sterilizerShells.counts.conflicts,
        message:
          sterilizerShells.status === "reused"
            ? "Sterilizer planned shells already exist for this clinic; reuse them."
            : "Sterilizer planned shells provisioned for this draft clinic.",
      },
      workstationShells: {
        ok: true,
        status: workstationShells.status,
        clinicId,
        requested: workstationShells.counts.requested,
        created: workstationShells.counts.created,
        reused: workstationShells.counts.reused,
        skipped: workstationShells.counts.skipped,
        conflicts: workstationShells.counts.conflicts,
        message:
          workstationShells.status === "reused"
            ? "Workstation planned shells already exist for this clinic; reuse them."
            : "Workstation planned shells provisioned for this draft clinic.",
      },
      hardwareShells: {
        ok: true,
        status: hardwareShells.status,
        clinicId,
        requested: hardwareShells.counts.requested,
        created: hardwareShells.counts.created,
        reused: hardwareShells.counts.reused,
        skipped: hardwareShells.counts.skipped,
        conflicts: hardwareShells.counts.conflicts,
        message:
          hardwareShells.status === "reused"
            ? "Hardware planned shells already exist for this clinic; reuse them."
            : "Hardware planned shells provisioned for this draft clinic.",
      },
      hardwareAssignments: {
        ok: true,
        status: hardwareAssignments.status,
        clinicId,
        requested: hardwareAssignments.counts.requested,
        created: hardwareAssignments.counts.created,
        reused: hardwareAssignments.counts.reused,
        skipped: hardwareAssignments.counts.skipped,
        conflicts: hardwareAssignments.counts.conflicts,
        message:
          hardwareAssignments.status === "reused"
            ? "Hardware planned assignments already exist for this clinic; reuse them."
            : "Hardware planned assignments provisioned for this draft clinic.",
      },
      message:
        "Deployment run, draft clinic root, clinic settings, provider placeholder shells, sterilizer planned shells, workstation planned shells, hardware planned shells, and hardware planned assignments are provisioned. Pack, cycle, trace, user, audit, binding, and activation provisioning remains simulated.",
    };
  } catch {
    return {
      ok: false,
      status: "error",
      deploymentRunId,
      deploymentSessionId: normalizedDeploymentSessionId,
      idempotencyKey,
      payloadHash,
      clinicRoot: {
        ok: false,
        status: "error",
        clinicId: null,
        message:
          "Clinic root may be unlinked or unavailable. The deployment_run remains durable evidence and no downstream records were created.",
      },
      clinicSettings: {
        ok: false,
        status: "error",
        settingsId: null,
        clinicId: null,
        message:
          "Clinic settings may be unlinked or unavailable. No rollback was performed.",
      },
      providerShells: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Provider shell provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      sterilizerShells: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Sterilizer shell provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      workstationShells: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Workstation shell provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      hardwareShells: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Hardware shell provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      hardwareAssignments: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Hardware assignment provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      message:
        "Deployment runtime persistence failed safely. No downstream records were created.",
    };
  }
}

function normalizeDeploymentSessionId(
  deploymentSessionId: string | null | undefined,
): string {
  return (deploymentSessionId ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAuditEvidence(
  evidence: ReturnType<typeof buildDeploymentAuditEvidenceEnvelope>,
  input: {
    deploymentRunId: string;
    payloadHash: string;
  },
): ReturnType<typeof buildDeploymentAuditEvidenceEnvelope> {
  return {
    ...evidence,
    subject: {
      ...evidence.subject,
      clinicId: null,
      deploymentRunId: input.deploymentRunId,
      payloadHash: input.payloadHash,
    },
    integrity: {
      ...evidence.integrity,
      payloadHash: input.payloadHash,
    },
  };
}