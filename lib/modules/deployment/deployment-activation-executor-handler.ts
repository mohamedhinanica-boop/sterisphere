import type {
  DeploymentActivationExecutorContext,
  DeploymentActivationExecutorHandlerResult,
  DeploymentActivationExecutorItem,
} from "./deployment-activation-executor-types";

export interface DeploymentActivationExecutorHandler {
  readonly handlerId: string;
  readonly entityType: string;
  readonly action: string;

  handle(input: {
    readonly context: Readonly<DeploymentActivationExecutorContext>;
    readonly item: Readonly<DeploymentActivationExecutorItem>;
  }): Promise<DeploymentActivationExecutorHandlerResult> | DeploymentActivationExecutorHandlerResult;
}

export type DeploymentActivationExecutorHandlerInput = Parameters<DeploymentActivationExecutorHandler["handle"]>[0];
