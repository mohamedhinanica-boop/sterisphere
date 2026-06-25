alter table if exists clinic_settings
  add column if not exists printer_model text default 'brother_ql_820nwb',
  add column if not exists printer_connection_type text default 'wifi',
  add column if not exists printer_ip text,
  add column if not exists printer_port integer default 9100,
  add column if not exists printer_label_width_mm integer default 50,
  add column if not exists printer_label_height_mm integer default 30;

do $$
begin
  if to_regclass('clinic_settings') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'clinic_settings_printer_model_check'
    )
  then
    alter table clinic_settings
      add constraint clinic_settings_printer_model_check
      check (
        printer_model in (
          'brother_ql_820nwb',
          'brother_td_4550dnwb',
          'zywell_zy_series',
          'custom'
        )
      ) not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('clinic_settings') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'clinic_settings_printer_connection_type_check'
    )
  then
    alter table clinic_settings
      add constraint clinic_settings_printer_connection_type_check
      check (printer_connection_type in ('wifi', 'ethernet', 'usb')) not valid;
  end if;
end $$;
