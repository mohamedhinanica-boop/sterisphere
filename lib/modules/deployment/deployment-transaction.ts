import { DeploymentStage } from "./deployment-types";
import type {
  DeploymentTransactionCheckpoint,
  DeploymentTransactionResult,
  DeploymentTransactionStatus,
  DeploymentTransactionStep,
} from "./deployment-transaction-types";

export interface DeploymentTransactionOptions {
  transactionId: string;
  startedAt?: string;
}

export interface RecordDeploymentCheckpointInput {
  stageId: DeploymentStage;
  stageDisplayName: string;
  recordedAt: string;
  message?: string;
}

const TRANSACTION_STAGE_IDS: readonly DeploymentStage[] = [
  DeploymentStage.CREATE_RUN,
  DeploymentStage.LOCK,
  DeploymentStage.CREATE_CLINIC,
  DeploymentStage.CREATE_SETTINGS,
  DeploymentStage.CREATE_WORKSTATIONS,
  DeploymentStage.CREATE_STERILIZERS,
  DeploymentStage.CREATE_PLANNING,
  DeploymentStage.APPLY_POLICIES,
  DeploymentStage.INITIALIZE_DEFAULTS,
  DeploymentStage.AUDIT,
  DeploymentStage.FINALIZE,
];

export class DeploymentTransaction {
  private status: DeploymentTransactionStatus = "idle";
  private startedAt: string | null;
  private completedAt: string | null = null;
  private readonly steps: DeploymentTransactionStep[] = [];
  private readonly checkpoints: DeploymentTransactionCheckpoint[] = [];
  private readonly messages: string[] = [];
  private readonly warnings: string[] = [];

  constructor(private readonly options: DeploymentTransactionOptions) {
    this.startedAt = options.startedAt ?? null;
  }

  begin(startedAt: string): DeploymentTransactionResult {
    if (this.status !== "idle") {
      this.warnings.push(
        `Transaction ${this.options.transactionId} begin ignored because it is ${this.status}.`,
      );
      return this.result();
    }

    this.status = "active";
    this.startedAt = startedAt;
    this.messages.push(
      `Simulated deployment transaction ${this.options.transactionId} began.`,
    );

    return this.result();
  }

  recordCheckpoint(
    input: RecordDeploymentCheckpointInput,
  ): DeploymentTransactionCheckpoint {
    this.assertActive("record a checkpoint");

    const sequence = this.checkpoints.length + 1;
    const step: DeploymentTransactionStep = {
      id: `${this.options.transactionId}-step-${sequence}`,
      stageId: input.stageId,
      stageDisplayName: input.stageDisplayName,
      status: "completed",
      recordedAt: input.recordedAt,
      message:
        input.message ??
        `${input.stageDisplayName} completed inside simulated transaction.`,
    };
    const checkpoint: DeploymentTransactionCheckpoint = {
      id: `${this.options.transactionId}-checkpoint-${sequence}`,
      sequence,
      stageId: input.stageId,
      stageDisplayName: input.stageDisplayName,
      createdAt: input.recordedAt,
      stepId: step.id,
      message:
        input.message ??
        `${input.stageDisplayName} checkpoint recorded.`,
    };

    this.steps.push(step);
    this.checkpoints.push(checkpoint);
    this.messages.push(checkpoint.message);

    return checkpoint;
  }

  commit(completedAt: string): DeploymentTransactionResult {
    this.assertActive("commit");

    this.status = "committed";
    this.completedAt = completedAt;
    this.messages.push(
      `Simulated deployment transaction ${this.options.transactionId} committed.`,
    );

    return this.result();
  }

  abort(completedAt: string, message: string): DeploymentTransactionResult {
    if (this.status !== "active") {
      this.warnings.push(
        `Transaction ${this.options.transactionId} abort ignored because it is ${this.status}.`,
      );
      return this.result();
    }

    this.status = "aborted";
    this.completedAt = completedAt;
    this.messages.push(message);

    return this.result();
  }

  rollback(completedAt: string, message?: string): DeploymentTransactionResult {
    if (this.status !== "active" && this.status !== "aborted") {
      this.warnings.push(
        `Transaction ${this.options.transactionId} rollback ignored because it is ${this.status}.`,
      );
      return this.result();
    }

    this.status = "rolled_back";
    this.completedAt = completedAt;
    this.steps.push(
      ...this.checkpoints
        .slice()
        .reverse()
        .map((checkpoint) => ({
          id: `${checkpoint.id}-rollback`,
          stageId: checkpoint.stageId,
          stageDisplayName: checkpoint.stageDisplayName,
          status: "rolled_back" as const,
          recordedAt: completedAt,
          message: `${checkpoint.stageDisplayName} checkpoint rolled back in simulation.`,
        })),
    );
    this.messages.push(
      message ??
        `Simulated deployment transaction ${this.options.transactionId} rolled back.`,
    );

    return this.result();
  }

  result(): DeploymentTransactionResult {
    return {
      transactionId: this.options.transactionId,
      status: this.status,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      steps: [...this.steps],
      checkpoints: [...this.checkpoints],
      rollbackCheckpointCount:
        this.status === "rolled_back" ? this.checkpoints.length : 0,
      messages: [...this.messages],
      warnings: [...this.warnings],
    };
  }

  private assertActive(action: string): void {
    if (this.status !== "active") {
      throw new Error(
        `Cannot ${action} because transaction ${this.options.transactionId} is ${this.status}.`,
      );
    }
  }
}

export function isDeploymentTransactionStage(
  stageId: DeploymentStage,
): boolean {
  return TRANSACTION_STAGE_IDS.includes(stageId);
}
