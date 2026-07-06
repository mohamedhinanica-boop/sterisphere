import type { DeploymentSimulationContext } from "./deployment-execution";
import {
  buildCreateAuditEntryPayload,
  buildCreateClinicPayload,
  buildCreateClinicSettingsPayload,
  buildCreateDeploymentRunPayload,
  buildCreateHardwarePlanPayload,
  buildCreateProviderPlanPayload,
  buildCreateSterilizersPayload,
  buildCreateWorkstationsPayload,
  buildMarkDeploymentCompletedPayload,
  buildRollbackDeploymentPayload,
} from "./repositories";
import {
  DeploymentStage,
  type DeploymentStage as DeploymentStageId,
} from "./deployment-types";

export interface DeploymentDryRunPayloadMetadata {
  payloadType: string | null;
  payloadSummary: string;
  payloadGenerated: boolean;
}

export function buildStageDryRunPayload(
  stage: DeploymentStageId,
  context: DeploymentSimulationContext,
): DeploymentDryRunPayloadMetadata {
  const { draft, repositoryBuildContext } = context;
  const clinicId = requireSimulatedValue(
    repositoryBuildContext.clinicId,
    "clinicId",
  );
  const deploymentRunId = requireSimulatedValue(
    repositoryBuildContext.deploymentRunId,
    "deploymentRunId",
  );

  switch (stage) {
    case DeploymentStage.CREATE_RUN: {
      const payload = buildCreateDeploymentRunPayload(
        draft,
        repositoryBuildContext,
      );
      return generated(
        "CreateDeploymentRunPayload",
        `Run ${payload.idempotencyKey} for draft ${payload.draftVersion}.`,
      );
    }
    case DeploymentStage.CREATE_CLINIC: {
      const payload = buildCreateClinicPayload(
        draft,
        repositoryBuildContext,
      );
      return generated(
        "CreateClinicPayload",
        `Clinic ${payload.name || "Unnamed clinic"} (${payload.clinicCode || "no code"}).`,
      );
    }
    case DeploymentStage.CREATE_SETTINGS: {
      const payload = buildCreateClinicSettingsPayload(draft, clinicId);
      return generated(
        "CreateClinicSettingsPayload",
        `Settings for ${payload.timezone || "unspecified time zone"}.`,
      );
    }
    case DeploymentStage.CREATE_WORKSTATIONS: {
      const payload = buildCreateWorkstationsPayload(draft, clinicId);
      return generated(
        "CreateWorkstationsPayload",
        `${payload.workstations.length} workstation records.`,
      );
    }
    case DeploymentStage.CREATE_STERILIZERS: {
      const payload = buildCreateSterilizersPayload(draft, clinicId);
      return generated(
        "CreateSterilizersPayload",
        `${payload.sterilizers.length} sterilizer records.`,
      );
    }
    case DeploymentStage.CREATE_PLANNING: {
      const providerPayload = buildCreateProviderPlanPayload(
        draft,
        clinicId,
      );
      const hardwarePayload = buildCreateHardwarePlanPayload(
        draft,
        clinicId,
      );
      const providerCount = Object.values(
        providerPayload.providerPlan,
      )
        .filter((value): value is number => typeof value === "number")
        .reduce((total, count) => total + count, 0);

      return generated(
        "CreateProviderPlanPayload + CreateHardwarePlanPayload",
        `${providerCount} planned staff, ${hardwarePayload.hardwarePlan.labelPrinters} printers, ${hardwarePayload.hardwarePlan.usbScanners} scanners.`,
      );
    }
    case DeploymentStage.AUDIT: {
      const payload = buildCreateAuditEntryPayload(
        draft,
        clinicId,
        deploymentRunId,
        repositoryBuildContext,
      );
      return generated(
        "CreateAuditEntryPayload",
        `Audit action ${payload.action}.`,
      );
    }
    case DeploymentStage.FINALIZE: {
      const payload = buildMarkDeploymentCompletedPayload(
        clinicId,
        deploymentRunId,
        repositoryBuildContext,
      );
      return generated(
        "MarkDeploymentCompletedPayload",
        `Clinic status ${payload.deploymentStatus}.`,
      );
    }
    default:
      return notGenerated();
  }
}

export function buildRollbackDryRunPayload(
  context: DeploymentSimulationContext,
  failedStage: DeploymentStageId,
  completedStages: readonly DeploymentStageId[],
): DeploymentDryRunPayloadMetadata {
  const clinicId = requireSimulatedValue(
    context.repositoryBuildContext.clinicId,
    "clinicId",
  );
  const deploymentRunId = requireSimulatedValue(
    context.repositoryBuildContext.deploymentRunId,
    "deploymentRunId",
  );
  const payload = buildRollbackDeploymentPayload(
    clinicId,
    deploymentRunId,
    failedStage,
    {
      timestamp: context.repositoryBuildContext.timestamp,
      completedStages,
    },
  );

  return generated(
    "RollbackDeploymentPayload",
    `Rollback after ${payload.failedStage}; ${payload.completedStages.length} completed stages.`,
  );
}

export function createEmptyDryRunPayloadMetadata(
  summary = "No repository payload is generated for this stage.",
): DeploymentDryRunPayloadMetadata {
  return {
    payloadType: null,
    payloadSummary: summary,
    payloadGenerated: false,
  };
}

function generated(
  payloadType: string,
  payloadSummary: string,
): DeploymentDryRunPayloadMetadata {
  return {
    payloadType,
    payloadSummary,
    payloadGenerated: true,
  };
}

function notGenerated(): DeploymentDryRunPayloadMetadata {
  return createEmptyDryRunPayloadMetadata();
}

function requireSimulatedValue(
  value: string | undefined,
  name: string,
): string {
  if (!value) {
    throw new Error(`Dry-run ${name} is required.`);
  }

  return value;
}
