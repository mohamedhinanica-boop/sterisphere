import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentActivationExecutorClinicActivationResult } from "./deployment-activation-executor-clinic-handler";
import type { ServerDeploymentActivationExecutorDependencies } from "./deployment-activation-executor-server";
import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import { completeActivationExecutionItemForServerDeployment, type ServerDeploymentActivationExecutionItemCompletionResult } from "./deployment-activation-execution-item-completion-server";
import { progressActivationExecutionDependencyForServerDeployment, type ServerDeploymentActivationExecutionDependencyProgressionResult } from "./deployment-activation-execution-dependency-progression-server";
import type { ServerDeploymentActivationExecutionItemStartResult } from "./deployment-activation-execution-item-start-server";
import { startNextActivationExecutionItemForServerDeployment } from "./deployment-activation-execution-next-item-start-server";
import { activateClinicForServerDeployment, type ServerDeploymentClinicActivationResult } from "./deployment-clinic-activation-server";
import { ServerDeploymentExecutionStepCompletionRunner, type ServerDeploymentExecutionStepCompletionBoundary } from "./deployment-execution-step-completion-runner";
import { ServerDeploymentExecutionStepEntityRunner } from "./deployment-execution-step-entity-runner";
import { ServerDeploymentExecutionStepNextStartRunner, type ServerDeploymentExecutionStepNextStartBoundary } from "./deployment-execution-step-next-start-runner";
import { createDeploymentExecutionStepOrchestratorService, type DeploymentExecutionStepOrchestratorService } from "./deployment-execution-step-orchestrator-service";
import type { DeploymentExecutionStepOrchestratorContext, DeploymentExecutionStepOrchestratorItem, DeploymentExecutionStepOrchestratorResult } from "./deployment-execution-step-orchestrator-types";
import { ServerDeploymentExecutionStepProgressionRunner, type ServerDeploymentExecutionStepProgressionBoundary } from "./deployment-execution-step-progression-runner";

export interface ServerDeploymentExecutionStepOrchestratorDependencies {
  entityExecution: ServerDeploymentActivationExecutorDependencies;
  itemCompletion: ServerDeploymentExecutionStepCompletionBoundary;
  dependencyProgression: ServerDeploymentExecutionStepProgressionBoundary;
  nextItemStart: ServerDeploymentExecutionStepNextStartBoundary;
}
export interface ServerClinicDeploymentExecutionStepDependencies extends ServerDeploymentExecutionStepOrchestratorDependencies {
  getClinicRuntimeEvidence(): {
    clinicActivation: ServerDeploymentClinicActivationResult | null;
    itemCompletion: ServerDeploymentActivationExecutionItemCompletionResult | null;
    dependencyProgression: ServerDeploymentActivationExecutionDependencyProgressionResult | null;
    nextItemStart: Awaited<ReturnType<typeof startNextActivationExecutionItemForServerDeployment>> | null;
  };
}

export function createServerClinicDeploymentExecutionStepDependencies(
  client: SupabaseClient,
  prerequisites: {
    deploymentActivationExecutionClaim: ServerDeploymentActivationExecutionClaimResult;
    deploymentActivationExecutionItemStart: ServerDeploymentActivationExecutionItemStartResult;
  },
): ServerClinicDeploymentExecutionStepDependencies {
  let clinicActivation: ServerDeploymentClinicActivationResult | null = null;
  let itemCompletion: ServerDeploymentActivationExecutionItemCompletionResult | null = null;
  let dependencyProgression: ServerDeploymentActivationExecutionDependencyProgressionResult | null = null;
  let nextItemStart: Awaited<ReturnType<typeof startNextActivationExecutionItemForServerDeployment>> | null = null;

  return {
    entityExecution: {
      clinicActivation: {
        async activateClinic(command): Promise<DeploymentActivationExecutorClinicActivationResult> {
          clinicActivation = await activateClinicForServerDeployment(client, {
            clinicId: command.clinicId,
            deploymentRunId: command.deploymentRunKey,
            deploymentActivationExecutionClaim: prerequisites.deploymentActivationExecutionClaim,
            deploymentActivationExecutionItemStart: prerequisites.deploymentActivationExecutionItemStart,
            activationRequestedAt: command.activationRequestedAt,
          });
          return {
            ok: clinicActivation.ok,
            status: clinicActivation.status === "not_attempted" ? "blocked" : clinicActivation.status,
            message: clinicActivation.message,
            clinicId: clinicActivation.clinicId,
            currentClinicState: clinicActivation.currentClinicState,
            targetClinicState: clinicActivation.targetClinicState,
            deployedAt: clinicActivation.deployedAt,
            activationResult: clinicActivation.activationResult,
            issues: mapBoundaryIssues(clinicActivation.issues),
          };
        },
      },
      providerShellActivation: {
        async activateProviderShell() {
          return {
            ok: false,
            status: "blocked" as const,
            message: "Clinic-only execution-step composition does not execute provider shells.",
            providerId: null,
            deploymentProviderKey: null,
            provisioningSourceBefore: null,
            provisioningSourceAfter: null,
            provisioningStatusBefore: null,
            provisioningStatusAfter: null,
            activeBefore: null,
            activeAfter: null,
            activatedAt: null,
            activationResult: "blocked",
            issues: [],
          };
        },
      },
    },
    itemCompletion: {
      async completeCurrentItem(input) {
        if (!clinicActivation?.ok) return missingPrerequisite("Clinic activation evidence is unavailable for item completion.");
        itemCompletion = await completeActivationExecutionItemForServerDeployment(client, {
          clinicId: input.item.clinicId,
          deploymentRunId: input.item.deploymentRunKey,
          deploymentActivationExecutionClaim: prerequisites.deploymentActivationExecutionClaim,
          deploymentClinicActivation: clinicActivation,
          itemCompletionRequestedAt: input.context.executedAt,
        });
        return mapProductionStageResult(itemCompletion);
      },
    },
    dependencyProgression: {
      async progressCurrentItemDependencies(input) {
        if (!itemCompletion?.ok) return missingPrerequisite("Item-completion evidence is unavailable for dependency progression.");
        dependencyProgression = await progressActivationExecutionDependencyForServerDeployment(client, {
          clinicId: input.item.clinicId,
          deploymentRunId: input.item.deploymentRunKey,
          deploymentActivationExecutionClaim: prerequisites.deploymentActivationExecutionClaim,
          deploymentActivationExecutionItemCompletion: itemCompletion,
          dependencyProgressionRequestedAt: input.context.executedAt,
        });
        return mapProductionStageResult(dependencyProgression);
      },
    },
    nextItemStart: {
      async startAtMostOneNextItem(input) {
        if (!dependencyProgression?.ok) return missingPrerequisite("Dependency-progression evidence is unavailable for next-item start.");
        nextItemStart = await startNextActivationExecutionItemForServerDeployment(client, {
          clinicId: input.item.clinicId,
          deploymentRunId: input.item.deploymentRunKey,
          deploymentActivationExecutionClaim: prerequisites.deploymentActivationExecutionClaim,
          deploymentActivationExecutionDependencyProgression: dependencyProgression,
          nextItemStartedAt: input.context.executedAt,
        });
        return mapProductionStageResult(nextItemStart);
      },
    },
    getClinicRuntimeEvidence() {
      return { clinicActivation, itemCompletion, dependencyProgression, nextItemStart };
    },
  };
}

export function createServerDeploymentExecutionStepOrchestrator(dependencies: ServerDeploymentExecutionStepOrchestratorDependencies): DeploymentExecutionStepOrchestratorService {
  return createDeploymentExecutionStepOrchestratorService({
    entityExecution: new ServerDeploymentExecutionStepEntityRunner(dependencies.entityExecution),
    itemCompletion: new ServerDeploymentExecutionStepCompletionRunner(dependencies.itemCompletion),
    dependencyProgression: new ServerDeploymentExecutionStepProgressionRunner(dependencies.dependencyProgression),
    nextItemStart: new ServerDeploymentExecutionStepNextStartRunner(dependencies.nextItemStart),
  });
}

export async function executeDeploymentExecutionStepForServer(dependencies: ServerDeploymentExecutionStepOrchestratorDependencies, input: { context: DeploymentExecutionStepOrchestratorContext; item: DeploymentExecutionStepOrchestratorItem }): Promise<DeploymentExecutionStepOrchestratorResult> {
  return createServerDeploymentExecutionStepOrchestrator(dependencies).execute(input);
}

function mapBoundaryIssues(issues: readonly { code: string; severity: "blocker" | "warning"; message: string; diagnostics?: unknown }[]) {
  return issues.map((issue) => ({ ...issue, diagnostics: issue.diagnostics && typeof issue.diagnostics === "object" ? JSON.parse(JSON.stringify(issue.diagnostics)) as Record<string, unknown> : null }));
}
function mapProductionStageResult(result: { status: string; message: string; issues: readonly { code: string; severity: "blocker" | "warning"; message: string; diagnostics?: unknown }[] }) {
  return { status: result.status, message: result.message, issues: mapBoundaryIssues(result.issues), diagnostics: null };
}
function missingPrerequisite(message: string) {
  return { status: "error", message, issues: [{ code: "missing_production_prerequisite", severity: "blocker" as const, message, diagnostics: null }], diagnostics: null };
}
