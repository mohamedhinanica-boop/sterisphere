-- RC10.9B - Deployment recovery decision and rollback-plan persistence.
-- Apply manually in the Supabase SQL editor after RC10.9A application support exists.
--
-- This additive schema stores immutable recovery-planning evidence only. It does
-- not execute rollback, compensate entities, remove bindings, reset execution
-- items, recover sessions, mutate deployment runs, or finalize deployments.

create table if not exists public.deployment_recovery_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  deployment_run_key text not null,
  session_id uuid not null,
  execution_key text not null,
  plan_key text not null,
  recovery_key text not null,
  idempotency_key text not null,
  payload_hash text not null,
  recovery_status text not null,
  rollback_required boolean not null,
  rollback_executable boolean not null,
  failure_code text not null,
  failure_layer text not null,
  failed_at timestamptz not null,
  failed_execution_item_key text,
  failed_plan_item_key text,
  failed_sequence integer,
  failed_entity_type text,
  failed_entity_id text,
  failed_action text,
  retryable boolean not null,
  sanitized_failure jsonb not null,
  unsupported_compensations jsonb not null,
  running_items_to_recover jsonb not null,
  completed_mutation_count integer not null,
  reversible_mutation_count integer not null,
  downstream jsonb not null,
  evidence jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint deployment_recovery_plans_clinic_fk
    foreign key (clinic_id) references public.clinics(id) on delete restrict,
  constraint deployment_recovery_plans_session_fk
    foreign key (session_id) references public.deployment_activation_execution_sessions(id) on delete restrict,
  constraint deployment_recovery_plans_identity_check
    check (
      length(btrim(deployment_run_key)) > 0
      and length(btrim(execution_key)) > 0
      and length(btrim(plan_key)) > 0
      and length(btrim(recovery_key)) > 0
      and length(btrim(idempotency_key)) > 0
      and length(btrim(payload_hash)) > 0
      and length(btrim(failure_code)) > 0
      and length(btrim(failure_layer)) > 0
    ),
  constraint deployment_recovery_plans_status_check
    check (recovery_status in ('rollback_required', 'rollback_not_required', 'blocked', 'not_found')),
  constraint deployment_recovery_plans_decision_shape_check
    check (
      rollback_required = (recovery_status = 'rollback_required')
      and (not rollback_executable or rollback_required)
      and (recovery_status not in ('blocked', 'not_found', 'rollback_not_required') or not rollback_executable)
    ),
  constraint deployment_recovery_plans_counter_check
    check (
      completed_mutation_count >= 0
      and reversible_mutation_count >= 0
      and reversible_mutation_count <= completed_mutation_count
      and (failed_sequence is null or failed_sequence > 0)
    ),
  constraint deployment_recovery_plans_json_shape_check
    check (
      jsonb_typeof(sanitized_failure) = 'object'
      and jsonb_typeof(unsupported_compensations) = 'array'
      and jsonb_typeof(running_items_to_recover) = 'array'
      and jsonb_typeof(downstream) = 'object'
      and jsonb_typeof(evidence) = 'object'
    )
);

comment on table public.deployment_recovery_plans is
  'Immutable server-only recovery decision evidence. Rows authorize no rollback, compensation, session recovery, or finalization.';
comment on column public.deployment_recovery_plans.recovery_key is
  'Stable application-derived recovery request identity. It is never a random business identifier.';
comment on column public.deployment_recovery_plans.payload_hash is
  'Application-derived hash of normalized safe recovery decision and rollback-plan evidence; volatile timestamps and database ids are excluded.';

create unique index if not exists deployment_recovery_plans_recovery_key_uidx
  on public.deployment_recovery_plans (recovery_key);

create unique index if not exists deployment_recovery_plans_scope_idempotency_uidx
  on public.deployment_recovery_plans (clinic_id, deployment_run_key, idempotency_key);

create unique index if not exists deployment_recovery_plans_scope_payload_uidx
  on public.deployment_recovery_plans (clinic_id, deployment_run_key, execution_key, payload_hash);

create index if not exists deployment_recovery_plans_session_created_idx
  on public.deployment_recovery_plans (session_id, created_at);

create index if not exists deployment_recovery_plans_status_created_idx
  on public.deployment_recovery_plans (clinic_id, recovery_status, created_at);

create table if not exists public.deployment_recovery_plan_items (
  id uuid primary key default gen_random_uuid(),
  recovery_plan_id uuid not null,
  clinic_id uuid not null,
  deployment_run_key text not null,
  session_id uuid not null,
  execution_key text not null,
  plan_key text not null,
  rollback_item_key text not null,
  source_execution_item_key text not null,
  source_plan_item_key text not null,
  source_sequence integer not null,
  rollback_sequence integer not null,
  entity_type text not null,
  entity_id text,
  original_action text not null,
  compensation_action text,
  compensation_reason text not null,
  expected_current_state jsonb not null,
  expected_prior_state jsonb not null,
  reversible boolean not null,
  blocked_reason text,
  status text not null,
  evidence jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint deployment_recovery_plan_items_plan_fk
    foreign key (recovery_plan_id) references public.deployment_recovery_plans(id) on delete restrict,
  constraint deployment_recovery_plan_items_clinic_fk
    foreign key (clinic_id) references public.clinics(id) on delete restrict,
  constraint deployment_recovery_plan_items_session_fk
    foreign key (session_id) references public.deployment_activation_execution_sessions(id) on delete restrict,
  constraint deployment_recovery_plan_items_identity_check
    check (
      length(btrim(deployment_run_key)) > 0
      and length(btrim(execution_key)) > 0
      and length(btrim(plan_key)) > 0
      and length(btrim(rollback_item_key)) > 0
      and length(btrim(source_execution_item_key)) > 0
      and length(btrim(source_plan_item_key)) > 0
      and length(btrim(entity_type)) > 0
      and length(btrim(original_action)) > 0
      and length(btrim(compensation_reason)) > 0
      and source_sequence > 0
      and rollback_sequence > 0
    ),
  constraint deployment_recovery_plan_items_status_check
    check (status in ('planned', 'blocked')),
  constraint deployment_recovery_plan_items_json_shape_check
    check (
      jsonb_typeof(expected_current_state) = 'object'
      and jsonb_typeof(expected_prior_state) = 'object'
      and jsonb_typeof(evidence) = 'object'
    ),
  constraint deployment_recovery_plan_items_planning_shape_check
    check (
      (
        status = 'planned'
        and reversible
        and compensation_action is not null
        and length(btrim(compensation_action)) > 0
        and blocked_reason is null
      )
      or (
        status = 'blocked'
        and (
          not reversible
          or compensation_action is null
          or blocked_reason is not null
        )
      )
    )
);

comment on table public.deployment_recovery_plan_items is
  'Immutable deterministic rollback-plan instructions only. Rows are not an execution queue and cannot compensate entities by themselves.';
comment on column public.deployment_recovery_plan_items.rollback_sequence is
  'Authoritative future rollback order copied from RC10.9A; source sequences strictly descend as rollback_sequence ascends.';

create unique index if not exists deployment_recovery_plan_items_plan_item_key_uidx
  on public.deployment_recovery_plan_items (recovery_plan_id, rollback_item_key);

create unique index if not exists deployment_recovery_plan_items_plan_rollback_sequence_uidx
  on public.deployment_recovery_plan_items (recovery_plan_id, rollback_sequence);

create unique index if not exists deployment_recovery_plan_items_plan_source_item_uidx
  on public.deployment_recovery_plan_items (recovery_plan_id, source_execution_item_key);

create unique index if not exists deployment_recovery_plan_items_plan_source_sequence_uidx
  on public.deployment_recovery_plan_items (recovery_plan_id, source_sequence);

create index if not exists deployment_recovery_plan_items_scope_order_idx
  on public.deployment_recovery_plan_items (clinic_id, deployment_run_key, execution_key, rollback_sequence);

create or replace function public.set_deployment_recovery_plan_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

drop trigger if exists set_deployment_recovery_plans_updated_at on public.deployment_recovery_plans;
create trigger set_deployment_recovery_plans_updated_at
before update on public.deployment_recovery_plans
for each row execute function public.set_deployment_recovery_plan_updated_at();

drop trigger if exists set_deployment_recovery_plan_items_updated_at on public.deployment_recovery_plan_items;
create trigger set_deployment_recovery_plan_items_updated_at
before update on public.deployment_recovery_plan_items
for each row execute function public.set_deployment_recovery_plan_updated_at();

alter table public.deployment_recovery_plans enable row level security;
alter table public.deployment_recovery_plan_items enable row level security;

revoke all on table public.deployment_recovery_plans from public, anon, authenticated;
revoke all on table public.deployment_recovery_plan_items from public, anon, authenticated;
grant select on table public.deployment_recovery_plans to service_role;
grant select on table public.deployment_recovery_plan_items to service_role;

create or replace function public.persist_deployment_recovery_plan(
  p_clinic_id uuid,
  p_deployment_run_key text,
  p_session_id uuid,
  p_execution_key text,
  p_plan_key text,
  p_recovery_key text,
  p_idempotency_key text,
  p_payload_hash text,
  p_recovery_status text,
  p_rollback_required boolean,
  p_rollback_executable boolean,
  p_sanitized_failure jsonb,
  p_unsupported_compensations jsonb,
  p_running_items_to_recover jsonb,
  p_completed_mutation_count integer,
  p_reversible_mutation_count integer,
  p_downstream jsonb,
  p_evidence jsonb,
  p_rollback_items jsonb
)
returns table (
  persistence_status text,
  recovery_plan_id uuid,
  recovery_key text,
  recovery_status text,
  rollback_required boolean,
  rollback_executable boolean,
  rollback_items_persisted integer,
  rollback_items_reused integer,
  issue_code text,
  message text,
  persisted_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_existing public.deployment_recovery_plans%rowtype;
  v_plan_id uuid;
  v_failure_code text;
  v_failure_layer text;
  v_failed_at timestamptz;
  v_failed_execution_item_key text;
  v_failed_plan_item_key text;
  v_failed_sequence integer;
  v_failed_entity_type text;
  v_failed_entity_id text;
  v_failed_action text;
  v_retryable boolean;
  v_item_count integer;
  v_reversible_count integer;
  v_blocked_count integer;
  v_created_at timestamptz;
  v_item jsonb;
begin
  persistence_status := 'blocked';
  recovery_plan_id := null;
  recovery_key := p_recovery_key;
  recovery_status := p_recovery_status;
  rollback_required := coalesce(p_rollback_required, false);
  rollback_executable := coalesce(p_rollback_executable, false);
  rollback_items_persisted := 0;
  rollback_items_reused := 0;
  issue_code := null;
  persisted_at := null;

  if p_clinic_id is null
     or p_session_id is null
     or p_deployment_run_key is null or length(btrim(p_deployment_run_key)) = 0
     or p_execution_key is null or length(btrim(p_execution_key)) = 0
     or p_plan_key is null or length(btrim(p_plan_key)) = 0
     or p_recovery_key is null or length(btrim(p_recovery_key)) = 0
     or p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0
     or p_payload_hash is null or length(btrim(p_payload_hash)) = 0 then
    issue_code := 'recovery_identity_invalid';
    message := 'Recovery scope, stable request identity, idempotency key, and payload hash are required.';
    return next;
    return;
  end if;

  if p_recovery_status is null
     or p_recovery_status not in ('rollback_required', 'rollback_not_required', 'blocked', 'not_found')
     or p_rollback_required is null
     or p_rollback_executable is null then
    issue_code := 'recovery_decision_invalid';
    message := 'Recovery status and rollback decision flags do not match the RC10.9A contract.';
    return next;
    return;
  end if;

  if p_completed_mutation_count is null or p_completed_mutation_count < 0
     or p_reversible_mutation_count is null or p_reversible_mutation_count < 0
     or p_reversible_mutation_count > p_completed_mutation_count then
    issue_code := 'recovery_counter_invalid';
    message := 'Recovery mutation counters must be non-negative and internally consistent.';
    return next;
    return;
  end if;

  if p_sanitized_failure is null or jsonb_typeof(p_sanitized_failure) <> 'object'
     or not (p_sanitized_failure ?& array[
       'failureCode', 'failureLayer', 'failedAt', 'message',
       'failedExecutionItemKey', 'failedPlanItemKey', 'failedSequence',
       'failedEntityType', 'failedEntityId', 'failedAction', 'retryable', 'diagnostics'
     ])
     or exists (
       select 1 from jsonb_object_keys(p_sanitized_failure) as failure_key(key)
       where key not in (
         'failureCode', 'failureLayer', 'failedAt', 'message',
         'failedExecutionItemKey', 'failedPlanItemKey', 'failedSequence',
         'failedEntityType', 'failedEntityId', 'failedAction', 'retryable', 'diagnostics'
       )
     )
     or jsonb_typeof(p_sanitized_failure->'diagnostics') <> 'object'
     or exists (
       select 1 from jsonb_each(p_sanitized_failure->'diagnostics') as diagnostic(key, value)
       where key not in ('operation', 'status', 'reason', 'attempt', 'sequence', 'entityType', 'action', 'targetType', 'retryAfterSeconds')
          or jsonb_typeof(value) not in ('string', 'number', 'boolean', 'null')
     )
     or jsonb_typeof(p_sanitized_failure->'failureCode') <> 'string'
     or jsonb_typeof(p_sanitized_failure->'failureLayer') <> 'string'
     or jsonb_typeof(p_sanitized_failure->'failedAt') <> 'string'
     or jsonb_typeof(p_sanitized_failure->'message') <> 'string'
     or jsonb_typeof(p_sanitized_failure->'retryable') <> 'boolean'
     or (p_sanitized_failure->>'failedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    issue_code := 'sanitized_failure_invalid';
    message := 'Failure evidence must match the exact sanitized RC10.9A contract.';
    return next;
    return;
  end if;

  if p_unsupported_compensations is null or jsonb_typeof(p_unsupported_compensations) <> 'array'
     or p_running_items_to_recover is null or jsonb_typeof(p_running_items_to_recover) <> 'array'
     or p_downstream is null or jsonb_typeof(p_downstream) <> 'object'
     or p_evidence is null or jsonb_typeof(p_evidence) <> 'object'
     or p_rollback_items is null or jsonb_typeof(p_rollback_items) <> 'array' then
    issue_code := 'recovery_evidence_shape_invalid';
    message := 'Normalized recovery collections and evidence must use the required JSON shapes.';
    return next;
    return;
  end if;

  if p_sanitized_failure->>'message' <> 'Deployment execution failure classified for recovery planning.'
     or (p_sanitized_failure->>'failureCode') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'
     or (p_sanitized_failure->>'failureLayer') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'
     or exists (
       select 1
       from jsonb_each(p_sanitized_failure->'diagnostics') as diagnostic(key, value)
       where jsonb_typeof(value) = 'string'
         and (
          length(value #>> '{}') > 256
          or (value #>> '{}') ~* '(ownership.?token|service.?role|credential|authorization|bearer[[:space:]]|secret|stack trace|sqlstate)'
        )
    ) then
    issue_code := 'unsafe_failure_diagnostics';
    message := 'Failure evidence contains non-canonical or potentially sensitive diagnostics.';
    return next;
    return;
  end if;

  if not (p_evidence ?& array['message', 'failedItem', 'issues', 'stoppedAtStage'])
     or exists (
       select 1 from jsonb_object_keys(p_evidence) as evidence_key(key)
       where key not in ('message', 'failedItem', 'issues', 'stoppedAtStage')
     )
     or jsonb_typeof(p_evidence->'message') <> 'string'
     or jsonb_typeof(p_evidence->'issues') <> 'array'
     or p_evidence->>'stoppedAtStage' not in (
       'failure_validation', 'identity_validation', 'snapshot_validation',
       'plan_construction', 'decision_complete'
     )
     or jsonb_typeof(p_evidence->'failedItem') not in ('object', 'null')
     or exists (
       select 1
       from jsonb_array_elements(p_evidence->'issues') as recovery_issue(value)
       where jsonb_typeof(value) <> 'object'
          or not (value ?& array[
            'code', 'severity', 'message', 'executionItemKey', 'planItemKey',
            'sequence', 'entityType', 'entityId'
          ])
          or exists (
            select 1 from jsonb_object_keys(value) as issue_key(key)
            where key not in (
              'code', 'severity', 'message', 'executionItemKey', 'planItemKey',
              'sequence', 'entityType', 'entityId'
            )
          )
          or value->>'severity' not in ('blocker', 'warning')
     )
     or (
       jsonb_typeof(p_evidence->'failedItem') = 'object'
       and (
         not ((p_evidence->'failedItem') ?& array[
           'executionItemKey', 'planItemKey', 'sequence', 'entityType', 'entityId', 'action'
         ])
         or exists (
           select 1 from jsonb_object_keys(p_evidence->'failedItem') as failed_item_key(key)
           where key not in ('executionItemKey', 'planItemKey', 'sequence', 'entityType', 'entityId', 'action')
         )
       )
     ) then
    issue_code := 'recovery_evidence_contract_invalid';
    message := 'Recovery result evidence must match the exact safe RC10.9A evidence contract.';
    return next;
    return;
  end if;

  if (p_sanitized_failure::text || p_unsupported_compensations::text ||
      p_running_items_to_recover::text || p_downstream::text ||
      p_evidence::text || p_rollback_items::text)
      ~* '"(stack|sql|hint|details|ownershipToken|ownership_token|claimantToken|serviceRoleKey|credentials|headers|rawException|rawPayload)"[[:space:]]*:' then
    issue_code := 'unsafe_recovery_evidence';
    message := 'Recovery persistence rejected unsafe diagnostic or credential fields.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_unsupported_compensations) as unsupported(value)
       where jsonb_typeof(value) <> 'object'
          or not (value ?& array['entityType', 'action', 'support', 'compensationAction', 'reason'])
          or exists (
            select 1 from jsonb_object_keys(value) as unsupported_key(key)
            where key not in ('entityType', 'action', 'support', 'compensationAction', 'reason')
          )
          or jsonb_typeof(value->'entityType') <> 'string'
          or jsonb_typeof(value->'action') <> 'string'
          or jsonb_typeof(value->'support') <> 'string'
          or jsonb_typeof(value->'reason') <> 'string'
          or jsonb_typeof(value->'compensationAction') not in ('string', 'null')
          or value->>'support' not in ('unsupported', 'conditionally_supported', 'supported')
     ) then
    issue_code := 'unsupported_compensation_evidence_invalid';
    message := 'Unsupported-compensation evidence does not match the normalized classification contract.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_running_items_to_recover) as running(value)
       where jsonb_typeof(value) <> 'object'
          or not (value ?& array['executionItemKey', 'planItemKey', 'sequence', 'entityType', 'entityId', 'action', 'recoveryControl'])
          or exists (
            select 1 from jsonb_object_keys(value) as running_key(key)
            where key not in ('executionItemKey', 'planItemKey', 'sequence', 'entityType', 'entityId', 'action', 'recoveryControl')
          )
          or jsonb_typeof(value->'executionItemKey') <> 'string'
          or jsonb_typeof(value->'planItemKey') <> 'string'
          or jsonb_typeof(value->'entityType') <> 'string'
          or jsonb_typeof(value->'entityId') not in ('string', 'null')
          or jsonb_typeof(value->'action') <> 'string'
          or jsonb_typeof(value->'recoveryControl') <> 'string'
          or value->>'recoveryControl' <> 'cancel_or_reset_required'
          or jsonb_typeof(value->'sequence') <> 'number'
          or (value->>'sequence')::integer <= 0
     ) then
    issue_code := 'running_recovery_evidence_invalid';
    message := 'Running execution-control evidence does not match the RC10.9A contract.';
    return next;
    return;
  end if;

  if not (p_downstream ?& array[
       'failuresClassified', 'rollbackItemsPlanned', 'unsupportedCompensations',
       'runningItemsIdentified', 'rollbackExecuted', 'entitiesCompensated',
       'bindingsRemoved', 'sessionsRecovered', 'finalized'
     ])
     or exists (
       select 1 from jsonb_object_keys(p_downstream) as downstream_key(key)
       where key not in (
         'failuresClassified', 'rollbackItemsPlanned', 'unsupportedCompensations',
         'runningItemsIdentified', 'rollbackExecuted', 'entitiesCompensated',
         'bindingsRemoved', 'sessionsRecovered', 'finalized'
       )
     )
     or exists (
       select 1 from jsonb_each(p_downstream) as downstream_value(key, value)
       where jsonb_typeof(value) <> 'number'
     )
     or coalesce((p_downstream->>'failuresClassified')::integer, -1) <> 1
     or coalesce((p_downstream->>'rollbackExecuted')::integer, -1) <> 0
     or coalesce((p_downstream->>'entitiesCompensated')::integer, -1) <> 0
     or coalesce((p_downstream->>'bindingsRemoved')::integer, -1) <> 0
     or coalesce((p_downstream->>'sessionsRecovered')::integer, -1) <> 0
     or coalesce((p_downstream->>'finalized')::integer, -1) <> 0 then
    issue_code := 'planning_downstream_invalid';
    message := 'Recovery persistence accepts planning counters only; every execution counter must remain zero.';
    return next;
    return;
  end if;

  v_item_count := jsonb_array_length(p_rollback_items);
  v_reversible_count := 0;
  v_blocked_count := 0;

  if coalesce((p_downstream->>'rollbackItemsPlanned')::integer, -1) <> v_item_count
     or coalesce((p_downstream->>'unsupportedCompensations')::integer, -1) <> jsonb_array_length(p_unsupported_compensations)
     or coalesce((p_downstream->>'runningItemsIdentified')::integer, -1) <> jsonb_array_length(p_running_items_to_recover) then
    issue_code := 'planning_counter_mismatch';
    message := 'Planning counters must exactly match normalized recovery collections.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_rollback_items) with ordinality as rollback_item(value, ordinal)
       where jsonb_typeof(value) <> 'object'
          or not (value ?& array[
            'rollbackItemKey', 'sourceExecutionItemKey', 'sourcePlanItemKey',
            'sourceSequence', 'rollbackSequence', 'entityType', 'entityId',
            'originalAction', 'compensationAction', 'compensationReason',
            'expectedCurrentState', 'expectedPriorState', 'reversible', 'blockedReason'
          ])
          or exists (
            select 1 from jsonb_object_keys(value) as item_key(key)
            where key not in (
              'rollbackItemKey', 'sourceExecutionItemKey', 'sourcePlanItemKey',
              'sourceSequence', 'rollbackSequence', 'entityType', 'entityId',
              'originalAction', 'compensationAction', 'compensationReason',
              'expectedCurrentState', 'expectedPriorState', 'reversible', 'blockedReason'
            )
          )
          or jsonb_typeof(value->'rollbackItemKey') <> 'string'
          or jsonb_typeof(value->'sourceExecutionItemKey') <> 'string'
          or jsonb_typeof(value->'sourcePlanItemKey') <> 'string'
          or jsonb_typeof(value->'entityType') <> 'string'
          or jsonb_typeof(value->'entityId') not in ('string', 'null')
          or jsonb_typeof(value->'originalAction') <> 'string'
          or jsonb_typeof(value->'compensationAction') not in ('string', 'null')
          or jsonb_typeof(value->'compensationReason') <> 'string'
          or jsonb_typeof(value->'blockedReason') not in ('string', 'null')
          or jsonb_typeof(value->'sourceSequence') <> 'number'
          or jsonb_typeof(value->'rollbackSequence') <> 'number'
          or jsonb_typeof(value->'reversible') <> 'boolean'
          or jsonb_typeof(value->'expectedCurrentState') <> 'object'
          or jsonb_typeof(value->'expectedPriorState') <> 'object'
          or (value->>'sourceSequence')::integer <= 0
          or (value->>'rollbackSequence')::integer <> ordinal::integer
          or coalesce(length(btrim(value->>'rollbackItemKey')), 0) = 0
          or coalesce(length(btrim(value->>'sourceExecutionItemKey')), 0) = 0
          or coalesce(length(btrim(value->>'sourcePlanItemKey')), 0) = 0
          or coalesce(length(btrim(value->>'entityType')), 0) = 0
          or coalesce(length(btrim(value->>'originalAction')), 0) = 0
          or coalesce(length(btrim(value->>'compensationReason')), 0) = 0
     ) then
    issue_code := 'rollback_item_shape_invalid';
    message := 'Rollback items must match the exact normalized RC10.9A item contract and authoritative array order.';
    return next;
    return;
  end if;

  if (select count(distinct value->>'rollbackItemKey') from jsonb_array_elements(p_rollback_items)) <> v_item_count
     or (select count(distinct value->>'sourceExecutionItemKey') from jsonb_array_elements(p_rollback_items)) <> v_item_count
     or (select count(distinct (value->>'sourceSequence')::integer) from jsonb_array_elements(p_rollback_items)) <> v_item_count
     or (select count(distinct (value->>'rollbackSequence')::integer) from jsonb_array_elements(p_rollback_items)) <> v_item_count then
    issue_code := 'rollback_item_identity_duplicate';
    message := 'Rollback item, source item, source sequence, and rollback sequence identities must be unique.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from (
         select
           (value->>'sourceSequence')::integer as source_sequence,
           lag((value->>'sourceSequence')::integer) over (order by (value->>'rollbackSequence')::integer) as previous_source_sequence
         from jsonb_array_elements(p_rollback_items)
       ) ordered
       where previous_source_sequence is not null
         and previous_source_sequence <= source_sequence
     ) then
    issue_code := 'rollback_item_order_invalid';
    message := 'Source sequences must strictly descend as authoritative rollback sequence increases.';
    return next;
    return;
  end if;

  select
    count(*) filter (where (value->>'reversible')::boolean),
    count(*) filter (where not (value->>'reversible')::boolean or value->'blockedReason' <> 'null'::jsonb)
    into v_reversible_count, v_blocked_count
    from jsonb_array_elements(p_rollback_items);

  if p_reversible_mutation_count <> v_reversible_count then
    issue_code := 'reversible_counter_mismatch';
    message := 'The reversible mutation counter must match persisted rollback-item evidence.';
    return next;
    return;
  end if;

  if p_recovery_status = 'rollback_not_required'
     and (p_rollback_required or p_rollback_executable or v_item_count <> 0) then
    issue_code := 'rollback_not_required_inconsistent';
    message := 'rollback_not_required requires false rollback flags and zero rollback items.';
    return next;
    return;
  end if;

  if p_recovery_status = 'rollback_required'
     and not p_rollback_required then
    issue_code := 'rollback_required_flag_missing';
    message := 'rollback_required status requires rollback_required=true.';
    return next;
    return;
  end if;

  if p_recovery_status <> 'rollback_required' and p_rollback_required then
    issue_code := 'rollback_required_flag_invalid';
    message := 'Only rollback_required status may set rollback_required=true.';
    return next;
    return;
  end if;

  if p_rollback_executable
     and (
       not p_rollback_required
       or v_item_count = 0
       or v_reversible_count <> v_item_count
       or v_blocked_count <> 0
       or jsonb_array_length(p_unsupported_compensations) <> 0
     ) then
    issue_code := 'executable_rollback_inconsistent';
    message := 'Executable rollback requires one or more fully reversible items and no blocked or unsupported compensation.';
    return next;
    return;
  end if;

  if p_recovery_status = 'rollback_required'
     and not p_rollback_executable
     and v_item_count > 0
     and v_blocked_count = 0
     and jsonb_array_length(p_unsupported_compensations) = 0 then
    issue_code := 'non_executable_rollback_unexplained';
    message := 'A non-executable rollback plan requires structured blocked or unsupported compensation evidence.';
    return next;
    return;
  end if;

  if p_recovery_status in ('blocked', 'not_found')
     and (p_rollback_executable or (p_recovery_status = 'not_found' and v_item_count <> 0)) then
    issue_code := 'terminal_recovery_decision_inconsistent';
    message := 'Blocked and not-found decisions cannot be executable; not-found decisions contain no rollback items.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_rollback_items) as hardware(value)
       where value->>'entityType' = 'hardware_binding'
         and (
           value->>'originalAction' <> 'bind'
           or not ((value->'expectedCurrentState') ?& array['hardwareId', 'targetId', 'targetType', 'targetDeploymentKey'])
           or not ((value->'expectedPriorState') ?& array['deploymentHardwareKey', 'hardwareId', 'targetId', 'targetType', 'targetDeploymentKey'])
           or (value->'expectedPriorState'->>'deploymentHardwareKey') !~ '^hardware-[0-9]{3}$'
           or (value->>'reversible')::boolean is not true
           or value->>'compensationAction' <> 'remove_deployment_hardware_binding'
           or value->'blockedReason' <> 'null'::jsonb
           or value->'expectedPriorState'->'targetId' <> 'null'::jsonb
           or jsonb_typeof(value->'expectedCurrentState'->'targetId') <> 'string'
           or (value->'expectedCurrentState'->>'targetId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           or jsonb_typeof(value->'expectedCurrentState'->'hardwareId') <> 'string'
           or (value->'expectedCurrentState'->>'hardwareId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           or value->'expectedCurrentState'->>'hardwareId' is distinct from value->>'entityId'
           or value->'expectedPriorState'->>'hardwareId' is distinct from value->>'entityId'
           or value->'expectedCurrentState'->>'targetType' not in ('workstation', 'sterilizer')
           or value->'expectedCurrentState'->>'targetType' is distinct from value->'expectedPriorState'->>'targetType'
           or value->'expectedCurrentState'->>'targetDeploymentKey' is distinct from value->'expectedPriorState'->>'targetDeploymentKey'
           or (
             value->'expectedCurrentState'->>'targetType' = 'workstation'
             and (value->'expectedCurrentState'->>'targetDeploymentKey') !~ '^workstation-[0-9]{3}$'
           )
           or (
             value->'expectedCurrentState'->>'targetType' = 'sterilizer'
             and (value->'expectedCurrentState'->>'targetDeploymentKey') !~ '^sterilizer-[0-9]{3}$'
           )
         )
     ) then
    issue_code := 'hardware_binding_rollback_identity_invalid';
    message := 'Executable Hardware Binding compensation requires exact newly-written and previously-unbound identity evidence.';
    return next;
    return;
  end if;

  select session_row.*
    into v_session
    from public.deployment_activation_execution_sessions session_row
    join public.deployment_runs run_row
      on run_row.id = session_row.deployment_run_record_id
     and run_row.deployment_run_id = p_deployment_run_key
     and run_row.clinic_id = p_clinic_id
   where session_row.id = p_session_id
     and session_row.clinic_id = p_clinic_id
     and session_row.deployment_run_key = p_deployment_run_key
     and session_row.execution_key = p_execution_key
     and session_row.plan_key = p_plan_key
   for share of session_row;

  if not found then
    persistence_status := 'not_found';
    issue_code := 'recovery_source_execution_not_found';
    message := 'Exact deployment run and execution-session recovery source evidence was not found.';
    return next;
    return;
  end if;

  select plan_row.*
    into v_existing
    from public.deployment_recovery_plans plan_row
   where plan_row.recovery_key = p_recovery_key
      or (
        plan_row.clinic_id = p_clinic_id
        and plan_row.deployment_run_key = p_deployment_run_key
        and plan_row.idempotency_key = p_idempotency_key
      )
      or (
        plan_row.clinic_id = p_clinic_id
        and plan_row.deployment_run_key = p_deployment_run_key
        and plan_row.execution_key = p_execution_key
        and plan_row.payload_hash = p_payload_hash
      )
   order by plan_row.created_at
   limit 1
   for update;

  if found then
    recovery_plan_id := v_existing.id;
    recovery_key := v_existing.recovery_key;
    recovery_status := v_existing.recovery_status;
    rollback_required := v_existing.rollback_required;
    rollback_executable := v_existing.rollback_executable;
    persisted_at := v_existing.created_at;
    if v_existing.clinic_id = p_clinic_id
       and v_existing.deployment_run_key = p_deployment_run_key
       and v_existing.session_id = p_session_id
       and v_existing.execution_key = p_execution_key
       and v_existing.plan_key = p_plan_key
       and v_existing.recovery_key = p_recovery_key
       and v_existing.idempotency_key = p_idempotency_key
       and v_existing.payload_hash = p_payload_hash then
      persistence_status := 'reused';
      rollback_items_reused := (select count(*) from public.deployment_recovery_plan_items item_row where item_row.recovery_plan_id = v_existing.id);
      message := 'Compatible immutable recovery decision and rollback-plan evidence was reused.';
    else
      persistence_status := 'conflict';
      issue_code := 'recovery_plan_identity_conflict';
      message := 'Stable recovery, idempotency, or payload identity already belongs to incompatible immutable evidence.';
    end if;
    return next;
    return;
  end if;

  v_failure_code := p_sanitized_failure->>'failureCode';
  v_failure_layer := p_sanitized_failure->>'failureLayer';
  v_failed_at := (p_sanitized_failure->>'failedAt')::timestamptz;
  v_failed_execution_item_key := nullif(p_sanitized_failure->>'failedExecutionItemKey', '');
  v_failed_plan_item_key := nullif(p_sanitized_failure->>'failedPlanItemKey', '');
  v_failed_sequence := nullif(p_sanitized_failure->>'failedSequence', '')::integer;
  v_failed_entity_type := nullif(p_sanitized_failure->>'failedEntityType', '');
  v_failed_entity_id := nullif(p_sanitized_failure->>'failedEntityId', '');
  v_failed_action := nullif(p_sanitized_failure->>'failedAction', '');
  v_retryable := (p_sanitized_failure->>'retryable')::boolean;
  v_created_at := clock_timestamp();

  insert into public.deployment_recovery_plans (
    clinic_id, deployment_run_key, session_id, execution_key, plan_key,
    recovery_key, idempotency_key, payload_hash, recovery_status,
    rollback_required, rollback_executable, failure_code, failure_layer,
    failed_at, failed_execution_item_key, failed_plan_item_key, failed_sequence,
    failed_entity_type, failed_entity_id, failed_action, retryable,
    sanitized_failure, unsupported_compensations, running_items_to_recover,
    completed_mutation_count, reversible_mutation_count, downstream, evidence,
    created_at, updated_at
  ) values (
    p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key, p_plan_key,
    p_recovery_key, p_idempotency_key, p_payload_hash, p_recovery_status,
    p_rollback_required, p_rollback_executable, v_failure_code, v_failure_layer,
    v_failed_at, v_failed_execution_item_key, v_failed_plan_item_key, v_failed_sequence,
    v_failed_entity_type, v_failed_entity_id, v_failed_action, v_retryable,
    p_sanitized_failure, p_unsupported_compensations, p_running_items_to_recover,
    p_completed_mutation_count, p_reversible_mutation_count, p_downstream, p_evidence,
    v_created_at, v_created_at
  ) returning id into v_plan_id;

  for v_item in
    select value
    from jsonb_array_elements(p_rollback_items) with ordinality as ordered(value, ordinal)
    order by ordinal
  loop
    insert into public.deployment_recovery_plan_items (
      recovery_plan_id, clinic_id, deployment_run_key, session_id, execution_key,
      plan_key, rollback_item_key, source_execution_item_key, source_plan_item_key,
      source_sequence, rollback_sequence, entity_type, entity_id, original_action,
      compensation_action, compensation_reason, expected_current_state,
      expected_prior_state, reversible, blocked_reason, status, evidence,
      created_at, updated_at
    ) values (
      v_plan_id, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_plan_key, v_item->>'rollbackItemKey', v_item->>'sourceExecutionItemKey',
      v_item->>'sourcePlanItemKey', (v_item->>'sourceSequence')::integer,
      (v_item->>'rollbackSequence')::integer, v_item->>'entityType',
      nullif(v_item->>'entityId', ''), v_item->>'originalAction',
      nullif(v_item->>'compensationAction', ''), v_item->>'compensationReason',
      v_item->'expectedCurrentState', v_item->'expectedPriorState',
      (v_item->>'reversible')::boolean, nullif(v_item->>'blockedReason', ''),
      case
        when (v_item->>'reversible')::boolean
         and v_item->'compensationAction' <> 'null'::jsonb
         and v_item->'blockedReason' = 'null'::jsonb then 'planned'
        else 'blocked'
      end,
      jsonb_build_object(
        'planningOnly', true,
        'newlyWritten', case when v_item->>'entityType' = 'hardware_binding' then true else null end,
        'reused', false
      ),
      v_created_at, v_created_at
    );
    rollback_items_persisted := rollback_items_persisted + 1;
  end loop;

  persistence_status := 'created';
  recovery_plan_id := v_plan_id;
  recovery_key := p_recovery_key;
  recovery_status := p_recovery_status;
  rollback_required := p_rollback_required;
  rollback_executable := p_rollback_executable;
  persisted_at := v_created_at;
  message := 'Immutable recovery decision and deterministic rollback plan were persisted atomically.';
  return next;
  return;
exception
  when unique_violation then
    select plan_row.*
      into v_existing
      from public.deployment_recovery_plans plan_row
     where plan_row.recovery_key = p_recovery_key
        or (
          plan_row.clinic_id = p_clinic_id
          and plan_row.deployment_run_key = p_deployment_run_key
          and plan_row.idempotency_key = p_idempotency_key
        )
        or (
          plan_row.clinic_id = p_clinic_id
          and plan_row.deployment_run_key = p_deployment_run_key
          and plan_row.execution_key = p_execution_key
          and plan_row.payload_hash = p_payload_hash
        )
     order by plan_row.created_at
     limit 1;

    recovery_plan_id := v_existing.id;
    recovery_key := coalesce(v_existing.recovery_key, p_recovery_key);
    recovery_status := coalesce(v_existing.recovery_status, p_recovery_status);
    rollback_required := coalesce(v_existing.rollback_required, p_rollback_required, false);
    rollback_executable := coalesce(v_existing.rollback_executable, p_rollback_executable, false);
    rollback_items_persisted := 0;
    persisted_at := v_existing.created_at;
    if found
       and v_existing.clinic_id = p_clinic_id
       and v_existing.deployment_run_key = p_deployment_run_key
       and v_existing.session_id = p_session_id
       and v_existing.execution_key = p_execution_key
       and v_existing.plan_key = p_plan_key
       and v_existing.recovery_key = p_recovery_key
       and v_existing.idempotency_key = p_idempotency_key
       and v_existing.payload_hash = p_payload_hash then
      persistence_status := 'reused';
      rollback_items_reused := (select count(*) from public.deployment_recovery_plan_items item_row where item_row.recovery_plan_id = v_existing.id);
      issue_code := null;
      message := 'Compatible immutable recovery evidence was reused after a concurrent persistence attempt.';
    else
      persistence_status := 'conflict';
      rollback_items_reused := 0;
      issue_code := 'recovery_plan_identity_conflict';
      message := 'Concurrent persistence found incompatible immutable recovery evidence.';
    end if;
    return next;
    return;
  when others then
    persistence_status := 'error';
    recovery_plan_id := null;
    rollback_items_persisted := 0;
    rollback_items_reused := 0;
    issue_code := 'recovery_plan_persistence_error';
    message := 'Recovery-plan persistence failed atomically; no partial recovery plan was retained.';
    persisted_at := null;
    return next;
    return;
end;
$$;

revoke all on function public.persist_deployment_recovery_plan(
  uuid, text, uuid, text, text, text, text, text, text, boolean, boolean,
  jsonb, jsonb, jsonb, integer, integer, jsonb, jsonb, jsonb
) from public;

revoke all on function public.persist_deployment_recovery_plan(
  uuid, text, uuid, text, text, text, text, text, text, boolean, boolean,
  jsonb, jsonb, jsonb, integer, integer, jsonb, jsonb, jsonb
) from anon;

revoke all on function public.persist_deployment_recovery_plan(
  uuid, text, uuid, text, text, text, text, text, text, boolean, boolean,
  jsonb, jsonb, jsonb, integer, integer, jsonb, jsonb, jsonb
) from authenticated;

grant execute on function public.persist_deployment_recovery_plan(
  uuid, text, uuid, text, text, text, text, text, text, boolean, boolean,
  jsonb, jsonb, jsonb, integer, integer, jsonb, jsonb, jsonb
) to service_role;
