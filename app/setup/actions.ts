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
  message: string;
}

const DEPLOYMENT_VERSION = "rc4-provider-shell-provisioning";
const SCHEMA_VERSION = "deployment-run-clinic-root-settings-providers";
const EVIDENCE_VERSION = "deployment-audit-evidence-rc2.5-slice4";
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
        runtimeSlice: "rc4-slice2e",
        boundary: "deployment_run_clinic_root_settings_and_provider_shells",
        clinicRootPersistence: "enabled",
        clinicSettingsProvisioning: "enabled",
        providerShellProvisioning: "enabled",
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
        message:
          "Deployment run, clinic root, and clinic settings are durable, but provider shell provisioning failed safely. No downstream records were created.",
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
      message:
        "Deployment run, draft clinic root, clinic settings, and provider placeholder shells are provisioned. Downstream clinic configuration remains simulated.",
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