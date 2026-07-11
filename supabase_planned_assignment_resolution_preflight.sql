-- RC7 Slice 1B - Planned assignment resolution preflight
-- Read-only verification for resolving planned hardware assignment logical keys
-- to durable hardware, workstation, and sterilizer row identities.
--
-- This script does not migrate schema, insert rows, update rows, delete rows,
-- activate records, bind hardware, register agents, or persist resolved ids.

select
  to_regclass('public.deployment_hardware_assignments') as deployment_hardware_assignments_table,
  to_regclass('public.clinical_hardware_devices') as clinical_hardware_devices_table,
  to_regclass('public.clinical_workstations') as clinical_workstations_table,
  to_regclass('public.sterilizers') as sterilizers_table;

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
    ('deployment_hardware_assignments', 'clinic_id'),
    ('deployment_hardware_assignments', 'deployment_hardware_key'),
    ('deployment_hardware_assignments', 'assignment_key'),
    ('deployment_hardware_assignments', 'target_type'),
    ('deployment_hardware_assignments', 'target_deployment_key'),
    ('deployment_hardware_assignments', 'assignment_status'),
    ('deployment_hardware_assignments', 'assignment_source'),
    ('deployment_hardware_assignments', 'active'),
    ('clinical_hardware_devices', 'id'),
    ('clinical_hardware_devices', 'clinic_id'),
    ('clinical_hardware_devices', 'deployment_hardware_key'),
    ('clinical_hardware_devices', 'status'),
    ('clinical_hardware_devices', 'provisioning_source'),
    ('clinical_hardware_devices', 'provisioning_status'),
    ('clinical_hardware_devices', 'active'),
    ('clinical_hardware_devices', 'agent_id'),
    ('clinical_hardware_devices', 'default_workstation_id'),
    ('clinical_hardware_devices', 'current_workstation_id'),
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
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'deployment_hardware_assignments',
    'clinical_hardware_devices',
    'clinical_workstations',
    'sterilizers'
  )
  and (
    indexdef ilike '%deployment_%_key%'
    or indexdef ilike '%assignment_key%'
  )
order by tablename, indexname;

do $$
declare
  assignment_duplicate_hardware_keys integer := 0;
  assignment_duplicate_assignment_keys integer := 0;
  assignment_active_planned integer := 0;
  assignment_malformed_targets integer := 0;
  hardware_duplicate_keys integer := 0;
  hardware_keyed_null_clinic integer := 0;
  hardware_active_planned integer := 0;
  hardware_bound_planned integer := 0;
  hardware_malformed_keys integer := 0;
  workstation_duplicate_keys integer := 0;
  workstation_keyed_null_clinic integer := 0;
  workstation_active_planned integer := 0;
  workstation_malformed_keys integer := 0;
  sterilizer_duplicate_keys integer := 0;
  sterilizer_keyed_null_clinic integer := 0;
  sterilizer_active_planned integer := 0;
  sterilizer_malformed_keys integer := 0;
  unresolved_hardware integer := 0;
  unresolved_workstations integer := 0;
  unresolved_sterilizers integer := 0;
  bound_assignment_hardware integer := 0;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name in (
        'clinic_id',
        'deployment_hardware_key',
        'assignment_key',
        'target_type',
        'target_deployment_key',
        'assignment_status',
        'assignment_source',
        'active'
      )
    group by table_name
    having count(*) = 8
  )
  then
    execute $assignments$
      select count(*)
      from (
        select clinic_id, deployment_hardware_key
        from public.deployment_hardware_assignments
        where clinic_id is not null
          and deployment_hardware_key is not null
        group by clinic_id, deployment_hardware_key
        having count(*) > 1
      ) duplicates
    $assignments$ into assignment_duplicate_hardware_keys;

    execute $assignments$
      select count(*)
      from (
        select clinic_id, assignment_key
        from public.deployment_hardware_assignments
        where clinic_id is not null
          and assignment_key is not null
        group by clinic_id, assignment_key
        having count(*) > 1
      ) duplicates
    $assignments$ into assignment_duplicate_assignment_keys;

    execute $assignments$
      select count(*)
      from public.deployment_hardware_assignments
      where assignment_source = 'setup_draft'
        and assignment_status = 'planned'
        and active is distinct from false
    $assignments$ into assignment_active_planned;

    execute $assignments$
      select count(*)
      from public.deployment_hardware_assignments
      where assignment_source = 'setup_draft'
        and assignment_status = 'planned'
        and (
          deployment_hardware_key !~ '^hardware-[0-9]{3}$'
          or target_type not in ('workstation', 'sterilizer', 'unassigned')
          or (target_type = 'unassigned' and target_deployment_key is not null)
          or (target_type in ('workstation', 'sterilizer') and target_deployment_key is null)
          or (target_type = 'workstation' and target_deployment_key !~ '^workstation-[0-9]{3}$')
          or (target_type = 'sterilizer' and target_deployment_key !~ '^sterilizer-[0-9]{3}$')
        )
    $assignments$ into assignment_malformed_targets;

    raise notice 'deployment_hardware_assignments duplicate (clinic_id, deployment_hardware_key): %', assignment_duplicate_hardware_keys;
    raise notice 'deployment_hardware_assignments duplicate (clinic_id, assignment_key): %', assignment_duplicate_assignment_keys;
    raise notice 'deployment_hardware_assignments setup-draft planned rows active/not false: %', assignment_active_planned;
    raise notice 'deployment_hardware_assignments malformed logical target combinations: %', assignment_malformed_targets;
  else
    raise notice 'Skipping assignment checks because required deployment_hardware_assignments columns are missing.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_hardware_devices'
      and column_name in (
        'id',
        'clinic_id',
        'deployment_hardware_key',
        'status',
        'provisioning_source',
        'provisioning_status',
        'active',
        'agent_id',
        'default_workstation_id',
        'current_workstation_id'
      )
    group by table_name
    having count(*) = 10
  )
  then
    execute $hardware$
      select count(*)
      from (
        select clinic_id, deployment_hardware_key
        from public.clinical_hardware_devices
        where clinic_id is not null
          and deployment_hardware_key is not null
        group by clinic_id, deployment_hardware_key
        having count(*) > 1
      ) duplicates
    $hardware$ into hardware_duplicate_keys;

    execute $hardware$
      select count(*)
      from public.clinical_hardware_devices
      where deployment_hardware_key is not null
        and clinic_id is null
    $hardware$ into hardware_keyed_null_clinic;

    execute $hardware$
      select count(*)
      from public.clinical_hardware_devices
      where deployment_hardware_key is not null
        and provisioning_source = 'setup_draft'
        and provisioning_status = 'planned'
        and active is distinct from false
    $hardware$ into hardware_active_planned;

    execute $hardware$
      select count(*)
      from public.clinical_hardware_devices
      where deployment_hardware_key is not null
        and provisioning_source = 'setup_draft'
        and provisioning_status = 'planned'
        and (
          agent_id is not null
          or default_workstation_id is not null
          or current_workstation_id is not null
        )
    $hardware$ into hardware_bound_planned;

    execute $hardware$
      select count(*)
      from public.clinical_hardware_devices
      where deployment_hardware_key is not null
        and provisioning_source = 'setup_draft'
        and provisioning_status = 'planned'
        and deployment_hardware_key !~ '^hardware-[0-9]{3}$'
    $hardware$ into hardware_malformed_keys;

    raise notice 'clinical_hardware_devices duplicate same-clinic deployment keys: %', hardware_duplicate_keys;
    raise notice 'clinical_hardware_devices deployment-keyed rows with null clinic_id: %', hardware_keyed_null_clinic;
    raise notice 'clinical_hardware_devices setup-draft planned rows active/not false: %', hardware_active_planned;
    raise notice 'clinical_hardware_devices setup-draft planned rows with operational bindings: %', hardware_bound_planned;
    raise notice 'clinical_hardware_devices malformed planned deployment keys: %', hardware_malformed_keys;
  else
    raise notice 'Skipping hardware checks because required clinical_hardware_devices columns are missing.';
  end if;

  if exists (
    select 1
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
    group by table_name
    having count(*) = 7
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
      ) duplicates
    $workstations$ into workstation_duplicate_keys;

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
    $workstations$ into workstation_malformed_keys;

    raise notice 'clinical_workstations duplicate same-clinic deployment keys: %', workstation_duplicate_keys;
    raise notice 'clinical_workstations deployment-keyed rows with null clinic_id: %', workstation_keyed_null_clinic;
    raise notice 'clinical_workstations setup-draft planned rows active/not false: %', workstation_active_planned;
    raise notice 'clinical_workstations malformed planned deployment keys: %', workstation_malformed_keys;
  else
    raise notice 'Skipping workstation checks because required clinical_workstations columns are missing.';
  end if;

  if exists (
    select 1
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
    group by table_name
    having count(*) = 6
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
      ) duplicates
    $sterilizers$ into sterilizer_duplicate_keys;

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
    $sterilizers$ into sterilizer_malformed_keys;

    raise notice 'sterilizers duplicate same-clinic deployment keys: %', sterilizer_duplicate_keys;
    raise notice 'sterilizers deployment-keyed rows with null clinic_id: %', sterilizer_keyed_null_clinic;
    raise notice 'sterilizers setup-draft planned rows active/not false: %', sterilizer_active_planned;
    raise notice 'sterilizers malformed planned deployment keys: %', sterilizer_malformed_keys;
  else
    raise notice 'Skipping sterilizer checks because required sterilizers columns are missing.';
  end if;

  if exists (
    select 1 from information_schema.columns
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
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_hardware_devices'
      and column_name in (
        'clinic_id',
        'deployment_hardware_key',
        'status',
        'provisioning_source',
        'provisioning_status',
        'active',
        'agent_id',
        'default_workstation_id',
        'current_workstation_id'
      )
    group by table_name
    having count(*) = 9
  )
  and exists (
    select 1 from information_schema.columns
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
    select 1 from information_schema.columns
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
    execute $compatibility$
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
      where not exists (
        select 1
        from public.clinical_hardware_devices hardware
        where hardware.clinic_id = assignment.clinic_id
          and hardware.deployment_hardware_key = assignment.deployment_hardware_key
          and hardware.status = 'planned'
          and hardware.provisioning_source = 'setup_draft'
          and hardware.provisioning_status = 'planned'
          and hardware.active = false
          and hardware.agent_id is null
          and hardware.default_workstation_id is null
          and hardware.current_workstation_id is null
      )
    $compatibility$ into unresolved_hardware;

    execute $compatibility$
      with planned_assignments as (
        select
          clinic_id,
          target_type,
          target_deployment_key
        from public.deployment_hardware_assignments
        where assignment_source = 'setup_draft'
          and assignment_status = 'planned'
          and active = false
          and target_type = 'workstation'
      )
      select count(*)
      from planned_assignments assignment
      where not exists (
        select 1
        from public.clinical_workstations workstation
        where workstation.clinic_id = assignment.clinic_id
          and workstation.deployment_workstation_key = assignment.target_deployment_key
          and workstation.status = 'planned'
          and workstation.provisioning_source = 'setup_draft'
          and workstation.provisioning_status = 'planned'
          and workstation.active = false
      )
    $compatibility$ into unresolved_workstations;

    execute $compatibility$
      with planned_assignments as (
        select
          clinic_id,
          target_type,
          target_deployment_key
        from public.deployment_hardware_assignments
        where assignment_source = 'setup_draft'
          and assignment_status = 'planned'
          and active = false
          and target_type = 'sterilizer'
      )
      select count(*)
      from planned_assignments assignment
      where not exists (
        select 1
        from public.sterilizers sterilizer
        where sterilizer.clinic_id = assignment.clinic_id
          and sterilizer.deployment_sterilizer_key = assignment.target_deployment_key
          and sterilizer.provisioning_source = 'setup_draft'
          and sterilizer.provisioning_status = 'planned'
          and sterilizer.active = false
      )
    $compatibility$ into unresolved_sterilizers;

    execute $compatibility$
      select count(*)
      from public.deployment_hardware_assignments assignment
      join public.clinical_hardware_devices hardware
        on hardware.clinic_id = assignment.clinic_id
       and hardware.deployment_hardware_key = assignment.deployment_hardware_key
      where assignment.assignment_source = 'setup_draft'
        and assignment.assignment_status = 'planned'
        and assignment.active = false
        and (
          hardware.agent_id is not null
          or hardware.default_workstation_id is not null
          or hardware.current_workstation_id is not null
        )
    $compatibility$ into bound_assignment_hardware;

    raise notice 'planned assignments without compatible hardware shell: %', unresolved_hardware;
    raise notice 'planned workstation assignments without compatible workstation target: %', unresolved_workstations;
    raise notice 'planned sterilizer assignments without compatible sterilizer target: %', unresolved_sterilizers;
    raise notice 'planned assignment-backed hardware rows with operational bindings: %', bound_assignment_hardware;
  else
    raise notice 'Skipping cross-entity resolution compatibility checks because required tables or columns are missing.';
  end if;
end $$;
