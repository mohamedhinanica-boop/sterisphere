import {
  DeploymentStage,
  type DeploymentStage as DeploymentStageId,
} from "./deployment-types";

export interface DeploymentStageDefinition {
  id: DeploymentStageId;
  displayName: string;
  description: string;
  rollbackBoundary: string;
}

export const DEPLOYMENT_STAGES: readonly DeploymentStageDefinition[] = [
  {
    id: DeploymentStage.VALIDATION,
    displayName: "Validate Deployment Draft",
    description:
      "Revalidate the exact reviewed deployment snapshot at the trusted boundary.",
    rollbackBoundary: "No operational writes have occurred.",
  },
  {
    id: DeploymentStage.CREATE_RUN,
    displayName: "Create Deployment Run",
    description:
      "Establish durable attempt identity for idempotency, audit, and diagnostics.",
    rollbackBoundary:
      "The run remains as evidence and is not removed by later rollback.",
  },
  {
    id: DeploymentStage.LOCK,
    displayName: "Lock Deployment",
    description:
      "Prevent concurrent or duplicate execution for the deployment target.",
    rollbackBoundary:
      "No clinic configuration exists; a lock owned by a failed run must be released.",
  },
  {
    id: DeploymentStage.CREATE_CLINIC,
    displayName: "Create Clinic",
    description:
      "Materialize the canonical clinic identity and tenancy root.",
    rollbackBoundary:
      "The clinic and subsequent configuration enter the atomic deployment unit.",
  },
  {
    id: DeploymentStage.CREATE_SETTINGS,
    displayName: "Create Clinic Settings",
    description: "Create the reviewed clinic-owned settings baseline.",
    rollbackBoundary: "Settings roll back with the clinic configuration.",
  },
  {
    id: DeploymentStage.CREATE_WORKSTATIONS,
    displayName: "Create Workstations",
    description:
      "Convert the reviewed room plan into clinic-owned workstations.",
    rollbackBoundary:
      "Workstations created by the run roll back with clinic configuration.",
  },
  {
    id: DeploymentStage.CREATE_STERILIZERS,
    displayName: "Create Sterilizers",
    description:
      "Create reviewed sterilizers and their approved workstation relationships.",
    rollbackBoundary:
      "Sterilizers created by the run belong to the atomic deployment unit.",
  },
  {
    id: DeploymentStage.CREATE_PLANNING,
    displayName: "Create Planning Records",
    description:
      "Preserve provider and hardware quantities without creating operational identities or devices.",
    rollbackBoundary:
      "Planning records roll back with clinic configuration.",
  },
  {
    id: DeploymentStage.APPLY_POLICIES,
    displayName: "Apply Baseline Policies",
    description:
      "Initialize reviewed policy choices and required SteriSphere safeguards.",
    rollbackBoundary: "Policy records belong to the atomic deployment unit.",
  },
  {
    id: DeploymentStage.INITIALIZE_DEFAULTS,
    displayName: "Initialize Default Configuration",
    description:
      "Create deterministic defaults required to open the clinic workspace safely.",
    rollbackBoundary:
      "Defaults roll back with clinic configuration if deployment fails.",
  },
  {
    id: DeploymentStage.AUDIT,
    displayName: "Create Initial Audit Entries",
    description:
      "Record deployment approval, initiator, versions, and configuration domains.",
    rollbackBoundary:
      "Success entries roll back on failure; run-level attempt evidence remains.",
  },
  {
    id: DeploymentStage.FINALIZE,
    displayName: "Mark Clinic Deployed",
    description:
      "Commit the operational transition after every required stage succeeds.",
    rollbackBoundary:
      "This is the atomic commit boundary; failure leaves the clinic unavailable.",
  },
  {
    id: DeploymentStage.UNLOCK,
    displayName: "Unlock Dashboard",
    description:
      "Allow authorization and routing to recognize the deployed clinic.",
    rollbackBoundary:
      "Access failure does not repeat or roll back an already committed deployment.",
  },
  {
    id: DeploymentStage.REDIRECT,
    displayName: "Redirect to Dashboard",
    description:
      "Return the result and move the initiating Super Admin to the dashboard.",
    rollbackBoundary:
      "Navigation failure does not roll back a successful deployment.",
  },
] as const;

export const DEPLOYMENT_STAGE_BY_ID: Readonly<
  Record<DeploymentStageId, DeploymentStageDefinition>
> = Object.freeze(
  Object.fromEntries(
    DEPLOYMENT_STAGES.map((stage) => [stage.id, stage]),
  ) as Record<DeploymentStageId, DeploymentStageDefinition>,
);
