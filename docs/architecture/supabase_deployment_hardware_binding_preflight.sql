-- RC10.2 - Atomic Hardware Binding RPC (V1) read-only preflight and contract harness.
-- This script does not bind hardware or mutate any table.

with required_tables(check_name, relation_name) as (
  values
    ('table_execution_sessions_exists', 'public.deployment_activation_execution_sessions'),
    ('table_execution_items_exists', 'public.deployment_activation_execution_items'),
    ('table_hardware_exists', 'public.clinical_hardware_devices'),
    ('table_assignments_exists', 'public.deployment_hardware_assignments'),
    ('table_workstations_exists', 'public.clinical_workstations'),
    ('table_sterilizers_exists', 'public.sterilizers')
)
select
  check_name,
  to_regclass(relation_name) is not null as passed,
  jsonb_build_object('relation', relation_name) as details
from required_tables
order by check_name;

with required_columns(column_name) as (
  values
    ('default_workstation_id'),
    ('current_workstation_id'),
    ('default_sterilizer_id'),
    ('current_sterilizer_id')
)
select
  'hardware_binding_columns_exist' as check_name,
  count(c.column_name) = 4 as passed,
  jsonb_build_object(
    'found', coalesce(jsonb_agg(c.column_name order by c.column_name)
      filter (where c.column_name is not null), '[]'::jsonb)
  ) as details
from required_columns required
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = 'clinical_hardware_devices'
 and c.column_name = required.column_name;

with contract as (
  select
    'public.bind_deployment_hardware_target(uuid,text,uuid,text,text,text,timestamp with time zone,uuid,text,text,integer,text,text,text,timestamp with time zone,integer,uuid,text,text,uuid,text,jsonb,jsonb,timestamp with time zone)'::text
      as signature
), function_row as (
  select
    p.oid,
    p.prosecdef,
    p.proconfig,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_function_result(p.oid) as result_contract,
    pg_get_functiondef(p.oid) as definition
  from contract
  join pg_proc p on p.oid = to_regprocedure(contract.signature)
)
select
  'binding_rpc_contract' as check_name,
  oid is not null
    and prosecdef
    and proconfig @> array['search_path=pg_catalog, public']
    and result_contract ilike '%status text%'
    and result_contract ilike '%binding_written boolean%'
    and result_contract ilike '%hardware_id uuid%'
    and result_contract ilike '%target_id uuid%'
    and result_contract ilike '%previous_state jsonb%'
    and result_contract ilike '%resulting_state jsonb%'
    and result_contract ilike '%binding_timestamp timestamp with time zone%'
    and result_contract ilike '%issue_code text%'
    as passed,
  jsonb_build_object(
    'securityDefiner', prosecdef,
    'configuration', proconfig,
    'arguments', identity_arguments,
    'result', result_contract
  ) as details
from function_row;

with function_oid as (
  select to_regprocedure(
    'public.bind_deployment_hardware_target(uuid,text,uuid,text,text,text,timestamp with time zone,uuid,text,text,integer,text,text,text,timestamp with time zone,integer,uuid,text,text,uuid,text,jsonb,jsonb,timestamp with time zone)'
  ) as oid
)
select
  'binding_rpc_service_role_only' as check_name,
  has_function_privilege('service_role', oid, 'EXECUTE')
    and not has_function_privilege('anon', oid, 'EXECUTE')
    and not has_function_privilege('authenticated', oid, 'EXECUTE')
    as passed,
  jsonb_build_object(
    'serviceRoleExecute', has_function_privilege('service_role', oid, 'EXECUTE'),
    'anonExecute', has_function_privilege('anon', oid, 'EXECUTE'),
    'authenticatedExecute', has_function_privilege('authenticated', oid, 'EXECUTE')
  ) as details
from function_oid;

-- Pure compare-and-set harness. UUIDs are deliberately distinct from the
-- deterministic deployment keys.
with ids as (
  select
    '10000000-0000-4000-8000-000000000001'::uuid as workstation_id,
    '20000000-0000-4000-8000-000000000001'::uuid as sterilizer_id,
    '30000000-0000-4000-8000-000000000001'::uuid as other_workstation_id
), cases(
  case_name,
  target_type,
  target_id,
  default_workstation_id,
  current_workstation_id,
  default_sterilizer_id,
  current_sterilizer_id,
  expected_status
) as (
  select 'workstation_bind', 'workstation', workstation_id,
    null::uuid, null::uuid, null::uuid, null::uuid, 'bound' from ids
  union all
  select 'sterilizer_bind', 'sterilizer', sterilizer_id,
    null, null, null, null, 'bound' from ids
  union all
  select 'workstation_replay', 'workstation', workstation_id,
    workstation_id, workstation_id, null, null, 'already_bound' from ids
  union all
  select 'sterilizer_replay', 'sterilizer', sterilizer_id,
    null, null, sterilizer_id, sterilizer_id, 'already_bound' from ids
  union all
  select 'different_workstation', 'workstation', workstation_id,
    other_workstation_id, other_workstation_id, null, null, 'conflict' from ids
  union all
  select 'different_sterilizer', 'sterilizer', sterilizer_id,
    null, null, '20000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid, 'conflict' from ids
  union all
  select 'mixed_family', 'workstation', workstation_id,
    workstation_id, workstation_id, sterilizer_id, sterilizer_id, 'conflict' from ids
), observed as (
  select
    case_name,
    expected_status,
    case
      when target_type = 'workstation'
       and default_workstation_id = target_id
       and current_workstation_id = target_id
       and default_sterilizer_id is null
       and current_sterilizer_id is null then 'already_bound'
      when target_type = 'sterilizer'
       and default_sterilizer_id = target_id
       and current_sterilizer_id = target_id
       and default_workstation_id is null
       and current_workstation_id is null then 'already_bound'
      when default_workstation_id is not null
        or current_workstation_id is not null
        or default_sterilizer_id is not null
        or current_sterilizer_id is not null then 'conflict'
      else 'bound'
    end as actual_status
  from cases
)
select
  'binding_compare_and_set_cases' as check_name,
  bool_and(actual_status = expected_status) as passed,
  jsonb_object_agg(
    case_name,
    jsonb_build_object('expected', expected_status, 'actual', actual_status)
  ) as details
from observed;

-- Clinic, activation, ownership, and lease contract cases. These model the
-- exact predicates retained by the RPC without writing fixtures.
with cases(
  case_name,
  hardware_clinic_matches,
  target_clinic_matches,
  target_active,
  owner_matches,
  token_matches,
  lease_compare_matches,
  lease_active,
  expected_allowed
) as (
  values
    ('valid_workstation_target', true, true, true, true, true, true, true, true),
    ('valid_sterilizer_target', true, true, true, true, true, true, true, true),
    ('cross_clinic_target', true, false, true, true, true, true, true, false),
    ('inactive_target', true, true, false, true, true, true, true, false),
    ('stale_lease', true, true, true, true, true, true, false, false),
    ('claimant_failure', true, true, true, false, true, true, true, false),
    ('token_failure', true, true, true, true, false, true, true, false),
    ('lease_compare_failure', true, true, true, true, true, false, true, false)
), observed as (
  select
    case_name,
    expected_allowed,
    hardware_clinic_matches
      and target_clinic_matches
      and target_active
      and owner_matches
      and token_matches
      and lease_compare_matches
      and lease_active as actual_allowed
  from cases
)
select
  'binding_security_and_target_cases' as check_name,
  bool_and(actual_allowed = expected_allowed) as passed,
  jsonb_object_agg(
    case_name,
    jsonb_build_object('expected', expected_allowed, 'actual', actual_allowed)
  ) as details
from observed;

-- Source audit: the function may update only the selected Hardware row and
-- only the four durable V1 binding fields. Assignment and execution tables are
-- read/locked but never mutated.
with source as (
  select lower(regexp_replace(pg_get_functiondef(
    'public.bind_deployment_hardware_target(uuid,text,uuid,text,text,text,timestamp with time zone,uuid,text,text,integer,text,text,text,timestamp with time zone,integer,uuid,text,text,uuid,text,jsonb,jsonb,timestamp with time zone)'::regprocedure
  ), '\s+', ' ', 'g')) as body
), checks as (
  select
    body ~ 'update public\.clinical_hardware_devices update_hardware set default_workstation_id = p_target_id, current_workstation_id = p_target_id, default_sterilizer_id = null, current_sterilizer_id = null'
      as writes_only_workstation_binding_fields,
    body ~ 'update public\.clinical_hardware_devices update_hardware set default_sterilizer_id = p_target_id, current_sterilizer_id = p_target_id, default_workstation_id = null, current_workstation_id = null'
      as writes_only_sterilizer_binding_fields,
    body !~ 'update public\.deployment_activation_execution_items'
      as does_not_complete_or_start_items,
    body !~ 'update public\.deployment_activation_execution_sessions'
      as does_not_update_sessions,
    body !~ 'update public\.deployment_hardware_assignments'
      as does_not_mutate_assignments,
    body !~ 'insert into|delete from'
      as does_not_insert_or_delete,
    body ~ 'v_session\.execution_owner is distinct from p_claimant_id'
      as validates_claimant,
    body ~ 'v_session\.ownership_token is distinct from p_ownership_token'
      as validates_token,
    body ~ 'v_session\.lease_expires_at is distinct from p_expected_lease_expires_at'
      as validates_lease_compare,
    body ~ 'v_session\.lease_expires_at <= p_proposed_bound_at'
      as validates_active_lease,
    body ~ 'v_item\.entity_type is distinct from p_expected_entity_type'
      and body ~ 'p_expected_entity_type is distinct from ''hardware_binding'''
      and body ~ 'p_expected_action is distinct from ''bind'''
      as validates_binding_lifecycle,
    body ~ 'v_item\.execution_status is distinct from ''running'''
      as requires_running_item,
    body ~ 'v_assignment\.target_type is distinct from p_target_type'
      and body ~ 'v_assignment\.target_deployment_key is distinct from p_expected_target_deployment_key'
      as validates_assignment_evidence,
    body ~ 'v_workstation\.active is distinct from true'
      and body ~ 'v_sterilizer\.active is distinct from true'
      as validates_activated_targets
  from source
)
select
  'binding_rpc_guards_and_mutation_boundary' as check_name,
  writes_only_workstation_binding_fields
    and writes_only_sterilizer_binding_fields
    and does_not_complete_or_start_items
    and does_not_update_sessions
    and does_not_mutate_assignments
    and does_not_insert_or_delete
    and validates_claimant
    and validates_token
    and validates_lease_compare
    and validates_active_lease
    and validates_binding_lifecycle
    and requires_running_item
    and validates_assignment_evidence
    and validates_activated_targets as passed,
  to_jsonb(checks) as details
from checks;
