import "server-only";

import type {
  CreateDeploymentClinicPayload,
  DeploymentClinicLinkCommand,
  DeploymentClinicLinkResult,
  DeploymentClinicRecord,
} from "./deployment-clinic-types";

const DEPLOYMENT_CLINIC_PERSISTENCE_NOT_IMPLEMENTED =
  "Deployment clinic root persistence has not been implemented.";

export interface DeploymentClinicPersistenceResult {
  ok: boolean;
  clinic: DeploymentClinicRecord | null;
  message: string;
}

export interface DeploymentClinicRepository {
  findClinicById(clinicId: string): Promise<DeploymentClinicRecord | null>;
  findClinicByCode(clinicCode: string): Promise<DeploymentClinicRecord | null>;
  createClinic(
    payload: CreateDeploymentClinicPayload,
  ): Promise<DeploymentClinicPersistenceResult>;
  linkClinicToDeploymentRun(
    command: DeploymentClinicLinkCommand,
  ): Promise<DeploymentClinicLinkResult>;
}

export class InertDeploymentClinicRepository
  implements DeploymentClinicRepository
{
  async findClinicById(
    _clinicId: string,
  ): Promise<DeploymentClinicRecord | null> {
    return deploymentClinicPersistenceNotImplemented();
  }

  async findClinicByCode(
    _clinicCode: string,
  ): Promise<DeploymentClinicRecord | null> {
    return deploymentClinicPersistenceNotImplemented();
  }

  async createClinic(
    _payload: CreateDeploymentClinicPayload,
  ): Promise<DeploymentClinicPersistenceResult> {
    return deploymentClinicPersistenceNotImplemented();
  }

  async linkClinicToDeploymentRun(
    _command: DeploymentClinicLinkCommand,
  ): Promise<DeploymentClinicLinkResult> {
    return deploymentClinicPersistenceNotImplemented();
  }
}

function deploymentClinicPersistenceNotImplemented(): never {
  throw new Error(DEPLOYMENT_CLINIC_PERSISTENCE_NOT_IMPLEMENTED);
}
