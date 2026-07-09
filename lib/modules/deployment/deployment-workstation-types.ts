import type {
  WorkstationCapabilities,
  WorkstationStatus,
  WorkstationType,
} from "@/lib/modules/clinical-workstations";
import type { DeploymentDraft } from "./deployment-draft";

export type DeploymentWorkstationProvisioningSource = "setup_draft";

export type DeploymentWorkstationProvisioningStatus =
  | "planned"
  | "active"
  | "archived";

export interface DeploymentWorkstationShellRecord {
  id: string;
  clinicId: string | null;
  deploymentWorkstationKey: string | null;
  name: string;
  workstationType: WorkstationType;
  displayOrder: number;
  status: WorkstationStatus;
  capabilities: WorkstationCapabilities;
  locationLabel: string | null;
  agentUrl: string | null;
  active: boolean;
  provisioningSource: DeploymentWorkstationProvisioningSource | string | null;
  provisioningStatus: DeploymentWorkstationProvisioningStatus;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateDeploymentWorkstationShellPayload {
  clinicId: string;
  deploymentWorkstationKey: string;
  name: string;
  workstationType: WorkstationType;
  displayOrder: number;
  status: "planned";
  capabilities: WorkstationCapabilities;
  locationLabel: string | null;
  agentUrl: string | null;
  active: boolean;
  provisioningSource: DeploymentWorkstationProvisioningSource;
  provisioningStatus: "planned";
  createdAt?: string;
  updatedAt?: string;
}

export interface DeploymentWorkstationProvisionCommand {
  clinicId: string;
  draft: DeploymentDraft;
  createdAt: string;
}

export type DeploymentWorkstationProvisionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected";

export interface DeploymentWorkstationProvisionCounts {
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
}

export interface DeploymentWorkstationProvisionResult {
  ok: boolean;
  status: DeploymentWorkstationProvisionStatus;
  workstations: readonly DeploymentWorkstationShellRecord[];
  counts: DeploymentWorkstationProvisionCounts;
  message: string;
}
