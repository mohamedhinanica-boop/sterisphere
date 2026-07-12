-- RC8 Slice 2B activation execution persistence schema.
-- Creates durable prepared execution session/item tables only.
-- No activation, claiming, item execution, rollback, or deployment finalization is performed by this migration.

create table if not exists public.deployment_activation_execution_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  deployment_run_record_id uuid not null,
  deployment_run_key text not null,
  execution_key text not null,
  plan_key text not null,
  payload_hash text,
  preparation_status text not null,
  execution_status text not null,
  execution_owner text,
  ownership_token text,
  lease_expires_at timestamptz,
  items_requested integer not null,
  items_ready integer not null,
  items_pending integer not null,
  items_blocked integer not null,
  reversible_items integer not null,
  irreversible_items integer not null,
  blockers integer not null,
  warnings integer not null,
  rollback_boundary jsonb not null,
  preparation_evidence jsonb not null,
  execution_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deployment_activation_execution_sessions_clinic_fk
    foreign key (clinic_id) references public.clinics(id) on delete restrict,
  constraint deployment_activation_execution_sessions_run_fk
    foreign key (deployment_run_record_id) references public.deployment_runs(id) on delete restrict,
  constraint deployment_activation_execution_sessions_preparation_status_check
    check (preparation_status in ('ready')),
  constraint deployment_activation_execution_sessions_execution_status_check
    check (execution_status in (
      'prepared',
      'claimed',
      'running',
      'partially_completed',
      'completed',
      'failed',
      'rollback_required',
      'rolling_back',
      'rolled_back',
      'cancelled'
    )),
  constraint deployment_activation_execution_sessions_counter_check
    check (
      items_requested >= 0
      and items_ready >= 0
      and items_pending >= 0
      and items_blocked >= 0
      and reversible_items >= 0
      and irreversible_items >= 0
      and blockers >= 0
      and warnings >= 0
      and items_ready + items_pending + items_blocked = items_requested
      and reversible_items + irreversible_items = items_requested
    ),
  constraint deployment_activation_execution_sessions_json_shape_check
    check (
      jsonb_typeof(rollback_boundary) = 'object'
      and jsonb_typeof(preparation_evidence) = 'object'
      and jsonb_typeof(execution_metadata) = 'object'
    ),
  constraint deployment_activation_execution_sessions_prepared_shape_check
    check (
      execution_status <> 'prepared'
      or (
        preparation_status = 'ready'
        and execution_owner is null
        and ownership_token is null
        and lease_expires_at is null
        and started_at is null
        and completed_at is null
        and failed_at is null
        and blockers = 0
        and items_blocked = 0
      )
    )
);

comment on table public.deployment_activation_execution_sessions is
  'Durable prepared activation execution session evidence. A row records approved pre-execution identity and evidence only; it does not authorize activation, claiming, or operational mutation.';
comment on column public.deployment_activation_execution_sessions.deployment_run_key is
  'Logical deployment run identity from deployment_runs.deployment_run_id and the TypeScript execution-preparation contract.';
comment on column public.deployment_activation_execution_sessions.deployment_run_record_id is
  'Durable deployment_runs.id foreign key resolved by the server-only repository.';
comment on column public.deployment_activation_execution_sessions.rollback_boundary is
  'Descriptive rollback boundary evidence only, not an operational rollback guarantee.';

create unique index if not exists deployment_activation_execution_sessions_clinic_execution_key_uidx
  on public.deployment_activation_execution_sessions (clinic_id, execution_key);

create unique index if not exists deployment_activation_execution_sessions_clinic_run_record_uidx
  on public.deployment_activation_execution_sessions (clinic_id, deployment_run_record_id);

create unique index if not exists deployment_activation_execution_sessions_clinic_run_key_uidx
  on public.deployment_activation_execution_sessions (clinic_id, deployment_run_key);

create index if not exists deployment_activation_execution_sessions_status_idx
  on public.deployment_activation_execution_sessions (clinic_id, execution_status, created_at);

create table if not exists public.deployment_activation_execution_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  clinic_id uuid not null,
  deployment_run_record_id uuid not null,
  deployment_run_key text not null,
  execution_key text not null,
  execution_item_key text not null,
  plan_item_key text not null,
  sequence integer not null,
  dependency_level integer,
  entity_type text not null,
  entity_id text,
  deployment_key text,
  action text not null,
  expected_current_state jsonb not null,
  target_state jsonb not null,
  dependency_keys jsonb not null,
  execution_status text not null,
  attempt_count integer not null default 0,
  reversible boolean not null,
  rollback_action text,
  rollback_status text not null default 'not_started',
  error_code text,
  error_message text,
  execution_evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deployment_activation_execution_items_session_fk
    foreign key (session_id) references public.deployment_activation_execution_sessions(id) on delete restrict,
  constraint deployment_activation_execution_items_clinic_fk
    foreign key (clinic_id) references public.clinics(id) on delete restrict,
  constraint deployment_activation_execution_items_run_fk
    foreign key (deployment_run_record_id) references public.deployment_runs(id) on delete restrict,
  constraint deployment_activation_execution_items_status_check
    check (execution_status in (
      'ready',
      'pending',
      'running',
      'succeeded',
      'failed',
      'skipped',
      'rollback_pending',
      'rolled_back'
    )),
  constraint deployment_activation_execution_items_action_check
    check (action in ('activate', 'link', 'bind', 'finalize', 'no_op')),
  constraint deployment_activation_execution_items_rollback_status_check
    check (rollback_status in ('not_started', 'not_supported', 'pending', 'completed', 'failed')),
  constraint deployment_activation_execution_items_shape_check
    check (
      sequence > 0
      and (dependency_level is null or dependency_level >= 0)
      and attempt_count >= 0
      and jsonb_typeof(expected_current_state) = 'object'
      and jsonb_typeof(target_state) = 'object'
      and jsonb_typeof(dependency_keys) = 'array'
      and jsonb_typeof(execution_evidence) = 'object'
    ),
  constraint deployment_activation_execution_items_prepared_shape_check
    check (
      execution_status not in ('ready', 'pending')
      or (
        attempt_count = 0
        and started_at is null
        and completed_at is null
        and rolled_back_at is null
        and error_code is null
        and error_message is null
      )
    ),
  constraint deployment_activation_execution_items_reversible_rollback_check
    check (
      (reversible and rollback_action is not null and rollback_status <> 'not_supported')
      or (not reversible)
    )
);

comment on table public.deployment_activation_execution_items is
  'Durable approved pre-execution activation instructions for a prepared activation execution session. Rows do not execute themselves and do not authorize activation.';
comment on column public.deployment_activation_execution_items.expected_current_state is
  'Canonical safety-relevant current state approved during execution preparation.';
comment on column public.deployment_activation_execution_items.target_state is
  'Future intended target state evidence only; no mutation occurs when this row is inserted.';
comment on column public.deployment_activation_execution_items.execution_evidence is
  'Prepared dependency evidence; claiming, attempts, and operational results require later controlled execution logic.';

create unique index if not exists deployment_activation_execution_items_session_execution_item_uidx
  on public.deployment_activation_execution_items (session_id, execution_item_key);

create unique index if not exists deployment_activation_execution_items_session_plan_item_uidx
  on public.deployment_activation_execution_items (session_id, plan_item_key);

create unique index if not exists deployment_activation_execution_items_session_sequence_uidx
  on public.deployment_activation_execution_items (session_id, sequence);

create index if not exists deployment_activation_execution_items_status_sequence_idx
  on public.deployment_activation_execution_items (session_id, execution_status, sequence);

create index if not exists deployment_activation_execution_items_clinic_execution_idx
  on public.deployment_activation_execution_items (clinic_id, execution_key);

create index if not exists deployment_activation_execution_items_run_sequence_idx
  on public.deployment_activation_execution_items (deployment_run_record_id, sequence);

create or replace function public.set_deployment_activation_execution_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_deployment_activation_execution_sessions_updated_at on public.deployment_activation_execution_sessions;
create trigger set_deployment_activation_execution_sessions_updated_at
before update on public.deployment_activation_execution_sessions
for each row
execute function public.set_deployment_activation_execution_updated_at();

drop trigger if exists set_deployment_activation_execution_items_updated_at on public.deployment_activation_execution_items;
create trigger set_deployment_activation_execution_items_updated_at
before update on public.deployment_activation_execution_items
for each row
execute function public.set_deployment_activation_execution_updated_at();

alter table public.deployment_activation_execution_sessions enable row level security;
alter table public.deployment_activation_execution_items enable row level security;

comment on table public.deployment_activation_execution_sessions is
  'Server-only deployment control table for durable prepared activation execution session evidence. RLS is enabled deny-by-default; service-role repositories may bypass RLS. A row does not authorize activation, claiming, or operational mutation.';
comment on table public.deployment_activation_execution_items is
  'Server-only deployment control table for durable approved pre-execution activation instructions. RLS is enabled deny-by-default; service-role repositories may bypass RLS. Rows do not execute themselves and do not authorize activation.';
