import {
  DeploymentStatus,
  type DeploymentStatus as DeploymentStatusId,
} from "./deployment-types";

export const LEGAL_DEPLOYMENT_TRANSITIONS: Readonly<
  Record<DeploymentStatusId, readonly DeploymentStatusId[]>
> = Object.freeze({
  [DeploymentStatus.DRAFT]: [
    DeploymentStatus.DEPLOYING,
    DeploymentStatus.ARCHIVED,
  ],
  [DeploymentStatus.DEPLOYING]: [
    DeploymentStatus.DEPLOYED,
    DeploymentStatus.FAILED,
  ],
  [DeploymentStatus.DEPLOYED]: [DeploymentStatus.ARCHIVED],
  [DeploymentStatus.FAILED]: [
    DeploymentStatus.DEPLOYING,
    DeploymentStatus.ARCHIVED,
  ],
  [DeploymentStatus.ARCHIVED]: [],
});

export function getLegalDeploymentTransitions(
  status: DeploymentStatusId,
): readonly DeploymentStatusId[] {
  return LEGAL_DEPLOYMENT_TRANSITIONS[status];
}

export function canTransitionDeployment(
  from: DeploymentStatusId,
  to: DeploymentStatusId,
): boolean {
  return LEGAL_DEPLOYMENT_TRANSITIONS[from].includes(to);
}

export function isIllegalDeploymentTransition(
  from: DeploymentStatusId,
  to: DeploymentStatusId,
): boolean {
  return !canTransitionDeployment(from, to);
}
