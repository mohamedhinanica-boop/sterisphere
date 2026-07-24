/*
 * SteriSphere Authoritative Baseline
 * Architecture Freeze Version: 1.0.0
 * Architecture Freeze Manifest SHA-256:
 * 0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619
 * Architecture Input Commit: 2373ad80d6a86510acde0010ea1bfb1f82d0fe02
 * Freeze Artifact Commit: 12b6b7e2729d95f47c77cb04e1db87130a05adc9
 * Owner Resolution SHA-256: D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B
 * Production Capture Reference: .tmp/schema-captures/20260723T031930Z/
 * File Role: Read-only platform and environment prerequisite assertions
 *
 * THIS FILE IS GENERATED FROM THE LOCKED ARCHITECTURE FREEZE.
 * DO NOT EDIT MANUALLY.
 * REGENERATE THROUGH THE APPROVED BASELINE PROCESS.
 *
 * GENERATED ARTIFACT FOR REVIEW ONLY. EXECUTION IS NOT AUTHORIZED.
 */

DO $baseline_prerequisites$
DECLARE
  v_server_version integer := current_setting('server_version_num')::integer;
BEGIN
  IF v_server_version < 150000 THEN
    RAISE EXCEPTION 'SteriSphere baseline requires PostgreSQL 15 or newer; server_version_num=%', v_server_version;
  END IF;

  IF to_regnamespace('public') IS NULL THEN
    RAISE EXCEPTION 'Required public schema is missing';
  END IF;
  IF to_regnamespace('auth') IS NULL THEN
    RAISE EXCEPTION 'Required Supabase-managed auth schema is missing';
  END IF;
  IF to_regnamespace('storage') IS NULL THEN
    RAISE EXCEPTION 'Required Supabase-managed storage schema is missing';
  END IF;
  IF to_regnamespace('extensions') IS NULL THEN
    RAISE EXCEPTION 'Required Supabase-managed extensions schema is missing';
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Required Supabase-managed auth.users table is missing';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Required Supabase auth.uid() function is missing';
  END IF;
  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'Required UUID generation function gen_random_uuid() is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'Required Supabase role anon is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Required Supabase role authenticated is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'Required Supabase role service_role is missing';
  END IF;
END
$baseline_prerequisites$;
