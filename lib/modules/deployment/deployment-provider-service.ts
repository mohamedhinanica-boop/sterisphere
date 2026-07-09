import "server-only";

import {
  buildProviderShellPayloadsFromDraft as buildPayloads,
} from "./deployment-provider-payload";
import type {
  DeploymentProviderProvisioningPrerequisiteRepository,
  DeploymentProviderRepository,
} from "./deployment-provider-repository";
import type {
  CreateDeploymentProviderShellPayload,
  DeploymentProviderProvisionCommand,
  DeploymentProviderProvisionCounts,
  DeploymentProviderProvisionResult,
  DeploymentProviderShellRecord,
} from "./deployment-provider-types";

export class DeploymentProviderService {
  constructor(
    private readonly repository: DeploymentProviderRepository &
      DeploymentProviderProvisioningPrerequisiteRepository,
  ) {}

  buildProviderShellPayloadsFromDraft(
    command: DeploymentProviderProvisionCommand,
  ): readonly CreateDeploymentProviderShellPayload[] {
    return buildPayloads(command.draft, {
      clinicId: command.clinicId,
      timestamp: command.createdAt,
    });
  }

  async provisionProviderShellsForClinic(
    command: DeploymentProviderProvisionCommand,
  ): Promise<DeploymentProviderProvisionResult> {
    const clinicId = command.clinicId.trim();

    if (!clinicId) {
      return rejectedResult(
        "Provider shell provisioning requires a clinic id.",
      );
    }

    const clinicExists = await this.repository.clinicExists(clinicId);

    if (!clinicExists) {
      return rejectedResult(
        "Provider shell provisioning requires an existing clinic root.",
      );
    }

    const clinicSettingsExist = await this.repository.clinicSettingsExist(
      clinicId,
    );

    if (!clinicSettingsExist) {
      return rejectedResult(
        "Provider shell provisioning requires clinic settings to be provisioned first.",
      );
    }

    const payloads = this.buildProviderShellPayloadsFromDraft({
      ...command,
      clinicId,
    });
    const counts = createCounts(payloads.length);
    const providers: DeploymentProviderShellRecord[] = [];
    const duplicateRequestedKeys = findDuplicateKeys(
      payloads.map((payload) => payload.deploymentProviderKey),
    );
    const existingShells = await this.repository.listDeploymentProviderShells(
      clinicId,
    );
    const conflictingExistingKeys = findDuplicateKeys(
      existingShells
        .map((provider) => provider.deploymentProviderKey)
        .filter((key): key is string => Boolean(key)),
    );

    for (const payload of payloads) {
      if (
        duplicateRequestedKeys.has(payload.deploymentProviderKey) ||
        conflictingExistingKeys.has(payload.deploymentProviderKey)
      ) {
        counts.skipped += 1;
        counts.conflicts += 1;
        continue;
      }

      const existingProvider =
        await this.repository.findProviderByDeploymentKey(
          clinicId,
          payload.deploymentProviderKey,
        );

      if (existingProvider) {
        counts.reused += 1;
        providers.push(existingProvider);
        continue;
      }

      const createResult = await this.repository.createProviderShell(payload);

      if (createResult.ok && createResult.provider) {
        counts.created += 1;
        providers.push(createResult.provider);
        continue;
      }

      counts.skipped += 1;
      counts.conflicts += 1;
    }

    return {
      ok: counts.conflicts === 0,
      status: resolveStatus(counts),
      providers,
      counts,
      message: resolveMessage(counts),
    };
  }
}

export function createDeploymentProviderService(
  repository: DeploymentProviderRepository &
    DeploymentProviderProvisioningPrerequisiteRepository,
): DeploymentProviderService {
  return new DeploymentProviderService(repository);
}

export function buildProviderShellPayloadsFromDraft(
  command: DeploymentProviderProvisionCommand,
): readonly CreateDeploymentProviderShellPayload[] {
  return buildPayloads(command.draft, {
    clinicId: command.clinicId,
    timestamp: command.createdAt,
  });
}

function createCounts(requested: number): DeploymentProviderProvisionCounts {
  return {
    requested,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  };
}

function rejectedResult(message: string): DeploymentProviderProvisionResult {
  return {
    ok: false,
    status: "rejected",
    providers: [],
    counts: createCounts(0),
    message,
  };
}

function findDuplicateKeys(keys: readonly string[]): Set<string> {
  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();

  keys.forEach((key) => {
    if (seenKeys.has(key)) {
      duplicateKeys.add(key);
      return;
    }

    seenKeys.add(key);
  });

  return duplicateKeys;
}

function resolveStatus(
  counts: DeploymentProviderProvisionCounts,
): DeploymentProviderProvisionResult["status"] {
  if (counts.conflicts > 0) {
    return counts.created > 0 || counts.reused > 0 ? "partial" : "conflict";
  }

  if (counts.created > 0) {
    return counts.reused > 0 ? "partial" : "created";
  }

  return "reused";
}

function resolveMessage(counts: DeploymentProviderProvisionCounts): string {
  if (counts.conflicts > 0) {
    return "Provider shell provisioning detected duplicate deployment keys and skipped conflicting shells.";
  }

  if (counts.created > 0 && counts.reused > 0) {
    return "Provider shell provisioning created missing shells and reused existing shells.";
  }

  if (counts.created > 0) {
    return "Provider shell provisioning created placeholder shells for the clinic.";
  }

  if (counts.requested === 0) {
    return "Provider shell provisioning requested no provider shells.";
  }

  return "Provider shell provisioning reused existing placeholder shells.";
}

