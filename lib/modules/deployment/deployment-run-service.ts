import {
  hashDeploymentDraftInput,
} from "./deployment-draft";
import {
  isValidIdempotencyKey,
  normalizeIdempotencyKey,
} from "./deployment-idempotency";
import {
  buildCreateDeploymentRunPersistencePayload,
} from "./deployment-run-payload";
import type { DeploymentRunRepository } from "./deployment-run-repository";
import type {
  DeploymentRunCreateCommand,
  DeploymentRunCreateResult,
  DeploymentRunPersistenceDecision,
  DeploymentRunResumeCommand,
  DeploymentRunResumeResult,
} from "./deployment-run-service-types";
import type { DeploymentRunRecord } from "./deployment-run-types";

/**
 * Server-only deployment_runs boundary.
 *
 * This service is intentionally not wired into the DeploymentEngine, UI, API
 * routes, or Setup Wizard. A later RC2 slice must explicitly instantiate it
 * from trusted server code before any runtime persistence occurs.
 */
export class DeploymentRunService {
  constructor(private readonly repository: DeploymentRunRepository) {}

  async createOrReuseDeploymentRun(
    command: DeploymentRunCreateCommand,
  ): Promise<DeploymentRunCreateResult> {
    const payloadHash =
      command.payloadHash ?? hashDeploymentDraftInput(command.draft);
    const decision = await this.evaluateDeploymentRunPersistenceDecision({
      idempotencyKey: command.idempotencyKey,
      payloadHash,
    });

    if (decision.rejected) {
      return {
        ok: false,
        status: "rejected",
        decision,
        deploymentRun: null,
        message: decision.message,
      };
    }

    if (decision.conflict) {
      return {
        ok: false,
        status: "conflict",
        decision,
        deploymentRun: decision.existingRun,
        message: decision.message,
      };
    }

    if (decision.canReuse) {
      return {
        ok: true,
        status: "reused",
        decision,
        deploymentRun: decision.existingRun,
        message: decision.message,
      };
    }

    const result = await this.repository.createDeploymentRun(
      buildCreateDeploymentRunPersistencePayload(
        command.draft,
        command.auditEvidence,
        {
          id: command.id,
          deploymentRunId: command.deploymentRunId,
          clinicId: command.clinicId ?? null,
          idempotencyKey: decision.idempotencyKey ?? command.idempotencyKey,
          payloadHash,
          createdAt: command.createdAt,
          startedAt: command.startedAt ?? null,
          retryOf: command.retryOf ?? null,
          deploymentVersion: command.deploymentVersion,
          schemaVersion: command.schemaVersion,
          evidenceVersion: command.evidenceVersion,
          metadata: command.metadata,
        },
        command.lifecycleSummary ?? null,
      ),
    );

    return {
      ok: result.ok,
      status: result.ok ? "created" : "rejected",
      decision,
      deploymentRun: result.deploymentRun,
      message: result.message,
    };
  }

  async resumeDeploymentRun(
    command: DeploymentRunResumeCommand,
  ): Promise<DeploymentRunResumeResult> {
    const deploymentRun = await this.findResumeCandidate(command);
    const decision = this.evaluateResumeDecision(command, deploymentRun);

    if (decision.rejected) {
      return {
        ok: false,
        status: "rejected",
        decision,
        deploymentRun: null,
        message: decision.message,
      };
    }

    if (decision.conflict) {
      return {
        ok: false,
        status: "conflict",
        decision,
        deploymentRun,
        message: decision.message,
      };
    }

    if (!deploymentRun) {
      return {
        ok: false,
        status: "not_found",
        decision,
        deploymentRun: null,
        message: decision.message,
      };
    }

    return {
      ok: true,
      status: "resumed",
      decision,
      deploymentRun,
      message: "Deployment run can be resumed from durable evidence.",
    };
  }

  async evaluateDeploymentRunPersistenceDecision(input: {
    idempotencyKey: string | null | undefined;
    payloadHash: string | null | undefined;
  }): Promise<DeploymentRunPersistenceDecision> {
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const payloadHash = (input.payloadHash ?? "").trim();

    if (!idempotencyKey) {
      return rejectedDecision({
        reason: "missing_idempotency_key",
        idempotencyKey: null,
        payloadHash,
        message:
          "Deployment run persistence requires an idempotency key before repository writes.",
      });
    }

    if (!isValidIdempotencyKey(idempotencyKey)) {
      return rejectedDecision({
        reason: "invalid_idempotency_key",
        idempotencyKey,
        payloadHash,
        message:
          "Deployment run persistence rejected an invalid idempotency key before repository writes.",
      });
    }

    if (!payloadHash) {
      return rejectedDecision({
        reason: "missing_payload_hash",
        idempotencyKey,
        payloadHash: null,
        message:
          "Deployment run persistence requires a payload hash before repository writes.",
      });
    }

    const existingRun = await this.repository.findByIdempotencyKey(
      idempotencyKey,
    );

    if (!existingRun) {
      return {
        status: "create",
        reason: "new_idempotency_key",
        idempotencyKey,
        payloadHash,
        existingRun: null,
        canCreate: true,
        canReuse: false,
        conflict: false,
        rejected: false,
        message:
          "No deployment run exists for this idempotency key; create a deployment_runs evidence record.",
      };
    }

    if (existingRun.payloadHash === payloadHash) {
      return {
        status: "reuse",
        reason: "same_key_same_payload",
        idempotencyKey,
        payloadHash,
        existingRun,
        canCreate: false,
        canReuse: true,
        conflict: false,
        rejected: false,
        message:
          "Matching idempotency key and payload hash found; reuse the existing deployment run.",
      };
    }

    return {
      status: "conflict",
      reason: "same_key_different_payload",
      idempotencyKey,
      payloadHash,
      existingRun,
      canCreate: false,
      canReuse: false,
      conflict: true,
      rejected: false,
      message:
        "Idempotency key already belongs to a different deployment payload.",
    };
  }

  private async findResumeCandidate(
    command: DeploymentRunResumeCommand,
  ): Promise<DeploymentRunRecord | null> {
    if (command.deploymentRunId?.trim()) {
      return this.repository.findByDeploymentRunId(
        command.deploymentRunId.trim(),
      );
    }

    if (command.idempotencyKey?.trim()) {
      return this.repository.findByIdempotencyKey(
        normalizeIdempotencyKey(command.idempotencyKey),
      );
    }

    return null;
  }

  private evaluateResumeDecision(
    command: DeploymentRunResumeCommand,
    deploymentRun: DeploymentRunRecord | null,
  ): DeploymentRunPersistenceDecision {
    if (!command.deploymentRunId?.trim() && !command.idempotencyKey?.trim()) {
      return rejectedDecision({
        reason: "missing_resume_identifier",
        idempotencyKey: command.idempotencyKey ?? null,
        payloadHash: command.expectedPayloadHash ?? null,
        message:
          "Resume requires either a deployment run identifier or idempotency key.",
      });
    }

    if (!deploymentRun) {
      return {
        status: "not_found",
        reason: "deployment_run_not_found",
        idempotencyKey: command.idempotencyKey ?? null,
        payloadHash: command.expectedPayloadHash ?? null,
        existingRun: null,
        canCreate: false,
        canReuse: false,
        conflict: false,
        rejected: false,
        message: "No deployment run evidence record was found to resume.",
      };
    }

    if (
      command.expectedPayloadHash &&
      deploymentRun.payloadHash !== command.expectedPayloadHash
    ) {
      return {
        status: "conflict",
        reason: "same_key_different_payload",
        idempotencyKey: deploymentRun.idempotencyKey,
        payloadHash: command.expectedPayloadHash,
        existingRun: deploymentRun,
        canCreate: false,
        canReuse: false,
        conflict: true,
        rejected: false,
        message:
          "Resume payload hash does not match the durable deployment run evidence.",
      };
    }

    return {
      status: "reuse",
      reason: "same_key_same_payload",
      idempotencyKey: deploymentRun.idempotencyKey,
      payloadHash: deploymentRun.payloadHash,
      existingRun: deploymentRun,
      canCreate: false,
      canReuse: true,
      conflict: false,
      rejected: false,
      message: "Deployment run evidence can be reused for resume.",
    };
  }
}

export function createDeploymentRunService(
  repository: DeploymentRunRepository,
): DeploymentRunService {
  return new DeploymentRunService(repository);
}

function rejectedDecision(input: {
  reason: DeploymentRunPersistenceDecision["reason"];
  idempotencyKey: string | null;
  payloadHash: string | null;
  message: string;
}): DeploymentRunPersistenceDecision {
  return {
    status: "rejected",
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    payloadHash: input.payloadHash,
    existingRun: null,
    canCreate: false,
    canReuse: false,
    conflict: false,
    rejected: true,
    message: input.message,
  };
}
