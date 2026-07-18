import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentActivationExecutorClinicActivationResult } from "./deployment-activation-executor-clinic-handler";
import type { DeploymentActivationExecutorProviderShellActivationResult } from "./deployment-activation-executor-provider-shell-handler";
import type { ServerDeploymentActivationExecutorDependencies } from "./deployment-activation-executor-server";
import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import { completeActivationExecutionItemForServerDeployment, type ServerDeploymentActivationExecutionItemCompletionResult } from "./deployment-activation-execution-item-completion-server";
import { progressActivationExecutionDependencyForServerDeployment, type ServerDeploymentActivationExecutionDependencyProgressionResult } from "./deployment-activation-execution-dependency-progression-server";
import type { ServerDeploymentActivationExecutionItemStartResult } from "./deployment-activation-execution-item-start-server";
import { startNextActivationExecutionItemForServerDeployment, type ServerDeploymentActivationExecutionNextItemStartResult } from "./deployment-activation-execution-next-item-start-server";
import { activateClinicForServerDeployment, type ServerDeploymentClinicActivationResult } from "./deployment-clinic-activation-server";
import { activateProviderShellForServerDeployment, type ServerDeploymentProviderShellActivationResult } from "./deployment-provider-shell-activation-server";
import { completeProviderShellExecutionItemForServerDeployment, type ServerDeploymentProviderShellExecutionItemCompletionResult } from "./deployment-provider-shell-execution-item-completion-server";
import { ServerDeploymentExecutionStepCompletionRunner, type ServerDeploymentExecutionStepCompletionBoundary } from "./deployment-execution-step-completion-runner";
import { ServerDeploymentExecutionStepEntityRunner } from "./deployment-execution-step-entity-runner";
import { ServerDeploymentExecutionStepNextStartRunner, type ServerDeploymentExecutionStepNextStartBoundary } from "./deployment-execution-step-next-start-runner";
import { createDeploymentExecutionStepOrchestratorService, type DeploymentExecutionStepOrchestratorService } from "./deployment-execution-step-orchestrator-service";
import type { DeploymentExecutionStepOrchestratorContext, DeploymentExecutionStepOrchestratorItem, DeploymentExecutionStepOrchestratorResult } from "./deployment-execution-step-orchestrator-types";
import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
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

export interface ServerProviderDeploymentExecutionStepDependencies extends ServerDeploymentExecutionStepOrchestratorDependencies {
  getProviderRuntimeEvidence(): {
    providerActivation: ServerDeploymentProviderShellActivationResult | null;
    itemCompletion: ServerDeploymentProviderShellExecutionItemCompletionResult | null;
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

export function createServerProviderDeploymentExecutionStepDependencies(
  client: SupabaseClient,
  prerequisites: {
    deploymentActivationExecutionClaim: ServerDeploymentActivationExecutionClaimResult;
    deploymentActivationExecutionNextItemStart: ServerDeploymentActivationExecutionNextItemStartResult;
  },
): ServerProviderDeploymentExecutionStepDependencies {
  let providerActivation: ServerDeploymentProviderShellActivationResult | null = null;
  let itemCompletion: ServerDeploymentProviderShellExecutionItemCompletionResult | null = null;
  let dependencyProgression: ServerDeploymentActivationExecutionDependencyProgressionResult | null = null;
  let nextItemStart: Awaited<ReturnType<typeof startNextActivationExecutionItemForServerDeployment>> | null = null;

  return {
    entityExecution: {
      clinicActivation: {
        async activateClinic() {
          return { ok: false, status: "blocked" as const, message: "Provider-only execution-step composition does not execute clinics.", clinicId: null, currentClinicState: null, targetClinicState: null, deployedAt: null, activationResult: "blocked", issues: [] };
        },
      },
      providerShellActivation: {
        async activateProviderShell(command): Promise<DeploymentActivationExecutorProviderShellActivationResult> {
          providerActivation = await activateProviderShellForServerDeployment(client, {
            clinicId: command.clinicId,
            deploymentRunId: command.deploymentRunKey,
            deploymentActivationExecutionClaim: prerequisites.deploymentActivationExecutionClaim,
            deploymentActivationExecutionNextItemStart: prerequisites.deploymentActivationExecutionNextItemStart,
            providerActivatedAt: command.providerActivatedAt,
          });
          return {
            ok: providerActivation.ok,
            status: providerActivation.status === "not_attempted" ? "blocked" : providerActivation.status,
            message: providerActivation.message,
            providerId: providerActivation.providerId,
            deploymentProviderKey: providerActivation.deploymentProviderKey,
            provisioningSourceBefore: providerActivation.provisioningSourceBefore,
            provisioningSourceAfter: providerActivation.provisioningSourceAfter,
            provisioningStatusBefore: providerActivation.provisioningStatusBefore,
            provisioningStatusAfter: providerActivation.provisioningStatusAfter,
            activeBefore: providerActivation.activeBefore,
            activeAfter: providerActivation.activeAfter,
            activatedAt: providerActivation.activatedAt,
            activationResult: providerActivation.result,
            issues: mapBoundaryIssues(providerActivation.issues),
          };
        },
      },
    },
    itemCompletion: {
      async completeCurrentItem(input) {
        if (!providerActivation?.ok) return missingPrerequisite("Provider activation evidence is unavailable for item completion.");
        itemCompletion = await completeProviderShellExecutionItemForServerDeployment(client, {
          clinicId: input.item.clinicId,
          deploymentRunId: input.item.deploymentRunKey,
          deploymentActivationExecutionClaim: prerequisites.deploymentActivationExecutionClaim,
          deploymentProviderShellActivation: providerActivation,
          itemCompletionRequestedAt: input.context.executedAt,
        });
        return mapProductionStageResult(itemCompletion);
      },
    },
    dependencyProgression: {
      async progressCurrentItemDependencies(input) {
        if (!itemCompletion?.ok) return missingPrerequisite("Provider item-completion evidence is unavailable for dependency progression.");
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
        if (!dependencyProgression?.ok) return missingPrerequisite("Provider dependency-progression evidence is unavailable for next-item start.");
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
    getProviderRuntimeEvidence() {
      return { providerActivation, itemCompletion, dependencyProgression, nextItemStart };
    },
  };
}
export interface ServerProviderSequenceExecutionResult {
  ok: boolean;
  message: string;
  providerItemsPlanned: number;
  providerItemsExecuted: number;
  lastStep: DeploymentExecutionStepOrchestratorResult | null;
  providerActivation: ServerDeploymentProviderShellActivationResult | null;
  itemCompletion: ServerDeploymentProviderShellExecutionItemCompletionResult | null;
  dependencyProgression: ServerDeploymentActivationExecutionDependencyProgressionResult | null;
  nextItemStart: ServerDeploymentActivationExecutionNextItemStartResult | null;
}

export async function executeServerProviderSequence(
  client: SupabaseClient,
  input: {
    context: DeploymentExecutionStepOrchestratorContext;
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
    planKey: string;
    deploymentActivationExecutionClaim: ServerDeploymentActivationExecutionClaimResult;
    initialNextItemStart: ServerDeploymentActivationExecutionNextItemStartResult;
    preparedExecutionItems: readonly DeploymentActivationExecutionItem[];
    executeProviderStep?: (input: { current: ServerDeploymentActivationExecutionNextItemStartResult; prepared: DeploymentActivationExecutionItem; context: DeploymentExecutionStepOrchestratorContext }) => Promise<{ step: DeploymentExecutionStepOrchestratorResult; evidence: ReturnType<ServerProviderDeploymentExecutionStepDependencies["getProviderRuntimeEvidence"]> }>;
  },
): Promise<ServerProviderSequenceExecutionResult> {
  const providerItems = input.preparedExecutionItems
    .filter((item) => item.entityType === "provider_shell" && item.action === "activate")
    .sort((left, right) => left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey));
  const seenItemIds = new Set<string>();
  let current = input.initialNextItemStart;
  let lastStep: DeploymentExecutionStepOrchestratorResult | null = null;
  let providerActivation: ServerDeploymentProviderShellActivationResult | null = null;
  let itemCompletion: ServerDeploymentProviderShellExecutionItemCompletionResult | null = null;
  let dependencyProgression: ServerDeploymentActivationExecutionDependencyProgressionResult | null = null;
  let nextItemStart: ServerDeploymentActivationExecutionNextItemStartResult | null = null;
  const downstream = { entitiesActivated: 0, itemsCompleted: 0, dependenciesProgressed: 0, itemsStarted: 0 };
  const stop = (message: string): ServerProviderSequenceExecutionResult => ({ ok: false, message, providerItemsPlanned: providerItems.length, providerItemsExecuted: seenItemIds.size, lastStep, providerActivation, itemCompletion, dependencyProgression, nextItemStart });

  if (providerItems.length === 0) return stop("Provider sequence has no authoritative planned provider items.");
  if (!input.context.leaseExpiresAt || Date.parse(input.context.leaseExpiresAt) <= Date.parse(input.context.executedAt)) return stop("Provider sequence ownership lease is not active.");

  for (let index = 0; index < providerItems.length; index += 1) {
    const prepared = providerItems[index];
    const validIdentity = current.ok && ["started", "already_started"].includes(current.status) && current.clinicId === input.clinicId && current.deploymentRunKey === input.deploymentRunKey && current.sessionId === input.sessionId && current.executionKey === input.executionKey && current.planKey === input.planKey && current.claimantId === input.context.claimantId && current.leaseExpiresAt === input.context.leaseExpiresAt && current.entityType === "provider_shell" && current.action === "activate" && current.itemId && current.startedAt && current.executionItemKey === prepared.executionItemKey && current.planItemKey === prepared.planItemKey && current.sequence === prepared.sequence && current.entityId === prepared.entityId && prepared.entityId && prepared.deploymentKey && prepared.entityId !== prepared.deploymentKey;
    if (!validIdentity) return stop("Provider sequence next-item evidence is malformed, foreign, or out of deterministic order.");
    if (seenItemIds.has(current.itemId!)) return stop("Provider sequence refused duplicate execution-item evidence.");
    seenItemIds.add(current.itemId!);

    const productionStep = async () => {
      const dependencies = createServerProviderDeploymentExecutionStepDependencies(client, { deploymentActivationExecutionClaim: input.deploymentActivationExecutionClaim, deploymentActivationExecutionNextItemStart: current });
      const step = await executeDeploymentExecutionStepForServer(dependencies, {
        context: input.context,
        item: {
          clinicId: input.clinicId, deploymentRunKey: input.deploymentRunKey, sessionId: input.sessionId, executionKey: input.executionKey, planKey: input.planKey,
          itemId: current.itemId!, executionItemKey: prepared.executionItemKey, planItemKey: prepared.planItemKey, sequence: prepared.sequence,
          entityType: "provider_shell", entityId: prepared.entityId, deploymentKey: prepared.deploymentKey, action: "activate", executionStatus: "running",
          attemptCount: current.attemptCount, startedAt: current.startedAt, completedAt: prepared.completedAt, rolledBackAt: null,
          errorCode: prepared.error?.code ?? null, errorMessage: prepared.error?.message ?? null,
          expectedCurrentState: prepared.currentState, targetState: prepared.targetState, dependencyKeys: prepared.dependencyKeys,
          reversible: prepared.reversible, rollbackBehavior: prepared.rollbackAction,
        },
      });
      return { step, evidence: dependencies.getProviderRuntimeEvidence() };
    };
    const invocation = input.executeProviderStep ? await input.executeProviderStep({ current, prepared, context: input.context }) : await productionStep();
    const { step, evidence } = invocation;
    providerActivation = evidence.providerActivation; itemCompletion = evidence.itemCompletion; dependencyProgression = evidence.dependencyProgression; nextItemStart = evidence.nextItemStart;
    downstream.entitiesActivated += step.downstream.entitiesActivated; downstream.itemsCompleted += step.downstream.itemsCompleted; downstream.dependenciesProgressed += step.downstream.dependenciesProgressed; downstream.itemsStarted += step.downstream.itemsStarted;
    lastStep = { ...step, downstream: { ...step.downstream, ...downstream } };
    if (!step.ok) return stop("Provider sequence stopped because one provider execution step did not complete.");
    if (!nextItemStart?.ok || !["started", "already_started"].includes(nextItemStart.status)) return stop("Provider sequence stopped because no deterministic next item was started.");

    if (index + 1 < providerItems.length) {
      if (nextItemStart.entityType !== "provider_shell" || nextItemStart.action !== "activate") return stop("Provider sequence reached a non-provider item before the authoritative provider bound.");
      current = nextItemStart;
      continue;
    }
    if (nextItemStart.entityType === "provider_shell") return stop("Provider sequence exceeded the authoritative planned provider bound.");
    return { ok: true, message: "All deterministic provider items completed and the first non-provider item was started without execution.", providerItemsPlanned: providerItems.length, providerItemsExecuted: seenItemIds.size, lastStep, providerActivation, itemCompletion, dependencyProgression, nextItemStart };
  }
  return stop("Provider sequence terminated without a non-provider handoff.");
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
