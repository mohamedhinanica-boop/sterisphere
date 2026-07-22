# Isolated Recovery Persistence Integration Validation

RC10.9C.2A provides an explicit fixture and runner for validating recovery-plan persistence against a disposable local, development, staging, or Supabase branch database. Production validation is prohibited because the recovery RPC requires an exact deployment run and execution-session source. Synthetic recovery evidence must never be attached to production deployment records.

## Safety gate

Database access is refused unless all conditions hold:

- `STERISPHERE_ALLOW_RECOVERY_INTEGRATION_FIXTURE=true` is explicitly set.
- `STERISPHERE_RECOVERY_INTEGRATION_ENVIRONMENT` is one of `local`, `development`, `test`, `staging`, or `supabase_branch`.
- neither `NODE_ENV` nor `VERCEL_ENV` is `production`.
- the current `SUPABASE_URL` is valid and does not equal `STERISPHERE_PRODUCTION_SUPABASE_URL`.
- remote databases provide `STERISPHERE_PRODUCTION_SUPABASE_URL` for comparison; localhost may omit it.
- `SUPABASE_SERVICE_ROLE_KEY` is supplied only through the server environment.

The helper is not exported from a production barrel, route, Setup action, or runtime registry. It does not execute during builds or normal test commands.

## Deterministic fixture graph

The fixture creates or reuses only records carrying the exact test-owned identities and metadata:

1. Clinic `INTEGRATION-RECOVERY-PERSISTENCE-VALIDATION`.
2. Deployment run `integration-fixture:recovery-persistence-validation:run` linked to that clinic.
3. Failed, zero-item execution session `integration-fixture:recovery-persistence-validation:execution` linked to the clinic and run.

No activation-plan row or execution item is required by the zero-item `rollback_not_required` RPC contract. Existing rows with any deterministic fixture ID but without the exact fixture ownership markers block preparation and cleanup.

## Validation sequence

After removing stale fixture-owned evidence, the runner prepares the graph and calls the existing `DeploymentRecoveryPersistenceService` and `SupabaseDeploymentRecoveryRepository`:

1. Persist canonical zero-item evidence and require `persisted`.
2. Replay it and require `reused`.
3. Preserve the recovery identity while changing the normalized evidence message and require `conflict`.
4. Replay the canonical evidence again and require `reused`, proving the conflict did not replace it.
5. Require zero rollback, compensation, binding-removal, session-recovery, and finalization counters.

Each service invocation maps to one atomic `persist_deployment_recovery_plan` RPC. The fixture never inserts directly into either recovery table and does not bypass repository or service validation.

## Cleanup

Cleanup validates exact fixture ownership and deletes only in foreign-key-safe order:

1. recovery-plan children;
2. recovery-plan parent;
3. execution session;
4. deployment run;
5. clinic.

Foreign or real records are never cleanup-eligible. Cleanup failure is returned explicitly. If an isolated environment prevents cleanup through immutable policy or additional foreign keys, reset the disposable Supabase branch or local database instead of weakening production constraints.

## Explicit execution

PowerShell example for a Supabase branch or staging database:

```powershell
$env:STERISPHERE_ALLOW_RECOVERY_INTEGRATION_FIXTURE = "true"
$env:STERISPHERE_RECOVERY_INTEGRATION_ENVIRONMENT = "supabase_branch"
$env:STERISPHERE_PRODUCTION_SUPABASE_URL = "https://your-production-project.supabase.co"
$env:SUPABASE_URL = "https://your-isolated-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<isolated-environment-service-role-key>"
node .\scripts\run-deployment-recovery-live-integration.cjs
```

For local Supabase, use `local` and a localhost `SUPABASE_URL`; the production URL comparison variable may be omitted. A passing run reports `persisted`, `reused`, `conflict`, a final immutable `reused`, successful cleanup, and zero execution counters. Do not claim live integration success until this command has passed against the intended isolated database.
