import { readFileSync } from "node:fs";

export interface DeploymentRecoveryPersistenceSqlHarnessScenario {
  name: string;
  passed: boolean;
}

export interface DeploymentRecoveryPersistenceSqlHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentRecoveryPersistenceSqlHarnessScenario[];
}

const SQL_PATH = "docs/architecture/supabase_deployment_recovery_plan_persistence.sql";
const PREFLIGHT_PATH = "docs/architecture/supabase_deployment_recovery_plan_persistence_preflight.sql";

export function runDeploymentRecoveryPersistenceSqlHarness(): DeploymentRecoveryPersistenceSqlHarnessResult {
  const sql = normalize(readFileSync(SQL_PATH, "utf8"));
  const preflight = normalize(readFileSync(PREFLIGHT_PATH, "utf8"));
  const scenarios: DeploymentRecoveryPersistenceSqlHarnessScenario[] = [
    check("rollback_not_required parent with zero items", sql, ["rollback_not_required_inconsistent", "v_item_count <> 0"]),
    check("rollback_required executable reversible plan", sql, ["executable_rollback_inconsistent", "v_reversible_count <> v_item_count"]),
    check("rollback_required non-executable unsupported plan", sql, ["non_executable_rollback_unexplained", "p_unsupported_compensations"]),
    check("identical replay returns reused", sql, ["persistence_status := 'reused'", "v_existing.payload_hash = p_payload_hash"]),
    check("conflicting replay returns conflict", sql, ["persistence_status := 'conflict'", "recovery_plan_identity_conflict"]),
    check("duplicate recovery key guarded", sql, ["deployment_recovery_plans_recovery_key_uidx"]),
    check("duplicate rollback item key guarded", sql, ["deployment_recovery_plan_items_plan_item_key_uidx"]),
    check("duplicate rollback sequence guarded", sql, ["deployment_recovery_plan_items_plan_rollback_sequence_uidx"]),
    check("duplicate source execution item guarded", sql, ["deployment_recovery_plan_items_plan_source_item_uidx"]),
    check("foreign clinic child identity rejected", sql, ["deployment_recovery_plan_items_clinic_fk", "v_plan_id, p_clinic_id"]),
    check("foreign run child identity rejected", sql, ["run_row.deployment_run_id = p_deployment_run_key", "p_deployment_run_key, p_session_id"]),
    check("foreign session child identity rejected", sql, ["deployment_recovery_plan_items_session_fk", "session_row.id = p_session_id"]),
    check("foreign execution child identity rejected", sql, ["session_row.execution_key = p_execution_key"]),
    check("foreign plan child identity rejected", sql, ["session_row.plan_key = p_plan_key"]),
    check("malformed recovery status rejected", sql, ["deployment_recovery_plans_status_check", "recovery_decision_invalid"]),
    check("malformed item status rejected", sql, ["deployment_recovery_plan_items_status_check", "status in ('planned', 'blocked')"]),
    check("negative counters rejected", sql, ["deployment_recovery_plans_counter_check", "recovery_counter_invalid"]),
    check("rollback_not_required with items rejected", sql, ["p_recovery_status = 'rollback_not_required'", "v_item_count <> 0"]),
    check("rollback_not_required required flag rejected", sql, ["p_rollback_required or p_rollback_executable or v_item_count <> 0"]),
    check("rollback_not_required executable flag rejected", sql, ["deployment_recovery_plans_decision_shape_check"]),
    check("executable rollback without reversible item rejected", sql, ["v_item_count = 0", "v_reversible_count <> v_item_count"]),
    check("blocked decision executable rejected", sql, ["p_recovery_status in ('blocked', 'not_found')", "p_rollback_executable"]),
    check("not_found decision executable or items rejected", sql, ["p_recovery_status = 'not_found' and v_item_count <> 0"]),
    check("reused binding destructive item rejected", sql, ["expectedpriorstate'->'targetid' <> 'null'::jsonb", "hardware_binding_rollback_identity_invalid"]),
    check("new exact Hardware Binding item accepted", sql, ["remove_deployment_hardware_binding", "expectedcurrentstate'->>'hardwareid'", "newlywritten"]),
    check("running successor stored outside rollback children", sql, ["running_items_to_recover", "deployment_recovery_plan_items"]),
    check("parent and children persisted atomically", sql, ["insert into public.deployment_recovery_plans", "insert into public.deployment_recovery_plan_items", "for v_item in"]),
    check("child failure rolls back parent insert", sql, ["when others then", "no partial recovery plan was retained"]),
    absence("no execution-session mutation", sql, ["update public.deployment_activation_execution_sessions", "insert into public.deployment_activation_execution_sessions", "delete from public.deployment_activation_execution_sessions"]),
    absence("no execution-item mutation", sql, ["update public.deployment_activation_execution_items", "insert into public.deployment_activation_execution_items", "delete from public.deployment_activation_execution_items"]),
    absence("no entity activation mutation", sql, ["update public.clinics", "update public.providers", "update public.sterilizers", "update public.clinical_workstations", "update public.clinical_hardware_devices"]),
    absence("no Hardware Binding removal", sql, ["delete from public.clinical_hardware_devices", "update public.clinical_hardware_devices"]),
    absence("no deployment finalization", sql, ["update public.deployment_runs", "set deployment_status", "set lifecycle_state"]),
    check("unsafe diagnostics rejected", sql, ["unsafe_failure_diagnostics", "unsafe_recovery_evidence", "ownershiptoken", "servicerolekey", "rawexception"]),
    check("rollback ordering deterministic", sql, ["lag((value->>'sourcesequence')::integer)", "previous_source_sequence <= source_sequence", "deployment_recovery_plan_items_plan_source_sequence_uidx"]),
  ];

  return {
    passed:
      scenarios.length === 35 &&
      scenarios.every((scenario) => scenario.passed) &&
      (preflight.match(/^  select [0-9]+,/gm) ?? []).length === 35,
    scenarios,
  };
}

function check(name: string, source: string, fragments: readonly string[]): DeploymentRecoveryPersistenceSqlHarnessScenario {
  return { name, passed: fragments.every((fragment) => source.includes(fragment.toLowerCase())) };
}

function absence(name: string, source: string, fragments: readonly string[]): DeploymentRecoveryPersistenceSqlHarnessScenario {
  return { name, passed: fragments.every((fragment) => !source.includes(fragment.toLowerCase())) };
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").toLowerCase();
}
