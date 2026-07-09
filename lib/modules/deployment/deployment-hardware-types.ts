import type { DeploymentDraft } from "./deployment-draft";

export type DeploymentHardwareType = "label_printer" | "usb_scanner";

export type DeploymentHardwareCapability =
  | "label_printing"
  | "barcode_scanning";

export type DeploymentHardwareStatus = "planned" | "active" | "archived";

export type DeploymentHardwareProvisioningSource = "setup_draft";

export type DeploymentHardwareProvisioningStatus =
  | "planned"
  | "active"
  | "archived";

export interface DeploymentHardwareShellRecord {
  id: string;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  name: string;
  hardwareType: DeploymentHardwareType;
  quantity: number;
  displayOrder: number;
  status: DeploymentHardwareStatus;
  capabilities: readonly DeploymentHardwareCapability[];
  assignedWorkstationKey: string | null;
  assignedSterilizerKey: string | null;
  active: boolean;
  provisioningSource: DeploymentHardwareProvisioningSource | string | null;
  provisioningStatus: DeploymentHardwareProvisioningStatus;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateDeploymentHardwareShellPayload {
  clinicId: string;
  deploymentHardwareKey: string;
  name: string;
  hardwareType: DeploymentHardwareType;
  quantity: number;
  displayOrder: number;
  status: "planned";
  capabilities: readonly DeploymentHardwareCapability[];
  assignedWorkstationKey: string | null;
  assignedSterilizerKey: string | null;
  active: boolean;
  provisioningSource: DeploymentHardwareProvisioningSource;
  provisioningStatus: "planned";
  createdAt?: string;
  updatedAt?: string;
}

export interface DeploymentHardwareProvisionCommand {
  clinicId: string;
  draft: DeploymentDraft;
  createdAt: string;
}

export type DeploymentHardwareProvisionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected";

export interface DeploymentHardwareProvisionCounts {
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
}

export interface DeploymentHardwareProvisionResult {
  ok: boolean;
  status: DeploymentHardwareProvisionStatus;
  hardware: readonly DeploymentHardwareShellRecord[];
  counts: DeploymentHardwareProvisionCounts;
  message: string;
}