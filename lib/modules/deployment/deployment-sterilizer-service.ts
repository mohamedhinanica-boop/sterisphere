import "server-only";

import {
  buildSterilizerShellPayloadsFromDraft as buildPayloads,
} from "./deployment-sterilizer-payload";
import {
  createDeploymentProvisionCounts,
  findDuplicateDeploymentKeys,
  resolveDeploymentProvisionStatus,
} from "./deployment-provisioning-utils";
import type {
  DeploymentSterilizerProvisioningPrerequisiteRepository,
  DeploymentSterilizerRepository,
} from "./deployment-sterilizer-repository";
import type {
  CreateDeploymentSterilizerShellPayload,
  DeploymentSterilizerProvisionCommand,
  DeploymentSterilizerProvisionCounts,
  DeploymentSterilizerProvisionResult,
  DeploymentSterilizerShellRecord,
} from "./deployment-sterilizer-types";

export class DeploymentSterilizerService {
  constructor(
    private readonly repository: DeploymentSterilizerRepository &
      DeploymentSterilizerProvisioningPrerequisiteRepository,
  ) {}

  buildSterilizerShellPayloadsFromDraft(
    command: DeploymentSterilizerProvisionCommand,
  ): readonly CreateDeploymentSterilizerShellPayload[] {
    return buildPayloads(command.draft, {
      clinicId: command.clinicId,
      timestamp: command.createdAt,
    });
  }

  async provisionSterilizerShellsForClinic(
    command: DeploymentSterilizerProvisionCommand,
  ): Promise<DeploymentSterilizerProvisionResult> {
    const clinicId = command.clinicId.trim();

    if (!clinicId) {
      return rejectedResult(
        "Sterilizer shell provisioning requires a clinic id.",
      );
    }

    const clinicExists = await this.repository.clinicExists(clinicId);

    if (!clinicExists) {
      return rejectedResult(
        "Sterilizer shell provisioning requires an existing clinic root.",
      );
    }

    const clinicSettingsExist = await this.repository.clinicSettingsExist(
      clinicId,
    );

    if (!clinicSettingsExist) {
      return rejectedResult(
        "Sterilizer shell provisioning requires clinic settings to be provisioned first.",
      );
    }

    const providerShellsProvisioned =
      await this.repository.providerShellsProvisioned(clinicId);

    if (!providerShellsProvisioned) {
      return rejectedResult(
        "Sterilizer shell provisioning requires provider shells to be provisioned first.",
      );
    }

    const payloads = this.buildSterilizerShellPayloadsFromDraft({
      ...command,
      clinicId,
    });
    const counts = createDeploymentProvisionCounts(payloads.length);
    const sterilizers: DeploymentSterilizerShellRecord[] = [];
    const duplicateRequestedKeys = findDuplicateDeploymentKeys(
      payloads.map((payload) => payload.deploymentSterilizerKey),
    );
    const existingShells =
      await this.repository.listDeploymentSterilizerShells(clinicId);
    const conflictingExistingKeys = findDuplicateDeploymentKeys(
      existingShells
        .map((sterilizer) => sterilizer.deploymentSterilizerKey)
        .filter((key): key is string => Boolean(key)),
    );

    for (const payload of payloads) {
      if (
        duplicateRequestedKeys.has(payload.deploymentSterilizerKey) ||
        conflictingExistingKeys.has(payload.deploymentSterilizerKey)
      ) {
        counts.skipped += 1;
        counts.conflicts += 1;
        continue;
      }

      const existingSterilizer =
        await this.repository.findSterilizerByDeploymentKey(
          clinicId,
          payload.deploymentSterilizerKey,
        );

      if (existingSterilizer) {
        counts.reused += 1;
        sterilizers.push(existingSterilizer);
        continue;
      }

      const createResult =
        await this.repository.createSterilizerShell(payload);

      if (createResult.ok && createResult.sterilizer) {
        counts.created += 1;
        sterilizers.push(createResult.sterilizer);
        continue;
      }

      counts.skipped += 1;
      counts.conflicts += 1;
    }

    return {
      ok: counts.conflicts === 0,
      status: resolveStatus(counts),
      sterilizers,
      counts,
      message: resolveMessage(counts),
    };
  }
}

export function createDeploymentSterilizerService(
  repository: DeploymentSterilizerRepository &
    DeploymentSterilizerProvisioningPrerequisiteRepository,
): DeploymentSterilizerService {
  return new DeploymentSterilizerService(repository);
}

export function buildSterilizerShellPayloadsFromDraft(
  command: DeploymentSterilizerProvisionCommand,
): readonly CreateDeploymentSterilizerShellPayload[] {
  return buildPayloads(command.draft, {
    clinicId: command.clinicId,
    timestamp: command.createdAt,
  });
}

function rejectedResult(
  message: string,
): DeploymentSterilizerProvisionResult {
  return {
    ok: false,
    status: "rejected",
    sterilizers: [],
    counts: createDeploymentProvisionCounts(0),
    message,
  };
}

function resolveStatus(
  counts: DeploymentSterilizerProvisionCounts,
): DeploymentSterilizerProvisionResult["status"] {
  return resolveDeploymentProvisionStatus<
    DeploymentSterilizerProvisionResult["status"]
  >(counts);
}

function resolveMessage(
  counts: DeploymentSterilizerProvisionCounts,
): string {
  if (counts.conflicts > 0) {
    return "Sterilizer shell provisioning detected duplicate deployment keys and skipped conflicting shells.";
  }

  if (counts.created > 0 && counts.reused > 0) {
    return "Sterilizer shell provisioning created missing shells and reused existing shells.";
  }

  if (counts.created > 0) {
    return "Sterilizer shell provisioning created inactive planned shells for the clinic.";
  }

  if (counts.requested === 0) {
    return "Sterilizer shell provisioning requested no sterilizer shells.";
  }

  return "Sterilizer shell provisioning reused existing planned shells.";
}
