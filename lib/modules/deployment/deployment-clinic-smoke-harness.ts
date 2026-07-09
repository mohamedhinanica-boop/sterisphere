import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentDraft } from "./deployment-draft";
import {
  createClinicRootForServerDeploymentRun,
  type ServerDeploymentClinicRootResult,
} from "./deployment-clinic-server";

export interface DeploymentClinicSmokeHarnessInput {
  deploymentRunId: string;
  conflictDeploymentRunId?: string;
  draft: DeploymentDraft;
  createdAt?: string;
  deploymentVersion?: string;
  schemaVersion?: string;
}

export interface DeploymentClinicSmokeHarnessStep {
  name: string;
  ok: boolean;
  status: ServerDeploymentClinicRootResult["status"];
  clinicId: string | null;
  deploymentRunId: string | null;
  message: string;
}

export interface DeploymentClinicSmokeHarnessResult {
  passed: boolean;
  steps: readonly DeploymentClinicSmokeHarnessStep[];
  createdOrReusedClinicId: string | null;
}

/**
 * Private server-only smoke harness for RC3 clinic-root persistence.
 *
 * The caller must provide existing deployment_run ids. This harness does not
 * create deployment_runs, expose routes, call DeploymentEngine.execute(), or
 * create downstream clinic configuration.
 */
export async function runDeploymentClinicSmokeHarness(
  client: SupabaseClient,
  input: DeploymentClinicSmokeHarnessInput,
): Promise<DeploymentClinicSmokeHarnessResult> {
  const firstResult = await createClinicRootForServerDeploymentRun(client, {
    deploymentRunId: input.deploymentRunId,
    draft: input.draft,
    createdAt: input.createdAt,
    deploymentVersion: input.deploymentVersion,
    schemaVersion: input.schemaVersion,
  });
  const retryResult = await createClinicRootForServerDeploymentRun(client, {
    deploymentRunId: input.deploymentRunId,
    draft: input.draft,
    createdAt: input.createdAt,
    deploymentVersion: input.deploymentVersion,
    schemaVersion: input.schemaVersion,
  });
  const conflictResult = input.conflictDeploymentRunId
    ? await createClinicRootForServerDeploymentRun(client, {
        deploymentRunId: input.conflictDeploymentRunId,
        draft: input.draft,
        createdAt: input.createdAt,
        deploymentVersion: input.deploymentVersion,
        schemaVersion: input.schemaVersion,
      })
    : null;
  const steps = [
    mapSmokeStep("create-or-reuse clinic root", firstResult),
    mapSmokeStep("retry same deployment_run", retryResult),
    ...(conflictResult
      ? [mapSmokeStep("same clinic_code different deployment_run", conflictResult)]
      : []),
  ];
  const expectedConflictPassed =
    !conflictResult || conflictResult.status === "conflict";

  return {
    passed:
      firstResult.ok &&
      retryResult.ok &&
      retryResult.status === "reused" &&
      expectedConflictPassed,
    steps,
    createdOrReusedClinicId:
      firstResult.clinic?.id ?? retryResult.clinic?.id ?? null,
  };
}

function mapSmokeStep(
  name: string,
  result: ServerDeploymentClinicRootResult,
): DeploymentClinicSmokeHarnessStep {
  return {
    name,
    ok: result.ok,
    status: result.status,
    clinicId: result.clinic?.id ?? null,
    deploymentRunId: result.deploymentRun?.deploymentRunId ?? null,
    message: result.message,
  };
}
