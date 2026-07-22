# Production schema capture

## Status and purpose

This document defines a read-only evidence-capture process. **No Production capture was performed in Phase 10.2.** The process exists because the repository's 60 standalone SQL assets are not yet sufficient to reconstruct the current Production schema safely. Production is the authoritative runtime state during reconciliation; a captured schema is evidence, not permission to overwrite repository SQL or apply changes to Staging.

A schema capture is not a backup. It excludes table rows, authentication identities, tenant records, traceability records, audit history, hardware identities, storage objects, and all other application data. It cannot be used for point-in-time recovery.

## Selected method

The local wrapper `scripts/capture-production-schema.ps1` uses PostgreSQL `pg_dump` in plain, schema-only mode. This was selected for Phase 10.2 because:

- PostgreSQL tooling supports a direct, non-persistent connection and explicit schema filters;
- the repository has no `supabase/config.toml`, Supabase directory, or persistent project link;
- Supabase CLI was not installed on PATH during the Phase 10.2 audit;
- credentials stay out of command arguments by using a process-scoped `PGPASSWORD` value;
- `--no-owner` reduces environment-specific owner output while grants and revokes remain present.

Supabase documents `supabase db dump` as its CLI schema export boundary and PostgreSQL documents `pg_dump --schema-only` as definition-only output. Before any future switch to Supabase CLI, pin and review the CLI version and obtain explicit approval for any command that persists project linkage. Do not run `supabase link` as part of this workflow.

The wrapper creates two structure-only files:

1. `production-public-schema.sql` for `public` and `extensions`;
2. `production-auth-storage-schema.sql` for structural objects in `auth` and `storage`.

The second file is not an auth or storage data export. It exists to reveal custom structural differences, policies, functions, and grants that a public-only dump could miss. Both files receive the same no-data validation.

## Prerequisites

Required locally:

- Node.js compatible with the repository;
- PowerShell;
- `pg_dump` on PATH, with a client version compatible with the Production PostgreSQL server;
- the Production Supabase project reference;
- a database password authorized only for this read-only capture operation;
- network access approved for the capture window;
- a clean repository and a reviewed operator ticket identifying Production.

The wrapper derives `db.<project-ref>.supabase.co` by default. If Production requires a Supabase pooler or a different approved database hostname, provide `STERISPHERE_PRODUCTION_DB_HOST`, plus its approved port/user values. The project reference remains mandatory so the operator must identify the intended project independently.

## Mandatory safety gates

All gates are evaluated before looking up or launching `pg_dump`:

| Gate | Required value | Failure behavior |
|---|---|---|
| Environment identity | `STERISPHERE_SCHEMA_CAPTURE_ENVIRONMENT=production` | Stops before connection. |
| Explicit opt-in | `STERISPHERE_ALLOW_PRODUCTION_SCHEMA_CAPTURE=true` | Stops before connection. |
| Project identity | valid `STERISPHERE_PRODUCTION_PROJECT_REF` | Stops before connection. |
| Credential presence | non-empty `STERISPHERE_PRODUCTION_DB_PASSWORD` | Stops before connection. |
| Capture mode | `schema-only` | Any data mode stops before connection. |
| Output path | descendant of `.tmp/schema-captures/` | Unsafe or traversing paths stop. |
| Existing output | no target file may already exist | Refuses overwrite. |

The wrapper accepts no data-only mode, restore mode, push mode, reset mode, migration-repair mode, or arbitrary SQL. Its only database executable is `pg_dump` with `--schema-only`. It never invokes `psql`, Supabase mutations, application repositories, or runtime code.

## Secret handling

Do not put a password, access token, service-role key, connection URL, JWT secret, or API key in source, documentation, command arguments, tickets, or logs. The wrapper needs a database password only through `STERISPHERE_PRODUCTION_DB_PASSWORD`; it copies that value into `PGPASSWORD` immediately around `pg_dump` and restores the prior environment value in `finally`.

The wrapper may report the project reference, redacted hostname, output path, schema categories, and `schema-only` mode. It never prints the database password or a credential-bearing connection URL.

An operator can populate the password without typing it as a plaintext command:

```powershell
$databaseCredential = Get-Credential -UserName postgres -Message "Production schema capture database credential"
$env:STERISPHERE_PRODUCTION_DB_PASSWORD = $databaseCredential.GetNetworkCredential().Password
```

Clear transient values in the same terminal after the command:

```powershell
Remove-Item Env:STERISPHERE_PRODUCTION_DB_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
```

Never copy values from `.env.local` into documentation or capture output.

## Explicit execution procedure

This is the reviewed command sequence for a future authorized capture. It is documentation, not authorization to run it.

```powershell
$env:STERISPHERE_SCHEMA_CAPTURE_ENVIRONMENT = "production"
$env:STERISPHERE_ALLOW_PRODUCTION_SCHEMA_CAPTURE = "true"
$env:STERISPHERE_PRODUCTION_PROJECT_REF = "<approved-production-project-ref>"
$env:STERISPHERE_SCHEMA_CAPTURE_MODE = "schema-only"
$databaseCredential = Get-Credential -UserName postgres -Message "Production schema capture database credential"
$env:STERISPHERE_PRODUCTION_DB_PASSWORD = $databaseCredential.GetNetworkCredential().Password

.\scripts\capture-production-schema.ps1
```

Optional connection metadata, when approved, is supplied using `STERISPHERE_PRODUCTION_DB_HOST`, `STERISPHERE_PRODUCTION_DB_PORT`, `STERISPHERE_PRODUCTION_DB_NAME`, and `STERISPHERE_PRODUCTION_DB_USER`. None replaces the project-reference gate.

Expected local output:

```text
.tmp/schema-captures/<UTC capture id>/
  production-public-schema.sql
  production-auth-storage-schema.sql
  production-schema-manifest.json
```

The whole directory is gitignored. The script creates the manifest only after both raw files pass validation. It never overwrites an existing output.

## Capture validator

`validate-production-schema-capture.cjs` rejects a capture when it finds:

- a top-level `INSERT INTO` statement;
- `COPY ... FROM stdin` data;
- auth user data statements;
- data statements targeting sensitive application tables;
- a credential-bearing PostgreSQL URL;
- a password literal;
- a JWT-shaped token;
- a Supabase secret/publishable key literal.

Findings contain only a category, local filename, and line number. They do not echo the matching text. Dollar-quoted function bodies are masked only for top-level data-statement analysis, so legitimate function DDL containing runtime DML is not mistaken for exported table rows. Secret patterns are still checked across the original content.

The validator permits structural SQL including tables, alterations, functions, policies, indexes, triggers, views, extensions, comments, grants, and revokes. Passing automated validation does not replace manual review.

To revalidate an existing local capture without connecting:

```powershell
node .\scripts\validate-production-schema-capture.cjs validate `
  --input .\.tmp\schema-captures\<capture-id>\production-public-schema.sql `
  --input .\.tmp\schema-captures\<capture-id>\production-auth-storage-schema.sql `
  --manifest .\.tmp\schema-captures\<capture-id>\reviewed-manifest.json
```

The manifest path must not already exist; this protects evidence from accidental overwrite.

## Manifest contract

The deterministic JSON manifest contains object names and counts only:

- schemas;
- extensions;
- tables;
- views and materialized views;
- sequences;
- functions and public-schema RPC candidates;
- triggers;
- indexes;
- constraints;
- RLS-enabled tables;
- policies;
- grant and revoke targets.

Arrays and source filenames are sorted. The manifest has no generated timestamp, environment URL, owner identity, credentials, column values, or row data, so repeated generation from identical input is byte-stable. Capture time and operator identity belong in an external release record, not the deterministic manifest.

## Manual review and stop conditions

Before any raw or normalized artifact is proposed for a later commit, inspect it for:

- unexpected `COPY`, `INSERT`, or data values;
- auth users, tenant records, patient/provider/traceability/audit content;
- passwords, API keys, JWTs, service-role tokens, or credential URLs;
- sensitive comments, owner names, internal hostnames, or environment-specific identifiers;
- unexpected schemas, extensions, functions, policies, roles, or storage objects;
- evidence that schema filtering was incomplete.

Stop immediately if identity is ambiguous, any gate fails, `pg_dump` requests data, any output leaves the safe directory, permissions are insufficient, validation reports a finding, or capture content cannot be classified confidently. Do not weaken validation or manually delete a finding and call the same capture valid. Record the failure and repeat only after review.

## Boundaries

This process does not initialize migrations, link Supabase, change migration history, restore a database, push schema, execute SQL, modify Production or Staging, or change application runtime. A reviewed normalized baseline may be proposed only in a separate milestone after the reconciliation workflow in `production-schema-reconciliation.md` is complete.

## Official tooling references

- [Supabase CLI `db dump` reference](https://supabase.com/docs/reference/cli/supabase-db-dump)
- [PostgreSQL `pg_dump` reference](https://www.postgresql.org/docs/current/app-pgdump.html)
