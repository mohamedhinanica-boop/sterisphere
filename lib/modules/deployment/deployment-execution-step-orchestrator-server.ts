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
import type { DeploymentActivationExecutorSterilizerShellRunner } from "./deployment-activation-executor-sterilizer-shell-handler";
import { activateSterilizerShellForServerDeployment, type ServerDeploymentSterilizerShellActivationResult } from "./deployment-sterilizer-shell-activation-server";
import { completeSterilizerShellExecutionItemForServerDeployment, type ServerDeploymentSterilizerShellExecutionItemCompletionResult } from "./deployment-sterilizer-shell-execution-item-completion-server";
import { ServerDeploymentExecutionStepCompletionRunner, type ServerDeploymentExecutionStepCompletionBoundary } from "./deployment-execution-step-completion-runner";
import { ServerDeploymentExecutionStepEntityRunner } from "./deployment-execution-step-entity-runner";
import { ServerDeploymentExecutionStepNextStartRunner, type ServerDeploymentExecutionStepNextStartBoundary } from "./deployment-execution-step-next-start-runner";
import { createDeploymentExecutionStepOrchestratorService, type DeploymentExecutionStepOrchestratorService } from "./deployment-execution-step-orchestrator-service";
import type { DeploymentExecutionStepOrchestratorContext, DeploymentExecutionStepOrchestratorItem, DeploymentExecutionStepOrchestratorResult } from "./deployment-execution-step-orchestrator-types";
import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
import { executeGenericEntitySequence } from "./deployment-generic-entity-sequence-driver";
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
export interface ServerSterilizerDeploymentExecutionStepDependencies extends ServerDeploymentExecutionStepOrchestratorDependencies {
  getSterilizerRuntimeEvidence(): {
    sterilizerActivation: ServerDeploymentSterilizerShellActivationResult | null;
    itemCompletion: ServerDeploymentSterilizerShellExecutionItemCompletionResult | null;
    dependencyProgression: ServerDeploymentActivationExecutionDependencyProgressionResult | null;
    nextItemStart: ServerDeploymentActivationExecutionNextItemStartResult | null;
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
export function createServerSterilizerDeploymentExecutionStepDependencies(
  client: SupabaseClient,
  prerequisites: {
    deploymentActivationExecutionClaim: ServerDeploymentActivationExecutionClaimResult;
    deploymentActivationExecutionNextItemStart: ServerDeploymentActivationExecutionNextItemStartResult;
  },
): ServerSterilizerDeploymentExecutionStepDependencies {
  let sterilizerActivation: ServerDeploymentSterilizerShellActivationResult | null = null;
  let itemCompletion: ServerDeploymentSterilizerShellExecutionItemCompletionResult | null = null;
  let dependencyProgression: ServerDeploymentActivationExecutionDependencyProgressionResult | null = null;
  let nextItemStart: ServerDeploymentActivationExecutionNextItemStartResult | null = null;

  const sterilizerRunner: DeploymentActivationExecutorSterilizerShellRunner = {
    async activateSterilizerShell(command) {
      sterilizerActivation = await activateSterilizerShellForServerDeployment(client, {
        clinicId: command.clinicId,
        deploymentRunId: command.deploymentRunKey,
        deploymentActivationExecutionClaim: prerequisites.deploymentActivationExecutionClaim,
        deploymentActivationExecutionNextItemStart: prerequisites.deploymentActivationExecutionNextItemStart,
        sterilizerActivatedAt: command.executedAt,
      });
      return sterilizerActivation;
    },
    async completeSterilizerShellExecutionItem(command) {
      itemCompletion = await completeSterilizerShellExecutionItemForServerDeployment(client, {
        clinicId: command.clinicId,
        deploymentRunId: command.deploymentRunKey,
        deploymentActivationExecutionClaim: prerequisites.deploymentActivationExecutionClaim,
        deploymentSterilizerShellActivation: sterilizerActivation,
        itemCompletionRequestedAt: command.executedAt,
      });
      return itemCompletion;
    },
  };

  return {
    entityExecution: {
      clinicActivation: {
        async activateClinic() {
          return { ok: false, status: "blocked" as const, message: "Sterilizer-only execution-step composition does not execute clinics.", clinicId: null, currentClinicState: null, targetClinicState: null, deployedAt: null, activationResult: "blocked", issues: [] };
        },
      },
      providerShellActivation: {
        async activateProviderShell() {
          return { ok: false, status: "blocked" as const, message: "Sterilizer-only execution-step composition does not execute provider shells.", providerId: null, deploymentProviderKey: null, provisioningSourceBefore: null, provisioningSourceAfter: null, provisioningStatusBefore: null, provisioningStatusAfter: null, activeBefore: null, activeAfter: null, activatedAt: null, activationResult: "blocked", issues: [] };
        },
      },
      sterilizerShellActivation: sterilizerRunner,
    },
    itemCompletion: {
      async completeCurrentItem() {
        if (!itemCompletion?.ok) return missingPrerequisite("Sterilizer item-completion evidence is unavailable after entity execution.");
        return mapProductionStageResult(itemCompletion);
      },
    },
    dependencyProgression: {
      async progressCurrentItemDependencies(input) {
        if (!itemCompletion?.ok) return missingPrerequisite("Sterilizer item-completion evidence is unavailable for dependency progression.");
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
        if (!dependencyProgression?.ok) return missingPrerequisite("Sterilizer dependency-progression evidence is unavailable for next-item start.");
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
    getSterilizerRuntimeEvidence() {
      return { sterilizerActivation, itemCompletion, dependencyProgression, nextItemStart };
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
  const result = await executeGenericEntitySequence({
    entityType: "provider_shell",
    action: "activate",
    clinicId: input.clinicId,
    deploymentRunKey: input.deploymentRunKey,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    planKey: input.planKey,
    claimantId: input.context.claimantId,
    leaseExpiresAt: input.context.leaseExpiresAt,
    executedAt: input.context.executedAt,
    firstRunningItem: input.initialNextItemStart,
    preparedItems: input.preparedExecutionItems.map((item) => ({
      source: item,
      executionItemKey: item.executionItemKey,
      planItemKey: item.planItemKey,
      sequence: item.sequence,
      entityType: item.entityType,
      entityId: item.entityId,
      deploymentKey: item.deploymentKey,
      action: item.action,
    })),
    readRunningIdentity: providerRunningIdentity,
    validateEntityIdentity: (_running, prepared) => Boolean(prepared.entityId && prepared.deploymentKey && prepared.entityId !== prepared.deploymentKey),
    executeOne: async ({ running, prepared }) => {
      if (input.executeProviderStep) {
        const invocation = await input.executeProviderStep({ current: running, prepared: prepared.source, context: input.context });
        return { ...invocation, nextRunningItem: invocation.evidence.nextItemStart };
      }
      const dependencies = createServerProviderDeploymentExecutionStepDependencies(client, {
        deploymentActivationExecutionClaim: input.deploymentActivationExecutionClaim,
        deploymentActivationExecutionNextItemStart: running,
      });
      const item = prepared.source;
      const step = await executeDeploymentExecutionStepForServer(dependencies, {
        context: input.context,
        item: {
          clinicId: input.clinicId, deploymentRunKey: input.deploymentRunKey, sessionId: input.sessionId, executionKey: input.executionKey, planKey: input.planKey,
          itemId: running.itemId!, executionItemKey: item.executionItemKey, planItemKey: item.planItemKey, sequence: item.sequence,
          entityType: "provider_shell", entityId: item.entityId, deploymentKey: item.deploymentKey, action: "activate", executionStatus: "running",
          attemptCount: running.attemptCount, startedAt: running.startedAt, completedAt: item.completedAt, rolledBackAt: null,
          errorCode: item.error?.code ?? null, errorMessage: item.error?.message ?? null,
          expectedCurrentState: item.currentState, targetState: item.targetState, dependencyKeys: item.dependencyKeys,
          reversible: item.reversible, rollbackBehavior: item.rollbackAction,
        },
      });
      const evidence = dependencies.getProviderRuntimeEvidence();
      return { step, evidence, nextRunningItem: evidence.nextItemStart };
    },
  });
  const evidence = result.lastEvidence;
  return {
    ok: result.ok,
    message: providerSequenceMessage(result.message),
    providerItemsPlanned: result.itemsPlanned,
    providerItemsExecuted: result.itemsExecuted,
    lastStep: result.lastStep,
    providerActivation: evidence?.providerActivation ?? null,
    itemCompletion: evidence?.itemCompletion ?? null,
    dependencyProgression: evidence?.dependencyProgression ?? null,
    nextItemStart: evidence?.nextItemStart ?? null,
  };
}

export interface ServerSterilizerSequenceExecutionResult {
  ok: boolean;
  message: string;
  sterilizerItemsPlanned: number;
  sterilizerItemsExecuted: number;
  lastStep: DeploymentExecutionStepOrchestratorResult | null;
  sterilizerActivation: ServerDeploymentSterilizerShellActivationResult | null;
  itemCompletion: ServerDeploymentSterilizerShellExecutionItemCompletionResult | null;
  dependencyProgression: ServerDeploymentActivationExecutionDependencyProgressionResult | null;
  nextItemStart: ServerDeploymentActivationExecutionNextItemStartResult | null;
}

export async function executeServerSterilizerSequence(
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
    executeSterilizerStep?: (input: { current: ServerDeploymentActivationExecutionNextItemStartResult; prepared: DeploymentActivationExecutionItem; context: DeploymentExecutionStepOrchestratorContext }) => Promise<{ step: DeploymentExecutionStepOrchestratorResult; evidence: ReturnType<ServerSterilizerDeploymentExecutionStepDependencies["getSterilizerRuntimeEvidence"]> }>;
  },
): Promise<ServerSterilizerSequenceExecutionResult> {
  const result = await executeGenericEntitySequence({
    entityType: "sterilizer_shell",
    action: "activate",
    clinicId: input.clinicId,
    deploymentRunKey: input.deploymentRunKey,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    planKey: input.planKey,
    claimantId: input.context.claimantId,
    leaseExpiresAt: input.context.leaseExpiresAt,
    executedAt: input.context.executedAt,
    firstRunningItem: input.initialNextItemStart,
    preparedItems: input.preparedExecutionItems.map((item) => ({
      source: item,
      executionItemKey: item.executionItemKey,
      planItemKey: item.planItemKey,
      sequence: item.sequence,
      entityType: item.entityType,
      entityId: item.entityId,
      deploymentKey: item.deploymentKey,
      action: item.action,
    })),
    readRunningIdentity: providerRunningIdentity,
    validateEntityIdentity: (_running, prepared) => Boolean(prepared.entityId && prepared.deploymentKey && prepared.entityId !== prepared.deploymentKey),
    executeOne: async ({ running, prepared }) => {
      if (input.executeSterilizerStep) {
        const invocation = await input.executeSterilizerStep({ current: running, prepared: prepared.source, context: input.context });
        return { ...invocation, nextRunningItem: invocation.evidence.nextItemStart };
      }
      const dependencies = createServerSterilizerDeploymentExecutionStepDependencies(client, {
        deploymentActivationExecutionClaim: input.deploymentActivationExecutionClaim,
        deploymentActivationExecutionNextItemStart: running,
      });
      const item = prepared.source;
      const step = await executeDeploymentExecutionStepForServer(dependencies, {
        context: input.context,
        item: {
          clinicId: input.clinicId, deploymentRunKey: input.deploymentRunKey, sessionId: input.sessionId, executionKey: input.executionKey, planKey: input.planKey,
          itemId: running.itemId!, executionItemKey: item.executionItemKey, planItemKey: item.planItemKey, sequence: item.sequence,
          entityType: "sterilizer_shell", entityId: item.entityId, deploymentKey: item.deploymentKey, action: "activate", executionStatus: "running",
          attemptCount: running.attemptCount, startedAt: running.startedAt, completedAt: item.completedAt, rolledBackAt: null,
          errorCode: item.error?.code ?? null, errorMessage: item.error?.message ?? null,
          expectedCurrentState: item.currentState, targetState: item.targetState, dependencyKeys: item.dependencyKeys,
          reversible: item.reversible, rollbackBehavior: item.rollbackAction,
        },
      });
      const evidence = dependencies.getSterilizerRuntimeEvidence();
      return { step, evidence, nextRunningItem: evidence.nextItemStart };
    },
  });
  const evidence = result.lastEvidence;
  return {
    ok: result.ok,
    message: sterilizerSequenceMessage(result.message),
    sterilizerItemsPlanned: result.itemsPlanned,
    sterilizerItemsExecuted: result.itemsExecuted,
    lastStep: result.lastStep,
    sterilizerActivation: evidence?.sterilizerActivation ?? null,
    itemCompletion: evidence?.itemCompletion ?? null,
    dependencyProgression: evidence?.dependencyProgression ?? null,
    nextItemStart: evidence?.nextItemStart ?? null,
  };
}

function sterilizerSequenceMessage(message: string): string {
  return message
    .replace("Entity sequence has no authoritative planned items.", "Sterilizer sequence has no authoritative prepared sterilizer items.")
    .replace("Entity sequence ownership lease is not active.", "Sterilizer sequence ownership lease is not active.")
    .replace("Entity sequence next-item evidence is malformed, foreign, or out of deterministic order.", "Sterilizer sequence handoff evidence is malformed, foreign, or out of deterministic order.")
    .replace("Entity sequence refused duplicate execution-item evidence.", "Sterilizer sequence refused duplicate execution-item evidence.")
    .replace("Entity sequence stopped because one execution step did not complete.", "Sterilizer sequence stopped because one sterilizer execution step did not complete.")
    .replace("Entity sequence stopped because no deterministic next item was started.", "Sterilizer sequence stopped because no deterministic next item was started.")
    .replace("Entity sequence reached a non-matching item before the authoritative bound.", "Sterilizer sequence reached a non-sterilizer item before the authoritative prepared-item bound.")
    .replace("Entity sequence exceeded the authoritative planned bound.", "Sterilizer sequence exceeded the authoritative prepared-item bound.")
    .replace("All deterministic entity items completed and the first non-matching item was started without execution.", "All deterministic sterilizer items completed and the first non-sterilizer item was started without execution.")
    .replace("Entity sequence terminated without a non-matching handoff.", "Sterilizer sequence terminated without a non-sterilizer handoff.");
}
function providerRunningIdentity(item: ServerDeploymentActivationExecutionNextItemStartResult) {
  return {
    ok: item.ok, status: item.status, clinicId: item.clinicId, deploymentRunKey: item.deploymentRunKey, sessionId: item.sessionId,
    executionKey: item.executionKey, planKey: item.planKey, claimantId: item.claimantId, leaseExpiresAt: item.leaseExpiresAt,
    itemId: item.itemId, executionItemKey: item.executionItemKey, planItemKey: item.planItemKey, sequence: item.sequence,
    entityType: item.entityType, entityId: item.entityId, deploymentKey: null, action: item.action, startedAt: item.startedAt,
  };
}

function providerSequenceMessage(message: string): string {
  return message
    .replace("Entity sequence has no authoritative planned items.", "Provider sequence has no authoritative planned provider items.")
    .replace("Entity sequence ownership lease is not active.", "Provider sequence ownership lease is not active.")
    .replace("Entity sequence next-item evidence is malformed, foreign, or out of deterministic order.", "Provider sequence next-item evidence is malformed, foreign, or out of deterministic order.")
    .replace("Entity sequence refused duplicate execution-item evidence.", "Provider sequence refused duplicate execution-item evidence.")
    .replace("Entity sequence stopped because one execution step did not complete.", "Provider sequence stopped because one provider execution step did not complete.")
    .replace("Entity sequence stopped because no deterministic next item was started.", "Provider sequence stopped because no deterministic next item was started.")
    .replace("Entity sequence reached a non-matching item before the authoritative bound.", "Provider sequence reached a non-provider item before the authoritative provider bound.")
    .replace("Entity sequence exceeded the authoritative planned bound.", "Provider sequence exceeded the authoritative planned provider bound.")
    .replace("All deterministic entity items completed and the first non-matching item was started without execution.", "All deterministic provider items completed and the first non-provider item was started without execution.")
    .replace("Entity sequence terminated without a non-matching handoff.", "Provider sequence terminated without a non-provider handoff.");
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
