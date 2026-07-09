import "server-only";

import {
  buildWorkstationShellPayloadsFromDraft as buildPayloads,
} from "./deployment-workstation-payload";
import {
  createDeploymentProvisionCounts,
  findDuplicateDeploymentKeys,
  resolveDeploymentProvisionStatus,
} from "./deployment-provisioning-utils";
import type {
  DeploymentWorkstationProvisioningPrerequisiteRepository,
  DeploymentWorkstationRepository,
} from "./deployment-workstation-repository";
import type {
  CreateDeploymentWorkstationShellPayload,
  DeploymentWorkstationProvisionCommand,
  DeploymentWorkstationProvisionCounts,
  DeploymentWorkstationProvisionResult,
  DeploymentWorkstationShellRecord,
} from "./deployment-workstation-types";

export class DeploymentWorkstationService {
  constructor(
    private readonly repository: DeploymentWorkstationRepository &
      DeploymentWorkstationProvisioningPrerequisiteRepository,
  ) {}

  buildWorkstationShellPayloadsFromDraft(
    command: DeploymentWorkstationProvisionCommand,
  ): readonly CreateDeploymentWorkstationShellPayload[] {
    return buildPayloads(command.draft, {
      clinicId: command.clinicId,
      timestamp: command.createdAt,
    });
  }

  async provisionWorkstationShellsForClinic(
    command: DeploymentWorkstationProvisionCommand,
  ): Promise<DeploymentWorkstationProvisionResult> {
    const clinicId = command.clinicId.trim();

    if (!clinicId) {
      return rejectedResult(
        "Workstation shell provisioning requires a clinic id.",
      );
    }

    const clinicExists = await this.repository.clinicExists(clinicId);

    if (!clinicExists) {
      return rejectedResult(
        "Workstation shell provisioning requires an existing clinic root.",
      );
    }

    const clinicSettingsExist = await this.repository.clinicSettingsExist(
      clinicId,
    );

    if (!clinicSettingsExist) {
      return rejectedResult(
        "Workstation shell provisioning requires clinic settings to be provisioned first.",
      );
    }

    const providerShellsProvisioned =
      await this.repository.providerShellsProvisioned(clinicId);

    if (!providerShellsProvisioned) {
      return rejectedResult(
        "Workstation shell provisioning requires provider shells to be provisioned first.",
      );
    }

    const sterilizerShellsProvisioned =
      await this.repository.sterilizerShellsProvisioned(clinicId);

    if (!sterilizerShellsProvisioned) {
      return rejectedResult(
        "Workstation shell provisioning requires sterilizer shells to be provisioned first.",
      );
    }

    const payloads = this.buildWorkstationShellPayloadsFromDraft({
      ...command,
      clinicId,
    });
    const counts = createDeploymentProvisionCounts(payloads.length);
    const workstations: DeploymentWorkstationShellRecord[] = [];
    const duplicateRequestedKeys = findDuplicateDeploymentKeys(
      payloads.map((payload) => payload.deploymentWorkstationKey),
    );
    const existingShells =
      await this.repository.listDeploymentWorkstationShells(clinicId);
    const conflictingExistingKeys = findDuplicateDeploymentKeys(
      existingShells
        .map((workstation) => workstation.deploymentWorkstationKey)
        .filter((key): key is string => Boolean(key)),
    );

    for (const payload of payloads) {
      if (
        duplicateRequestedKeys.has(payload.deploymentWorkstationKey) ||
        conflictingExistingKeys.has(payload.deploymentWorkstationKey)
      ) {
        counts.skipped += 1;
        counts.conflicts += 1;
        continue;
      }

      const existingWorkstation =
        await this.repository.findWorkstationByDeploymentKey(
          clinicId,
          payload.deploymentWorkstationKey,
        );

      if (existingWorkstation) {
        counts.reused += 1;
        workstations.push(existingWorkstation);
        continue;
      }

      const createResult =
        await this.repository.createWorkstationShell(payload);

      if (createResult.ok && createResult.workstation) {
        counts.created += 1;
        workstations.push(createResult.workstation);
        continue;
      }

      counts.skipped += 1;
      counts.conflicts += 1;
    }

    return {
      ok: counts.conflicts === 0,
      status: resolveStatus(counts),
      workstations,
      counts,
      message: resolveMessage(counts),
    };
  }
}

export function createDeploymentWorkstationService(
  repository: DeploymentWorkstationRepository &
    DeploymentWorkstationProvisioningPrerequisiteRepository,
): DeploymentWorkstationService {
  return new DeploymentWorkstationService(repository);
}

export function buildWorkstationShellPayloadsFromDraft(
  command: DeploymentWorkstationProvisionCommand,
): readonly CreateDeploymentWorkstationShellPayload[] {
  return buildPayloads(command.draft, {
    clinicId: command.clinicId,
    timestamp: command.createdAt,
  });
}

function rejectedResult(
  message: string,
): DeploymentWorkstationProvisionResult {
  return {
    ok: false,
    status: "rejected",
    workstations: [],
    counts: createDeploymentProvisionCounts(0),
    message,
  };
}

function resolveStatus(
  counts: DeploymentWorkstationProvisionCounts,
): DeploymentWorkstationProvisionResult["status"] {
  return resolveDeploymentProvisionStatus<
    DeploymentWorkstationProvisionResult["status"]
  >(counts);
}

function resolveMessage(
  counts: DeploymentWorkstationProvisionCounts,
): string {
  if (counts.conflicts > 0) {
    return "Workstation shell provisioning detected duplicate deployment keys and skipped conflicting shells.";
  }

  if (counts.created > 0 && counts.reused > 0) {
    return "Workstation shell provisioning created missing shells and reused existing shells.";
  }

  if (counts.created > 0) {
    return "Workstation shell provisioning created inactive planned shells for the clinic.";
  }

  if (counts.requested === 0) {
    return "Workstation shell provisioning requested no workstation shells.";
  }

  return "Workstation shell provisioning reused existing planned shells.";
}
