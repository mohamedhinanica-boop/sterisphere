import type { DeploymentActivationExecutorResult } from "./deployment-activation-executor-types";
import type { DeploymentExecutionStepDependencyProgressionRunner, DeploymentExecutionStepEntityRunner, DeploymentExecutionStepItemCompletionRunner, DeploymentExecutionStepNextItemStartRunner, DeploymentExecutionStepRunnerInput } from "./deployment-execution-step-orchestrator-runners";
import type { DeploymentExecutionStepCompletionStatus, DeploymentExecutionStepNextStartStatus, DeploymentExecutionStepOrchestratorStageResult, DeploymentExecutionStepProgressionStatus } from "./deployment-execution-step-orchestrator-types";

abstract class TestRunner<T> {
  readonly inputs: DeploymentExecutionStepRunnerInput[] = [];
  throwError: Error | null = null;
  constructor(readonly runnerId: string, protected configuredResult: T, private readonly order?: string[]) {}
  protected invoke(stage: string, input: DeploymentExecutionStepRunnerInput): T { this.order?.push(stage); this.inputs.push(clone(input)); if (this.throwError) throw this.throwError; return clone(this.configuredResult); }
  get invocationCount(): number { return this.inputs.length; }
  setResult(result: T): void { this.configuredResult = clone(result); }
}
export class TestDeploymentExecutionStepEntityRunner extends TestRunner<DeploymentActivationExecutorResult> implements DeploymentExecutionStepEntityRunner { constructor(result: DeploymentActivationExecutorResult, order?: string[]) { super("test-entity-execution", result, order); } executeEntity(input: DeploymentExecutionStepRunnerInput) { return this.invoke("entity_execution", input); } }
export class TestDeploymentExecutionStepItemCompletionRunner extends TestRunner<DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepCompletionStatus>> implements DeploymentExecutionStepItemCompletionRunner { constructor(result: DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepCompletionStatus>, order?: string[]) { super("test-item-completion", result, order); } completeItem(input: DeploymentExecutionStepRunnerInput) { return this.invoke("item_completion", input); } }
export class TestDeploymentExecutionStepDependencyProgressionRunner extends TestRunner<DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepProgressionStatus>> implements DeploymentExecutionStepDependencyProgressionRunner { constructor(result: DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepProgressionStatus>, order?: string[]) { super("test-dependency-progression", result, order); } progressDependencies(input: DeploymentExecutionStepRunnerInput) { return this.invoke("dependency_progression", input); } }
export class TestDeploymentExecutionStepNextItemStartRunner extends TestRunner<DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepNextStartStatus>> implements DeploymentExecutionStepNextItemStartRunner { constructor(result: DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepNextStartStatus>, order?: string[]) { super("test-next-item-start", result, order); } startNextItem(input: DeploymentExecutionStepRunnerInput) { return this.invoke("next_item_start", input); } }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
