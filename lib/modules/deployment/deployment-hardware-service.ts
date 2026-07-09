import "server-only";

import {
  buildHardwareShellPayloadsFromDraft as buildPayloads,
} from "./deployment-hardware-payload";
import {
  createDeploymentProvisionCounts,
  findDuplicateDeploymentKeys,
  resolveDeploymentProvisionStatus,
} from "./deployment-provisioning-utils";
import type {
  DeploymentHardwareProvisioningPrerequisiteRepository,
  DeploymentHardwareRepository,
} from "./deployment-hardware-repository";
import type {
  CreateDeploymentHardwareShellPayload,
  DeploymentHardwareProvisionCommand,
  DeploymentHardwareProvisionCounts,
  DeploymentHardwareProvisionResult,
  DeploymentHardwareShellRecord,
} from "./deployment-hardware-types";

export class DeploymentHardwareService {
  constructor(
    private readonly repository: DeploymentHardwareRepository &
      DeploymentHardwareProvisioningPrerequisiteRepository,
  ) {}

  buildHardwareShellPayloadsFromDraft(
    command: DeploymentHardwareProvisionCommand,
  ): readonly CreateDeploymentHardwareShellPayload[] {
    return buildPayloads(command.draft, {
      clinicId: command.clinicId,
      timestamp: command.createdAt,
    });
  }

  async provisionHardwareShellsForClinic(
    command: DeploymentHardwareProvisionCommand,
  ): Promise<DeploymentHardwareProvisionResult> {
    const clinicId = command.clinicId.trim();

    if (!clinicId) {
      return rejectedResult(
        "Hardware shell provisioning requires a clinic id.",
      );
    }

    const clinicExists = await this.repository.clinicExists(clinicId);

    if (!clinicExists) {
      return rejectedResult(
        "Hardware shell provisioning requires an existing clinic root.",
      );
    }

    const clinicSettingsExist = await this.repository.clinicSettingsExist(
      clinicId,
    );

    if (!clinicSettingsExist) {
      return rejectedResult(
        "Hardware shell provisioning requires clinic settings to be provisioned first.",
      );
    }

    const providerShellsProvisioned =
      await this.repository.providerShellsProvisioned(clinicId);

    if (!providerShellsProvisioned) {
      return rejectedResult(
        "Hardware shell provisioning requires provider shells to be provisioned first.",
      );
    }

    const sterilizerShellsProvisioned =
      await this.repository.sterilizerShellsProvisioned(clinicId);

    if (!sterilizerShellsProvisioned) {
      return rejectedResult(
        "Hardware shell provisioning requires sterilizer shells to be provisioned first.",
      );
    }

    const workstationShellsProvisioned =
      await this.repository.workstationShellsProvisioned(clinicId);

    if (!workstationShellsProvisioned) {
      return rejectedResult(
        "Hardware shell provisioning requires workstation shells to be provisioned first.",
      );
    }

    const payloads = this.buildHardwareShellPayloadsFromDraft({
      ...command,
      clinicId,
    });
    const counts = createDeploymentProvisionCounts(payloads.length);
    const hardware: DeploymentHardwareShellRecord[] = [];
    const duplicateRequestedKeys = findDuplicateDeploymentKeys(
      payloads.map((payload) => payload.deploymentHardwareKey),
    );
    const existingShells =
      await this.repository.listDeploymentHardwareShells(clinicId);
    const conflictingExistingKeys = findDuplicateDeploymentKeys(
      existingShells
        .map((hardwareShell) => hardwareShell.deploymentHardwareKey)
        .filter((key): key is string => Boolean(key)),
    );

    for (const payload of payloads) {
      if (
        duplicateRequestedKeys.has(payload.deploymentHardwareKey) ||
        conflictingExistingKeys.has(payload.deploymentHardwareKey)
      ) {
        counts.skipped += 1;
        counts.conflicts += 1;
        continue;
      }

      const existingHardware =
        await this.repository.findHardwareByDeploymentKey(
          clinicId,
          payload.deploymentHardwareKey,
        );

      if (existingHardware) {
        counts.reused += 1;
        hardware.push(existingHardware);
        continue;
      }

      const createResult = await this.repository.createHardwareShell(payload);

      if (createResult.ok && createResult.hardware) {
        counts.created += 1;
        hardware.push(createResult.hardware);
        continue;
      }

      counts.skipped += 1;
      counts.conflicts += 1;
    }

    return {
      ok: counts.conflicts === 0,
      status: resolveStatus(counts),
      hardware,
      counts,
      message: resolveMessage(counts),
    };
  }
}

export function createDeploymentHardwareService(
  repository: DeploymentHardwareRepository &
    DeploymentHardwareProvisioningPrerequisiteRepository,
): DeploymentHardwareService {
  return new DeploymentHardwareService(repository);
}

export function buildHardwareShellPayloadsFromDraft(
  command: DeploymentHardwareProvisionCommand,
): readonly CreateDeploymentHardwareShellPayload[] {
  return buildPayloads(command.draft, {
    clinicId: command.clinicId,
    timestamp: command.createdAt,
  });
}

function rejectedResult(message: string): DeploymentHardwareProvisionResult {
  return {
    ok: false,
    status: "rejected",
    hardware: [],
    counts: createDeploymentProvisionCounts(0),
    message,
  };
}

function resolveStatus(
  counts: DeploymentHardwareProvisionCounts,
): DeploymentHardwareProvisionResult["status"] {
  return resolveDeploymentProvisionStatus<
    DeploymentHardwareProvisionResult["status"]
  >(counts);
}

function resolveMessage(counts: DeploymentHardwareProvisionCounts): string {
  if (counts.conflicts > 0) {
    return "Hardware shell provisioning detected duplicate deployment keys and skipped conflicting shells.";
  }

  if (counts.created > 0 && counts.reused > 0) {
    return "Hardware shell provisioning created missing shells and reused existing shells.";
  }

  if (counts.created > 0) {
    return "Hardware shell provisioning created inactive planned shells for the clinic.";
  }

  if (counts.requested === 0) {
    return "Hardware shell provisioning requested no hardware shells.";
  }

  return "Hardware shell provisioning reused existing planned shells.";
}