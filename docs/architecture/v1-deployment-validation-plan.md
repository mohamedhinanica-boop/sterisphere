# SteriSphere v1.0 Deployment Validation Plan

## Purpose

Phase 9 validates SteriSphere as a deployable clinical platform. Its goal is to
prove that a brand-new clinic can move from first login to an operational
SteriSphere environment through a repeatable deployment process.

This phase is not feature expansion. It validates deployment architecture,
onboarding, configuration persistence, operational readiness, and go-live
quality for v1.0.

## Deployment Scenario

The first-clinic validation scenario uses **Dentaria** as the example clinic.
The current development and test environment remains **SteriSphere Lab** and
must not be wiped, repurposed, or treated as the clean deployment target.

The clean deployment should use:

- A separate Supabase project.
- Preferably a separate Vercel project or isolated Vercel environment.
- Fresh environment variables and infrastructure configuration.
- A first Super Admin created through the documented bootstrap process.
- No existing clinic configuration or operational records.

The exercise should simulate a real SafeNebula implementation from initial
infrastructure preparation through clinic go-live. Developer involvement may be
used for the initial infrastructure setup, but the clinic deployment workflow
itself must not require manual database edits or code changes.

## Success Criteria

- [ ] A fresh environment can be initialized.
- [ ] The first Super Admin can log in.
- [ ] An undeployed clinic is redirected to `/setup`.
- [ ] The Setup Wizard can be completed.
- [ ] The Review page accurately summarizes the deployment draft.
- [ ] Deployment persistence creates all required records.
- [ ] The dashboard becomes available only after deployment.
- [ ] Settings show the generated clinic configuration.
- [ ] Workstations, sterilizers, policies, and hardware plans are present.
- [ ] The first sterilization cycle can be created.
- [ ] Packs can be generated.
- [ ] Labels can be printed.
- [ ] Patient traceability can be completed.
- [ ] Reports load correctly.
- [ ] Audit logs record deployment and key operational actions.
- [ ] No manual developer intervention is required after initial infrastructure
      setup.

## Phase 9 Roadmap

### 9.1 Deployment Architecture

Define the deployment state model, ownership boundaries, transaction strategy,
audit requirements, and post-deployment behavior of `/setup`.

### 9.2 Deployment Persistence Engine

Convert the reviewed local deployment draft into validated, persisted clinic
configuration while preventing partial or duplicate deployment.

### 9.3 First Login / Deployment Required Flow

Detect an undeployed clinic after authentication, direct the first Super Admin
to `/setup`, and withhold the live workspace until deployment succeeds.

### 9.4 Clean Environment Deployment Simulation

Provision the isolated Dentaria environment and execute the deployment process
as a real implementation, without modifying SteriSphere Lab.

### 9.5 End-to-End Clinical Validation

Validate a representative workflow from configuration through sterilization,
pack production, label printing, patient traceability, reporting, investigation,
and audit review.

### 9.6 Deployment Documentation and Go-Live Guide

Produce the infrastructure, deployment, troubleshooting, hardware, and go-live
documentation needed for a repeatable clinic implementation.

## Deployment Architecture Questions

- What table or record represents clinic deployment status?
- Should deployment be atomic?
- How should partial failures be handled and recovered?
- How should each deployment attempt and outcome be audited?
- How should first Super Admin ownership be linked to the deployed clinic?
- What should happen if `/setup` is opened after deployment?
- How should future multi-clinic support influence ownership, routing, and
  deployment-state design?

These questions must be resolved before the persistence engine is considered
production-ready.

## Data To Create During Deployment

Expected future persistence targets include:

- Clinic profile and clinic settings.
- Clinical workstations.
- Provider structure or deployment placeholders.
- Sterilizers.
- Baseline sterilization policies.
- Hardware planning records.
- Deployment audit log.
- Initial administrator ownership and role context.

This list describes the expected configuration domains. The exact schema,
relationships, constraints, and transaction boundaries can be finalized during
Deployment Architecture and Persistence Engine design.

### Deployment Schema Planning Status

`supabase_deployment_core.sql` now provides migration-ready planning SQL for the
clinic root, deployment runs, provider planning counts, and hardware planning
counts. It is a reviewed schema input for future clean-environment migration
work, not an automatically applied migration.

Phase 9.3 does not create Lab or clinic database objects, enable RLS, or connect
the Deployment Engine to Supabase. Applying and validating the schema in an
appropriate isolated environment remains an explicit later step.

## Rollback Strategy

Deployment should eventually be all-or-nothing wherever the infrastructure
permits. A failed attempt must not leave the clinic in a partially deployed
state or expose an incomplete live workspace.

If deployment fails:

- Partial records should be rolled back or safely reconciled.
- The user should receive a clear, actionable error.
- The reviewed local draft should remain available for correction and retry.
- The attempt, failure point, and outcome should be auditable.
- A retry must not create duplicate configuration.

## QA Checklist

- [ ] Authentication
- [ ] RBAC
- [ ] Setup Wizard
- [ ] Dashboard
- [ ] Settings
- [ ] Workstations
- [ ] Sterilizers
- [ ] Hardware
- [ ] Cycles
- [ ] Packs
- [ ] Labels
- [ ] Patient Traceability
- [ ] Reports
- [ ] Investigation
- [ ] Audit Logs
- [ ] Assistant Workstation
- [ ] Desktop validation
- [ ] Tablet validation

Each area should be tested in the clean Dentaria environment with role,
navigation, empty-state, validation, failure, and representative success paths
where applicable.

## Documentation Checklist

- [ ] Internal deployment guide
- [ ] Clean environment setup guide
- [ ] Supabase setup notes
- [ ] Vercel environment variable checklist
- [ ] First Super Admin creation notes
- [ ] Hardware setup notes
- [ ] Troubleshooting notes
- [ ] Go-live checklist

## Non-Goals

- Do not add unrelated features during v1 validation.
- Do not wipe or repurpose SteriSphere Lab.
- Do not turn the Setup Wizard into full Settings.
- Do not configure every provider identity during deployment.
- Do not expose technical infrastructure unnecessarily to clinic users.

## v1.0 Completion Definition

SteriSphere v1.0 is complete when SteriSphere can be deployed into a clean
clinic environment, create its core configuration, and successfully complete a
representative sterilization-to-traceability workflow.

This definition includes repeatable setup, persisted configuration, operational
validation, appropriate audit evidence, and no manual developer intervention
after the initial infrastructure setup.

## Future After v1.0

Work outside Phase 9 may include v1.1 feature improvements, v1.2 AI
enhancements, a future inventory module, and the longer-term ClinicOS platform
concept. These directions do not expand the v1.0 deployment validation scope.
