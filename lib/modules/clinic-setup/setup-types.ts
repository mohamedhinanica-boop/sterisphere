import type {
  WorkstationCapability,
  WorkstationType,
} from "@/lib/modules/clinical-workstations";

export type SetupCompletionStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export interface ClinicProfileSetup {
  clinicName: string;
  legalCompanyName: string;
  clinicCode: string;
  logoUrl: string | null;
  country: string;
  region: string;
  timezone: string;
  primaryLanguage: string;
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  postalCode: string;
}

export const EMPTY_CLINIC_PROFILE: ClinicProfileSetup = {
  clinicName: "",
  legalCompanyName: "",
  clinicCode: "",
  logoUrl: null,
  country: "",
  region: "",
  timezone: "",
  primaryLanguage: "",
  phone: "",
  email: "",
  website: "",
  street: "",
  city: "",
  postalCode: "",
};

export interface ClinicalWorkstationSetup {
  setupId: string;
  name: string;
  workstationType: WorkstationType;
  roomNumber?: string;
  locationLabel?: string;
  capabilities: WorkstationCapability[];
}

export interface ProviderSetup {
  setupId: string;
  fullName: string;
  displayName?: string;
  role?: string;
  active: boolean;
}

export interface SterilizerSetup {
  setupId: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  assignedWorkstationSetupId?: string;
}

export interface PolicySetup {
  packExpiryDays?: number;
  biologicalIndicatorFrequency?: string;
  chemicalIndicatorRequired?: boolean;
  autoPrintLabels?: boolean;
  auditRetentionDays?: number;
}

export interface HardwareDeviceSetup {
  setupId: string;
  name: string;
  deviceType: string;
  capabilities: string[];
  assignedWorkstationSetupId?: string;
  clinicAgentSetupId?: string;
}

export interface ClinicAgentSetup {
  setupId: string;
  name: string;
  assignedWorkstationSetupId?: string;
}

export interface HardwareSetup {
  clinicAgents: ClinicAgentSetup[];
  devices: HardwareDeviceSetup[];
}

export interface FutureSetupExpansion {
  key: string;
  label: string;
  enabled: boolean;
  configuration?: Readonly<Record<string, unknown>>;
}

export interface ClinicSetupConfiguration {
  clinicProfile: ClinicProfileSetup;
  workstations: ClinicalWorkstationSetup[];
  providers: ProviderSetup[];
  sterilizers: SterilizerSetup[];
  policies: PolicySetup;
  hardware: HardwareSetup;
  completionStatus: SetupCompletionStatus;
  futureExpansion: FutureSetupExpansion[];
}
