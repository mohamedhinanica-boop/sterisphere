-- RC6 Slice 2B - Assignment target validation preflight
-- Read-only verification for validating planned hardware assignment targets
-- against workstation and sterilizer planned shells.
--
-- This script does not migrate schema, insert rows, update rows, activate
-- records, attach legacy rows, resolve operational ids, or persist validation
-- results.

select
  to_regclass('public.clinical_workstations') as clinical_workstations_table,
  to_regclass('public.sterilizers') as sterilizers_table,
  to_regclass('public.deployment_hardware_assignments') as deployment_hardware_assignments_table;

select
  'clinical_workstations' as table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clinical_workstations'
  and column_name in (
    'id',
    'clinic_id',
    'deployment_workstation_key',
    'status',
    'provisioning_source',
    'provisioning_status',
    'active'
  )
union all
select
  'sterilizers' as table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sterilizers'
  and column_name in (
    'id',
    'clinic_id',
    'deployment_sterilizer_key',
    'provisioning_source',
    'provisioning_status',
    'active'
  )
order by table_name, column_name;

select
  required.table_name,
  required.column_name,
  exists (
    select 1
    from information_schema.columns actual
    where actual.table_schema = 'public'
      and actual.table_name = required.table_name
      and actual.column_name = required.column_name
  ) as exists
from (
  values
    ('clinical_workstations', 'id'),
    ('clinical_workstations', 'clinic_id'),
    ('clinical_workstations', 'deployment_workstation_key'),
    ('clinical_workstations', 'status'),
    ('clinical_workstations', 'provisioning_source'),
    ('clinical_workstations', 'provisioning_status'),
    ('clinical_workstations', 'active'),
    ('sterilizers', 'id'),
    ('sterilizers', 'clinic_id'),
    ('sterilizers', 'deployment_sterilizer_key'),
    ('sterilizers', 'provisioning_source'),
    ('sterilizers', 'provisioning_status'),
    ('sterilizers', 'active')
) as required(table_name, column_name)
order by required.table_name, required.column_name;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('clinical_workstations', 'sterilizers')
  and indexdef ilike '%deployment_%_key%'
order by tablename, indexname;

do $$
declare
  workstation_duplicates integer := 0;
  workstation_keyed_null_clinic integer := 0;
  workstation_active_planned integer := 0;
  workstation_malformed_planned integer := 0;
  sterilizer_duplicates integer := 0;
  sterilizer_keyed_null_clinic integer := 0;
  sterilizer_active_planned integer := 0;
  sterilizer_malformed_planned integer := 0;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_workstations'
      and column_name in (
        'clinic_id',
        'deployment_workstation_key',
        'status',
        'provisioning_source',
        'provisioning_status',
        'active'
      )
    group by table_name
    having count(*) = 6
  )
  then
    execute $workstations$
      select count(*)
      from (
        select clinic_id, deployment_workstation_key
        from public.clinical_workstations
        where clinic_id is not null
          and deployment_workstation_key is not null
        group by clinic_id, deployment_workstation_key
        having count(*) > 1
      ) duplicate_workstations
    $workstations$ into workstation_duplicates;

    execute $workstations$
      select count(*)
      from public.clinical_workstations
      where deployment_workstation_key is not null
        and clinic_id is null
    $workstations$ into workstation_keyed_null_clinic;

    execute $workstations$
      select count(*)
      from public.clinical_workstations
      where deployment_workstation_key is not null
        and provisioning_source = 'setup_draft'
        and provisioning_status = 'planned'
        and status = 'planned'
        and active is distinct from false
    $workstations$ into workstation_active_planned;

    execute $workstations$
      select count(*)
      from public.clinical_workstations
      where deployment_workstation_key is not null
        and provisioning_source = 'setup_draft'
        and provisioning_status = 'planned'
        and deployment_workstation_key !~ '^workstation-[0-9]{3}$'
    $workstations$ into workstation_malformed_planned;

    raise notice 'clinical_workstations duplicate same-clinic deployment keys: %', workstation_duplicates;
    raise notice 'clinical_workstations deployment-keyed rows with null clinic_id: %', workstation_keyed_null_clinic;
    raise notice 'clinical_workstations setup-draft planned rows active/not false: %', workstation_active_planned;
    raise notice 'clinical_workstations malformed planned deployment keys: %', workstation_malformed_planned;
  else
    raise notice 'Skipping clinical_workstations data checks because one or more required columns are missing.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sterilizers'
      and column_name in (
        'clinic_id',
        'deployment_sterilizer_key',
        'provisioning_source',
        'provisioning_status',
        'active'
      )
    group by table_name
    having count(*) = 5
  )
  then
    execute $sterilizers$
      select count(*)
      from (
        select clinic_id, deployment_sterilizer_key
        from public.sterilizers
        where clinic_id is not null
          and deployment_sterilizer_key is not null
        group by clinic_id, deployment_sterilizer_key
        having count(*) > 1
      ) duplicate_sterilizers
    $sterilizers$ into sterilizer_duplicates;

    execute $sterilizers$
      select count(*)
      from public.sterilizers
      where deployment_sterilizer_key is not null
        and clinic_id is null
    $sterilizers$ into sterilizer_keyed_null_clinic;

    execute $sterilizers$
      select count(*)
      from public.sterilizers
      where deployment_sterilizer_key is not null
        and provisioning_source = 'setup_draft'
        and provisioning_status = 'planned'
        and active is distinct from false
    $sterilizers$ into sterilizer_active_planned;

    execute $sterilizers$
      select count(*)
      from public.sterilizers
      where deployment_sterilizer_key is not null
        and provisioning_source = 'setup_draft'
        and provisioning_status = 'planned'
        and deployment_sterilizer_key !~ '^sterilizer-[0-9]{3}$'
    $sterilizers$ into sterilizer_malformed_planned;

    raise notice 'sterilizers duplicate same-clinic deployment keys: %', sterilizer_duplicates;
    raise notice 'sterilizers deployment-keyed rows with null clinic_id: %', sterilizer_keyed_null_clinic;
    raise notice 'sterilizers setup-draft planned rows active/not false: %', sterilizer_active_planned;
    raise notice 'sterilizers malformed planned deployment keys: %', sterilizer_malformed_planned;
  else
    raise notice 'Skipping sterilizers data checks because one or more required columns are missing.';
  end if;
end $$;

do $$
declare
  assignment_invalid_targets integer := 0;
begin
  if to_regclass('public.deployment_hardware_assignments') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'deployment_hardware_assignments'
         and column_name in (
           'clinic_id',
           'deployment_hardware_key',
           'target_type',
           'target_deployment_key',
           'assignment_status',
           'assignment_source',
           'active'
         )
       group by table_name
       having count(*) = 7
     )
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'clinical_workstations'
         and column_name in (
           'clinic_id',
           'deployment_workstation_key',
           'status',
           'provisioning_source',
           'provisioning_status',
           'active'
         )
       group by table_name
       having count(*) = 6
     )
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'sterilizers'
         and column_name in (
           'clinic_id',
           'deployment_sterilizer_key',
           'provisioning_source',
           'provisioning_status',
           'active'
         )
       group by table_name
       having count(*) = 5
     )
  then
    execute $assignments$
      with planned_assignments as (
        select
          clinic_id,
          deployment_hardware_key,
          target_type,
          target_deployment_key
        from public.deployment_hardware_assignments
        where assignment_source = 'setup_draft'
          and assignment_status = 'planned'
          and active = false
      )
      select count(*)
      from planned_assignments assignment
      where (
        assignment.target_type = 'workstation'
        and not exists (
          select 1
          from public.clinical_workstations workstation
          where workstation.clinic_id = assignment.clinic_id
            and workstation.deployment_workstation_key = assignment.target_deployment_key
            and workstation.status = 'planned'
            and workstation.provisioning_source = 'setup_draft'
            and workstation.provisioning_status = 'planned'
            and workstation.active = false
        )
      )
      or (
        assignment.target_type = 'sterilizer'
        and not exists (
          select 1
          from public.sterilizers sterilizer
          where sterilizer.clinic_id = assignment.clinic_id
            and sterilizer.deployment_sterilizer_key = assignment.target_deployment_key
            and sterilizer.provisioning_source = 'setup_draft'
            and sterilizer.provisioning_status = 'planned'
            and sterilizer.active = false
        )
      )
      or (
        assignment.target_type = 'unassigned'
        and assignment.target_deployment_key is not null
      )
      or assignment.target_type not in ('workstation', 'sterilizer', 'unassigned')
    $assignments$ into assignment_invalid_targets;

    raise notice 'planned hardware assignments incompatible with current validation rules: %', assignment_invalid_targets;
  else
    raise notice 'Skipping assignment compatibility check because deployment_hardware_assignments or required columns are missing.';
  end if;
end $$;
