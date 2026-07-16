import type {
  DeploymentActivationExecutorHandler,
  DeploymentActivationExecutorHandlerInput,
} from "./deployment-activation-executor-handler";
import type {
  DeploymentActivationExecutorHandlerResult,
  DeploymentActivationExecutorStatus,
} from "./deployment-activation-executor-types";

export class TestActivationExecutorHandler implements DeploymentActivationExecutorHandler {
  readonly calls: DeploymentActivationExecutorHandlerInput[] = [];

  constructor(
    readonly handlerId: string,
    readonly entityType: string,
    readonly action: string,
    private readonly result: DeploymentActivationExecutorHandlerResult = {
      status: "handled",
      message: "Test activation executor handler produced proposal evidence.",
    },
    private readonly shouldThrow = false,
  ) {}

  async handle(input: DeploymentActivationExecutorHandlerInput): Promise<DeploymentActivationExecutorHandlerResult> {
    this.calls.push({
      context: { ...input.context },
      item: {
        ...input.item,
        dependencyKeys: [...input.item.dependencyKeys],
        expectedCurrentState: input.item.expectedCurrentState ? JSON.parse(JSON.stringify(input.item.expectedCurrentState)) : null,
        targetState: input.item.targetState ? JSON.parse(JSON.stringify(input.item.targetState)) : null,
      },
    });

    if (this.shouldThrow) {
      throw new Error(this.result.message);
    }

    return {
      ...this.result,
      issues: this.result.issues ? [...this.result.issues] : undefined,
    };
  }
}

export class TestClinicActivationHandler extends TestActivationExecutorHandler {
  constructor(
    result?: DeploymentActivationExecutorHandlerResult,
    shouldThrow = false,
  ) {
    super(
      "test-clinic-activation-handler",
      "clinic",
      "activate",
      result,
      shouldThrow,
    );
  }
}

export class TestProviderShellActivationHandler extends TestActivationExecutorHandler {
  constructor(
    result?: DeploymentActivationExecutorHandlerResult,
    shouldThrow = false,
  ) {
    super(
      "test-provider-shell-activation-handler",
      "provider_shell",
      "activate",
      result,
      shouldThrow,
    );
  }
}

export function handlerResult(
  status: DeploymentActivationExecutorStatus,
  message = `Test handler returned ${status}.`,
): DeploymentActivationExecutorHandlerResult {
  return { status, message };
}
