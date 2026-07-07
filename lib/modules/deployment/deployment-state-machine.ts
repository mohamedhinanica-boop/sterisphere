import {
  DeploymentStatus,
  type DeploymentStatus as DeploymentStatusId,
} from "./deployment-types";
import type {
  DeploymentLifecycleState as DeploymentLifecycleStateId,
  DeploymentLifecycleSummary,
  DeploymentStateSnapshot,
  DeploymentTransition,
  DeploymentTransitionResult,
  DeploymentTransitionRule,
  SimulateDeploymentLifecycleInput,
} from "./deployment-state-machine-types";

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

export const DeploymentLifecycleStates = {
  DRAFT: "draft",
  VALIDATING: "validating",
  READY: "ready",
  LOCKED: "locked",
  EXECUTING: "executing",
  ROLLING_BACK: "rolling_back",
  ROLLBACK_VERIFICATION: "rollback_verification",
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked",
  MANUAL_RECOVERY: "manual_recovery",
  CANCELLED: "cancelled",
} as const satisfies Record<string, DeploymentLifecycleStateId>;

export const DEPLOYMENT_LIFECYCLE_TRANSITION_RULES: readonly DeploymentTransitionRule[] =
  [
    {
      from: "draft",
      to: "validating",
      description: "A reviewed draft enters trusted validation.",
    },
    {
      from: "validating",
      to: "ready",
      description: "Validation passed and deployment may request a run.",
    },
    {
      from: "validating",
      to: "failed",
      description: "Validation failed before deployment execution.",
    },
    {
      from: "ready",
      to: "locked",
      description: "Idempotency and durable locking accepted the request.",
    },
    {
      from: "ready",
      to: "failed",
      description: "Idempotency or pre-lock checks rejected the request.",
    },
    {
      from: "locked",
      to: "executing",
      description: "The deployment run begins configuration execution.",
    },
    {
      from: "locked",
      to: "failed",
      description: "Lock acquisition failed before execution.",
    },
    {
      from: "executing",
      to: "completed",
      description: "All deployment stages completed successfully.",
    },
    {
      from: "executing",
      to: "rolling_back",
      description: "Execution failed after work that requires rollback.",
    },
    {
      from: "executing",
      to: "failed",
      description: "Execution failed before rollback-relevant work occurred.",
    },
    {
      from: "rolling_back",
      to: "rollback_verification",
      description: "Rollback finished and must be verified.",
    },
    {
      from: "rolling_back",
      to: "blocked",
      description: "Rollback could not complete and deployment is blocked.",
    },
    {
      from: "rollback_verification",
      to: "completed",
      description: "Rollback was verified and retry is safe.",
    },
    {
      from: "rollback_verification",
      to: "manual_recovery",
      description: "Rollback was partial and needs manual recovery.",
    },
    {
      from: "rollback_verification",
      to: "blocked",
      description: "Rollback verification failed and intervention is required.",
    },
    {
      from: "manual_recovery",
      to: "ready",
      description: "Manual recovery completed and retry may be prepared.",
    },
    {
      from: "manual_recovery",
      to: "blocked",
      description: "Manual recovery found an unreconciled deployment state.",
    },
    {
      from: "draft",
      to: "cancelled",
      description: "A draft deployment target was cancelled.",
    },
    {
      from: "ready",
      to: "cancelled",
      description: "A ready deployment target was cancelled before locking.",
    },
    {
      from: "failed",
      to: "ready",
      description: "A non-rollback failure was corrected and may retry.",
    },
    {
      from: "blocked",
      to: "manual_recovery",
      description: "Administrator intervention opens a manual recovery path.",
    },
  ] as const;

export const LEGAL_DEPLOYMENT_LIFECYCLE_TRANSITIONS: Readonly<
  Record<DeploymentLifecycleStateId, readonly DeploymentLifecycleStateId[]>
> = Object.freeze(
  DEPLOYMENT_LIFECYCLE_TRANSITION_RULES.reduce(
    (rules, rule) => ({
      ...rules,
      [rule.from]: [...rules[rule.from], rule.to],
    }),
    {
      draft: [],
      validating: [],
      ready: [],
      locked: [],
      executing: [],
      rolling_back: [],
      rollback_verification: [],
      completed: [],
      failed: [],
      blocked: [],
      manual_recovery: [],
      cancelled: [],
    } as Record<DeploymentLifecycleStateId, DeploymentLifecycleStateId[]>,
  ),
);

export function isValidDeploymentTransition(
  from: DeploymentLifecycleStateId,
  to: DeploymentLifecycleStateId,
): boolean {
  return LEGAL_DEPLOYMENT_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function transitionDeploymentState(
  snapshot: DeploymentStateSnapshot,
  to: DeploymentLifecycleStateId,
  transitionedAt: string,
  reason: string,
): DeploymentTransitionResult {
  if (!isValidDeploymentTransition(snapshot.state, to)) {
    return {
      allowed: false,
      snapshot,
      message: `Illegal deployment lifecycle transition from ${snapshot.state} to ${to}.`,
    };
  }

  const transition: DeploymentTransition = {
    from: snapshot.state,
    to,
    transitionedAt,
    reason,
  };

  return {
    allowed: true,
    transition,
    snapshot: {
      ...snapshot,
      previousState: snapshot.state,
      state: to,
      updatedAt: transitionedAt,
      transitions: [...snapshot.transitions, transition],
    },
    message: `Deployment lifecycle transitioned from ${snapshot.state} to ${to}.`,
  };
}

export function buildDeploymentStateSnapshot(input: {
  state?: DeploymentLifecycleStateId;
  previousState?: DeploymentLifecycleStateId | null;
  clinicId?: string | null;
  deploymentRunId?: string | null;
  updatedAt: string;
  transitions?: readonly DeploymentTransition[];
}): DeploymentStateSnapshot {
  return {
    state: input.state ?? "draft",
    previousState: input.previousState ?? null,
    clinicId: input.clinicId ?? null,
    deploymentRunId: input.deploymentRunId ?? null,
    updatedAt: input.updatedAt,
    transitions: input.transitions ?? [],
  };
}

export function summarizeDeploymentLifecycle(
  snapshot: DeploymentStateSnapshot,
): DeploymentLifecycleSummary {
  const manualRecoveryRequired =
    snapshot.state === "manual_recovery" || snapshot.state === "blocked";
  const retryAllowed =
    snapshot.state === "ready" ||
    snapshot.transitions.some(
      (transition) =>
        transition.from === "rollback_verification" &&
        transition.to === "completed",
    );

  return {
    currentState: snapshot.state,
    previousState: snapshot.previousState,
    transitionCount: snapshot.transitions.length,
    terminal:
      snapshot.state === "completed" ||
      snapshot.state === "blocked" ||
      snapshot.state === "cancelled",
    retryAllowed,
    manualRecoveryRequired,
    administratorInterventionRequired: snapshot.state === "blocked",
    messages: buildLifecycleMessages(snapshot, retryAllowed),
  };
}

export function simulateDeploymentLifecycle(
  input: SimulateDeploymentLifecycleInput,
): DeploymentLifecycleSummary {
  let snapshot = buildDeploymentStateSnapshot({
    updatedAt: input.startedAt,
    clinicId: input.clinicId,
    deploymentRunId: input.deploymentRunId,
  });

  for (const transition of buildSimulatedTransitions(input)) {
    const result = transitionDeploymentState(
      snapshot,
      transition.to,
      transition.at,
      transition.reason,
    );

    if (!result.allowed) {
      return {
        ...summarizeDeploymentLifecycle(snapshot),
        messages: [
          ...summarizeDeploymentLifecycle(snapshot).messages,
          result.message,
        ],
      };
    }

    snapshot = result.snapshot;
  }

  return summarizeDeploymentLifecycle(snapshot);
}

function buildSimulatedTransitions(
  input: SimulateDeploymentLifecycleInput,
): ReadonlyArray<{
  to: DeploymentLifecycleStateId;
  at: string;
  reason: string;
}> {
  if (input.status === "succeeded") {
    return [
      { to: "validating", at: input.startedAt, reason: "Simulation started." },
      { to: "ready", at: input.startedAt, reason: "Draft validation passed." },
      { to: "locked", at: input.startedAt, reason: "Simulated lock accepted." },
      { to: "executing", at: input.startedAt, reason: "Simulated execution started." },
      { to: "completed", at: input.completedAt, reason: "Simulation completed successfully." },
    ];
  }

  if (!input.rollbackRequired) {
    return [
      { to: "validating", at: input.startedAt, reason: "Simulation started." },
      {
        to: "failed",
        at: input.completedAt,
        reason: "Simulation failed before rollback-relevant work completed.",
      },
    ];
  }

  if (input.rollbackVerified && !input.manualRecoveryRequired) {
    return [
      { to: "validating", at: input.startedAt, reason: "Simulation started." },
      { to: "ready", at: input.startedAt, reason: "Draft validation passed." },
      { to: "locked", at: input.startedAt, reason: "Simulated lock accepted." },
      { to: "executing", at: input.startedAt, reason: "Simulated execution started." },
      {
        to: "rolling_back",
        at: input.completedAt,
        reason: "Simulation failed and rollback was required.",
      },
      {
        to: "rollback_verification",
        at: input.completedAt,
        reason: "Rollback verification started.",
      },
      {
        to: "completed",
        at: input.completedAt,
        reason: "Rollback verified; retry is safe.",
      },
    ];
  }

  return [
    { to: "validating", at: input.startedAt, reason: "Simulation started." },
    { to: "ready", at: input.startedAt, reason: "Draft validation passed." },
    { to: "locked", at: input.startedAt, reason: "Simulated lock accepted." },
    { to: "executing", at: input.startedAt, reason: "Simulated execution started." },
    {
      to: "rolling_back",
      at: input.completedAt,
      reason: "Simulation failed and rollback was required.",
    },
    {
      to: "rollback_verification",
      at: input.completedAt,
      reason: "Rollback verification started.",
    },
    {
      to: input.manualRecoveryRequired ? "manual_recovery" : "blocked",
      at: input.completedAt,
      reason: input.manualRecoveryRequired
        ? "Rollback verification requires manual recovery."
        : "Rollback verification blocked deployment retry.",
    },
  ];
}

function buildLifecycleMessages(
  snapshot: DeploymentStateSnapshot,
  retryAllowed: boolean,
): readonly string[] {
  if (snapshot.state === "blocked") {
    return [
      "Deployment lifecycle is blocked pending administrator intervention.",
    ];
  }

  if (snapshot.state === "manual_recovery") {
    return [
      "Deployment lifecycle requires manual recovery before retry.",
    ];
  }

  if (retryAllowed) {
    return [
      "Deployment lifecycle permits retry through the normal deployment gates.",
    ];
  }

  return [`Deployment lifecycle state is ${snapshot.state}.`];
}
