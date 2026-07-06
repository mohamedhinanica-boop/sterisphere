import {
  SupabaseDeploymentRepository,
  type DeploymentRepository,
} from "./deployment-repository";

export function createDeploymentRepository(): DeploymentRepository {
  return new SupabaseDeploymentRepository();
}
