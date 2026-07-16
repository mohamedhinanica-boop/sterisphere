import type {
  DeploymentActivationExecutorIssue,
} from "./deployment-activation-executor-types";
import {
  createActivationExecutorDispatchKey,
} from "./deployment-activation-executor-types";
import type {
  DeploymentActivationExecutorHandler,
} from "./deployment-activation-executor-handler";

export class DeploymentActivationExecutorRegistryError extends Error {
  readonly issue: DeploymentActivationExecutorIssue;

  constructor(issue: DeploymentActivationExecutorIssue) {
    super(issue.message);
    this.name = "DeploymentActivationExecutorRegistryError";
    this.issue = issue;
  }
}

export class DeploymentActivationExecutorRegistry {
  private readonly handlersByKey: Map<string, DeploymentActivationExecutorHandler>;
  readonly registrationKeys: readonly string[];

  constructor(handlers: readonly DeploymentActivationExecutorHandler[] = []) {
    const handlersByKey = new Map<string, DeploymentActivationExecutorHandler>();
    const registrationKeys: string[] = [];

    for (const handler of handlers) {
      const dispatchKey = createActivationExecutorDispatchKey(handler.entityType, handler.action).key;

      if (handlersByKey.has(dispatchKey)) {
        throw new DeploymentActivationExecutorRegistryError({
          code: "duplicate_execution_handler",
          severity: "blocker",
          message: `Duplicate activation executor handler registration for ${dispatchKey}.`,
          dispatchKey,
          handlerId: handler.handlerId,
          sessionId: null,
          executionKey: null,
          executionItemKey: null,
          planItemKey: null,
          sequence: null,
        });
      }

      handlersByKey.set(dispatchKey, handler);
      registrationKeys.push(dispatchKey);
    }

    this.handlersByKey = handlersByKey;
    this.registrationKeys = [...registrationKeys];
  }

  resolve(entityType: string, action: string): DeploymentActivationExecutorHandler | null {
    return this.handlersByKey.get(createActivationExecutorDispatchKey(entityType, action).key) ?? null;
  }

  has(entityType: string, action: string): boolean {
    return this.resolve(entityType, action) !== null;
  }
}

export function createDeploymentActivationExecutorRegistry(
  handlers: readonly DeploymentActivationExecutorHandler[],
): DeploymentActivationExecutorRegistry {
  return new DeploymentActivationExecutorRegistry(handlers);
}
