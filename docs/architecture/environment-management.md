# Environment and Release Management

## Purpose and current state

SteriSphere has two permanent Supabase environments: **Staging** and **Production**. They must be treated as independent data planes governed by one reviewed schema and release history. A future **Preview** environment class may provide disposable per-branch databases and Vercel deployments.

This document defines governance only. It does not change application runtime, Setup Complete, authentication, SQL, RPC behavior, or rollback execution.

Repository audit findings as of Phase 10.0:

- SQL is stored as 60 standalone assets: 29 at repository root and 31 in `docs/architecture`.
- 28 assets are read-only preflights; 32 are schema, security, or RPC source assets.
- no ordered Supabase migration directory or `supabase/config.toml` is committed;
- no `vercel.json` is committed; framework behavior comes from `next.config.ts` and Vercel project settings;
- no storage bucket or `storage.objects` policy definition exists in repository SQL;
- no database seed asset is identified;
- environment values are locally or platform managed and must never be committed.

## Environment model

| Environment | Purpose | Data policy | Change policy |
|---|---|---|---|
| Production | Live clinics and operational workloads | Real users, clinics, hardware, audit history, and deployment evidence only | Receives only reviewed releases already validated in Staging. No fixtures or experimental SQL. |
| Staging | Permanent production-like validation and release candidate qualification | Synthetic/test-owned clinics and hardware; no copied production secrets or regulated records | First permanent target for reviewed SQL and application releases. RC10.9 recovery integration belongs here when its explicit safety gate is enabled. |
| Preview (future) | Disposable branch-level development and integration | Generated fixtures only; disposable by design | Created from the current migration baseline and destroyed after branch validation. Never promoted as data. |

Staging is not a backup of Production. Preview is not Staging. Production data must never be cloned into either without a separately approved, sanitized-data process.

## Environment ownership

### Must remain identical

The following are release-owned and must converge across Staging and Production:

- PostgreSQL schemas, tables, columns, types, constraints, foreign keys, defaults, and triggers;
- RLS enablement, policies, grants, revokes, `SECURITY DEFINER` settings, and fixed `search_path` contracts;
- RPC/function signatures and implementations;
- indexes and required extensions;
- storage bucket definitions and storage policies once repository-managed storage is introduced;
- migration history and schema version;
- application release artifact, except for environment-specific configuration;
- server/client boundary rules and validation contracts.

“Identical” means defined by the same immutable migration or release artifact. It does not mean applying ad hoc equivalent SQL independently.

### Must intentionally differ

The following are environment-owned and must not be synchronized as ordinary releases:

- users, authentication identities, sessions, and credentials;
- clinics, providers, sterilizers, workstations, hardware, assignments, and operational state;
- deployment runs, execution sessions/items, recovery plans, audit history, and logs;
- staging and preview fixtures;
- Supabase project URLs, anon keys, service-role keys, webhook secrets, and agent secrets;
- Vercel project/environment identifiers and generated Git metadata;
- quotas, alert destinations, retention settings, and external integration endpoints where environment isolation requires differences.

## Configuration and secret ownership

Values must be configured independently in Vercel/Supabase environment settings or a developer’s ignored `.env.local`. Variable names may be shared; values must not be copied automatically between environments.

### Application and Supabase variables

| Variable | Visibility | Environment ownership |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible | Required per environment; points only to that environment’s project. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-visible | Required per environment; anon key for the matching project. |
| `SUPABASE_URL` | Server-only | Required per environment for trusted repositories; should match the environment’s public URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret, server-only | Required per environment; never exposed to clients, logs, docs, or source. |
| `CLINIC_AGENT_HEARTBEAT_SECRET` | Secret, server-only | Independent per environment. |
| `NODE_ENV` | Process classification | Platform/tool managed; production always activates production safety blocks. |

### Recovery integration controls

| Variable | Allowed placement | Rule |
|---|---|---|
| `STERISPHERE_ALLOW_RECOVERY_INTEGRATION_FIXTURE` | Explicit operator shell or isolated Staging job | Must equal `true`; never set persistently in Production. |
| `STERISPHERE_RECOVERY_INTEGRATION_ENVIRONMENT` | Isolated job | One of `local`, `development`, `test`, `staging`, or `supabase_branch`. |
| `STERISPHERE_PRODUCTION_SUPABASE_URL` | Isolated job, non-secret | Comparison guard; current integration URL must differ. |
| `VERCEL_ENV` | Vercel managed | `production` blocks the fixture. |

### Local print-agent variables

| Variable | Ownership |
|---|---|
| `AGENT_HOST`, `AGENT_PORT` | Local agent host configuration. |
| `STERISPHERE_CLOUD_URL` | Environment-specific application endpoint. |
| `STERISPHERE_AGENT_KEY` | Per-agent secret/identity; never shared between environments. |
| `STERISPHERE_AGENT_VERSION` | Build/release metadata. |
| `STERISPHERE_AGENT_HEARTBEAT_SECRET` | Environment-specific secret matching the server contract. |
| `STERISPHERE_HEARTBEAT_INTERVAL_SECONDS` | Local operational tuning. |

### Platform-generated variables observed locally

`NX_DAEMON`, `TURBO_CACHE`, `TURBO_DOWNLOAD_LOCAL_ENABLED`, `TURBO_REMOTE_ONLY`, and `TURBO_RUN_SUMMARY` are build-tool controls. `VERCEL`, `VERCEL_ENV`, `VERCEL_TARGET_ENV`, `VERCEL_URL`, `VERCEL_OIDC_TOKEN`, and the `VERCEL_GIT_*` variables are Vercel-managed deployment metadata. They are neither database schema inputs nor manually synchronized secrets. `VERCEL_OIDC_TOKEN` is sensitive and must never be logged or copied.

The observed Git metadata names are `VERCEL_GIT_COMMIT_AUTHOR_LOGIN`, `VERCEL_GIT_COMMIT_AUTHOR_NAME`, `VERCEL_GIT_COMMIT_MESSAGE`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_PREVIOUS_SHA`, `VERCEL_GIT_PROVIDER`, `VERCEL_GIT_PULL_REQUEST_ID`, `VERCEL_GIT_REPO_ID`, `VERCEL_GIT_REPO_OWNER`, and `VERCEL_GIT_REPO_SLUG`.

## Release workflow

```text
feature branch
  -> review and local/unit harnesses
  -> merge to main
  -> deploy application and approved SQL to Staging
  -> run Staging preflights, integration tests, and deployment validation
  -> record release evidence and approval
  -> promote the same application artifact and migration set to Production
  -> run read-only Production preflights and bounded smoke checks
```

Production promotion is a new controlled action, not a second implementation. SQL must never be edited between Staging validation and Production application. Emergency changes must still be captured as reviewed migration history before environments are considered synchronized.

## Testing matrix

| Test class | Local | Preview (future) | Staging | Production |
|---|---:|---:|---:|---:|
| Pure unit/domain tests | Required | Required | Optional repeat | No |
| Repository/service mock harnesses | Required | Required | Optional repeat | No |
| SQL source-contract/preflight tests | Required | Required | Required | Read-only preflight only |
| Real repository/RPC integration | Local Supabase when available | Required | Required | Prohibited unless separately approved and read-only |
| Deployment-engine end-to-end | Synthetic/local | Synthetic | Required with test-owned fixtures | Bounded smoke only; no synthetic clinic pollution |
| Recovery persistence integration | Local disposable DB | Preferred | Explicit opt-in fixture | Prohibited |
| Rollback planning | Unit/source | Required | Required before rollback release | No mutation test |
| Rollback execution (future) | Disposable DB | Required | Required with fixture cleanup | Prohibited until separately approved |
| Performance/load | Local baseline | Optional | Controlled, production-like | Observation only; no unapproved load generation |
| Production smoke | No | No | Release rehearsal | Read-only or narrowly bounded approved checks |

Test data belongs to the environment that created it. A passing Staging test never authorizes copying Staging records to Production.

## RC10.9 recovery integration

The isolated runner documented in `deployment-recovery-live-integration.md` is the Staging validation boundary for RC10.9 persistence. It prepares deterministic test-owned prerequisites, validates `persisted -> reused -> conflict -> reused`, confirms zero rollback-execution counters, and removes only fixture-owned rows. Its safety gate blocks Production, unknown remote environments, missing opt-in, and a current URL equal to the configured Production URL.

It validates persistence only. It does not execute rollback, compensation, binding deletion, session recovery, or finalization.

## Future roadmap

1. **Baseline:** reconcile the current standalone SQL inventory into an authoritative ordered baseline without rewriting applied history.
2. **Migration ledger:** adopt immutable timestamped migrations plus a checked-in Supabase CLI configuration and schema-version record.
3. **Automated drift checks:** compare Staging and Production structure, functions, grants, RLS, indexes, extensions, and storage policy definitions without comparing tenant data.
4. **CI validation:** apply migrations to a disposable database, run preflights and integration harnesses, and publish sanitized evidence.
5. **Preview environments:** create per-branch Supabase branches and Vercel previews with generated fixtures and automatic teardown.
6. **Release promotion:** promote an immutable build and the same migration set from Staging to Production with approvals and auditable release metadata.
7. **Recovery/rollback qualification:** validate persistence and future rollback execution only in disposable or Staging fixtures before any separately authorized Production capability.

Until migration automation exists, the manual synchronization controls in `environment-synchronization.md` are authoritative.
