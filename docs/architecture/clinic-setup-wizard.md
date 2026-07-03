# SteriSphere Clinic Setup Wizard

## Purpose

The SteriSphere Clinic Setup Wizard is the guided onboarding experience used when deploying SteriSphere into a clinic for the first time.

Its objective is to provide a safe, repeatable, and auditable deployment process that ensures every clinic is configured consistently while minimizing implementation time.

The Setup Wizard transforms deployment from a manual technical process into a guided clinical workflow.

---

# Product Philosophy

Every SteriSphere deployment should follow the same logical sequence.

The software should guide the implementation engineer through each required configuration step and validate completion before allowing the clinic to begin normal operation.

The Setup Wizard should encourage best practices while remaining flexible enough to support clinics of different sizes.

Small clinics should complete setup in only a few minutes.

Large clinics should be able to configure dozens of rooms and devices without changing the deployment process.

---

# Access Control

The Clinic Setup Wizard is a deployment tool.

It is **Super Admin only**.

Clinical Staff, Doctors, Auditors and standard Administrators must never have access to deployment-level configuration.

Once deployment has been completed, only operational settings appropriate to each role should remain configurable.

The primary operator is SteriSphere deployment staff or a Super Admin, not
daily clinic staff. Deployment follows a discovery meeting, clinic intake,
technician-led platform configuration, hardware validation, staff training,
and go-live.

A future Clinic Intake Questionnaire may provide structured input to the
wizard. The questionnaire remains a separate intake surface and does not
replace Super Admin review or configuration validation.

---

# Deployment Flow

Welcome

↓

Clinic Profile

↓

Clinic Users

↓

Providers

↓

Sterilizers

↓

Clinical Workstations

↓

Clinic Agents

↓

Hardware Discovery

↓

Policies

↓

Printing

↓

Review

↓

Launch Clinic

---

# Step 1 — Clinic Profile

Configure:

- Clinic Name
- Address
- Phone
- Email
- Time Zone
- Language
- Clinic Logo
- Working Days
- Working Hours

Clinic Profile owns the deployment identity and regional context of the clinic.
The initial implementation captures identity, locale, contact, and address
details with local validation before the wizard can advance.

Input quality is enforced locally before persistence: North American phone
numbers use a normalized digit value with a familiar display format, websites
gain a secure scheme when omitted, Canadian postal codes use the standard
spacing and pattern, and optional email and clinic-code values are validated
when supplied.

Deployment begins with clinic identity because later configuration needs a
stable clinic name, country, region, time zone, and primary language. In future
phases this profile can drive suggested workstation generation, regional policy
defaults, language defaults, and repeatable deployment automation. It must not
change existing clinic data until an explicit persistence phase is introduced.

---

# Step 2 — Users

Configure:

- Super Admin
- Clinic Admins
- Clinical Staff
- Doctors
- Auditors

Role Based Access Control (RBAC) should already be enforced.

---

# Step 3 — Providers

Configure providers working in the clinic.

Provider planning is a deployment-first workflow. The technician selects the
clinic type and describes the expected staffing mix with role quantities.
SteriSphere immediately generates a local provider draft with editable display
names, roles, statuses, and optional preferred workstation assignments. The
draft is planning context only and does not create or change operational
provider records.

Preferred workstation assignment connects the provider plan to the workstation
draft created earlier in the wizard. It communicates the expected working
location without creating a persisted relationship. Assignments remain
optional because providers may rotate between rooms, cover multiple locations,
or receive their final workstation during deployment validation.

The planning experience is desktop-first so configuration and the live provider
preview can remain visible together. Tablet layouts preserve the same workflow
in a single responsive column. Recommendations use clinic type and treatment
room count as transparent placeholder inputs; technicians remain responsible
for the final staffing draft.

Future integrations may synchronize providers from external practice management
software. Synchronization should be an explicit import and review process that
reconciles external provider identities with the deployment draft rather than
silently replacing technician decisions or existing provider records.

---

# Step 4 — Sterilizers

Register each sterilizer.

Future connected sterilizers may be discovered automatically by the Clinic Agent.

---

# Step 5 — Clinical Workstations

Define every room that participates in clinical workflows.

Examples:

- Reception
- Sterilization Room
- Operatory 1
- Operatory 2
- Surgery
- Hygiene
- Recovery

Workstations become the source of truth for room selection throughout SteriSphere.

The setup experience automatically generates a local workstation draft from
room quantities supplied by the deployment technician. Reception desks,
treatment rooms, sterilization rooms, consultation rooms, X-ray rooms,
laboratories, and storage rooms each produce predictable workstation names,
types, and default capability suggestions. Increasing or reducing a quantity
updates the draft immediately; there is no separate generation action.

The live preview is intentionally reviewable. Deployment staff can see the
effect of every layout change as it happens and can rename generated
workstations locally without affecting operational workstation records. This
phase does not persist data or create Clinical Workstations.

The workstation generator is desktop-first because deployment technicians need
configuration controls and the resulting draft visible side by side. On
tablets, the same controls and preview collapse into one responsive column
without changing the generation behavior.

Future Steri AI recommendations may use the completed Clinic Profile and clinic
intake information to suggest an initial room mix. Recommendations must remain
transparent, editable, and subject to technician review; they do not replace
the live preview or automatically create operational configuration.

---

# Step 6 — Clinic Agents

Register every SteriSphere Clinic Agent.

Examples:

Sterilization Room Agent

Operatory Agent

Mobile Agent

Each Agent becomes the local gateway for hardware.

---

# Step 7 — Hardware Discovery

The Clinic Agent automatically reports discovered hardware.

Examples:

Printers

USB Scanners

Cameras

Speakers

Sterilizers

Future Sensors

The deployment engineer assigns discovered hardware to workstations.

---

# Step 8 — Clinical Policies

Examples:

Pack Expiration

Label Format

Traceability Rules

Alert Preferences

Review Requirements

Audit Policies

---

# Step 9 — Printing

Configure:

Default Label Printer

Backup Printer

Test Print

Label Validation

---

# Step 10 — Review

Display a deployment summary.

Example:

✓ Clinic configured

✓ Users configured

✓ Sterilizers configured

✓ Workstations configured

✓ Agents online

✓ Hardware assigned

✓ Policies configured

---

# Step 11 — Launch Clinic

Deployment finishes.

Clinic becomes operational.

The Setup Wizard is marked complete.

Normal SteriSphere operation begins.

---

# Deployment Checklist

Every deployment should verify:

✓ Clinic Profile

✓ Users

✓ Providers

✓ Sterilizers

✓ Workstations

✓ Agents

✓ Hardware

✓ Printing

✓ Policies

✓ Backup Validation

---

# Product Principles

The Setup Wizard should never expose unnecessary technical complexity.

Deployment should be understandable by implementation staff without requiring database access.

The Setup Wizard should support both manual configuration and future automatic hardware discovery.

---

# RBAC Philosophy

Deployment configuration belongs exclusively to Super Admin.

Operational configuration should be delegated according to user roles.

Examples:

Super Admin

- Clinic deployment
- Agents
- Hardware
- Security
- Integrations

Clinic Admin

- Providers
- Sterilizers
- Policies
- Workstations (optional, configurable)

Clinical Staff

- Daily operational preferences only

Doctors

- No infrastructure configuration

Auditors

- Read-only access

This separation protects the integrity of the clinical platform while allowing operational flexibility.

---

# Steri AI Setup Companion

Steri AI should eventually assist SteriSphere deployment staff and clinics
using a supported self-service or remote onboarding path.

During setup, Steri AI should:

- Explain the purpose and effect of each setup step.
- Provide clear examples of expected configuration.
- Answer deployment and configuration questions.
- Flag missing, conflicting, or inconsistent information.
- Explain validation errors and suggest how to resolve them.
- Offer deployment-readiness guidance before go-live.

Steri AI is a companion, not a configuration authority. It must not override
Super Admin decisions, silently change configuration, or advance the wizard on
the user's behalf. Suggestions must remain visible, reviewable, and subject to
explicit human confirmation.

---

# Future Vision

Eventually the Setup Wizard should support:

- Existing clinic import
- Multi-clinic deployment
- Agent auto-discovery
- Automatic hardware pairing
- PMS integrations
- Cloud deployment validation
- AI-assisted deployment recommendations
- Deployment report generation
