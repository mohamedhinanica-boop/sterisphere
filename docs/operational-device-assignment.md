# Operational Device Assignment And Workflow Integrity

Phase 7.3D defines how portable, fixed, and fallback scanning devices should
relate to clinical rooms. This is a planning contract only. It does not change
patient tracing, scanner behavior, Clinic Agent behavior, printing, UI, or
persistence.

## Product Philosophy

SteriSphere promotes the safest and most efficient workflow but never prevents
compliant clinical care because hardware is missing, unavailable, or deployed
differently by a clinic.

The preferred workflow is a registered scanner in the room of use. Tablet
camera scanning and explicit room selection remain valid paths. SteriSphere
should increase prompts, audit detail, and confidence signaling as a workflow
moves away from known room-bound hardware, rather than blocking care solely
because a clinic has fewer devices.

## Core Definitions

- **Default workstation:** the device's stable home room. Moving a device for a
  session does not change this value.
- **Current assignment:** the workstation where the device is expected to be
  used now. It may match or temporarily differ from the default workstation.
- **Assignment mode:** `permanent` for normal placement or `temporary` for a
  session-bound relocation.
- **Assignment reason:** a structured reason and optional note explaining a
  temporary assignment, fallback, or override.
- **Device availability:** whether a device is `available`, `in_use`,
  `offline`, `maintenance`, or `unknown`.
- **Room of use:** the physical room where clinical care and pack use occur.
- **Scan location:** the workstation context where a scan was captured. It may
  differ from the room of use.
- **Clinical workstation:** the configured `clinical_workstations` record for
  the room of use and the authoritative room identity for patient traceability.

The default workstation is inventory configuration. The current assignment is
operational state. A patient trace records what actually happened and must not
infer room of use solely from the device's default home.

## Clinic Deployment Levels

### Basic Clinic

A tablet camera may be the clinic's primary scanner. The user works from a
configured clinical workstation context or selects the room of use from the
configured workstation list. No dedicated scanner purchase is required.

### Growing Clinic

Shared portable scanners can move between rooms. Each device retains a default
home but receives a current temporary assignment for the active session.
Tablet camera scanning remains available when the shared scanner is elsewhere
or unavailable.

### Enterprise Clinic

Each room may have registered scanners and other devices permanently assigned
to its workstation. Known device, workstation, user, and patient context
produce the strongest workflow confidence, while fallback paths remain
available during outages or maintenance.

## Workflow Rules

1. **Preferred:** use a registered scanner currently assigned to the clinical
   workstation where care occurs. The scan and clinical workstation identities
   normally match.
2. **Valid:** use a tablet camera in the room of use with a known configured
   workstation and active patient context.
3. **Fallback:** use a scanner or tablet outside the room of use. The user must
   select the clinical workstation from configured workstations and provide an
   assignment or override reason.
4. **Exception:** a reception or other non-clinical scan intended for patient
   traceability requires a visible warning, a reason, and an audit record. It
   must not silently redefine Reception as the clinical room of use.

Configured workstations remain the source of truth for room selection. Manual
fallback uses the same workstation dropdown as hardware-assisted workflows,
never free-text room entry.

Hardware failure must not erase context. When an assigned scanner is offline,
SteriSphere should preserve the patient and clinical workstation context while
offering tablet camera or another configured-device path.

## Assignment Model

A future device assignment should capture:

| Field | Purpose |
| --- | --- |
| `device_id` | Registered physical device being assigned. |
| `default_workstation_id` | Stable home workstation for inventory and readiness. |
| `current_workstation_id` | Workstation where the device is expected for this assignment. |
| `assignment_mode` | `permanent` or `temporary`. |
| `assignment_reason` | Structured reason such as shared device, maintenance coverage, or fallback. |
| `assignment_reason_note` | Optional human explanation when the structured reason is insufficient. |
| `availability` | Current operational availability of the device. |
| `assigned_by` | User responsible for the assignment when available. |
| `assigned_at` | Time the assignment became effective. |
| `expires_at` | End of a temporary assignment or session, when known. |
| `released_at` | Time the assignment was explicitly cleared. |

Temporary assignments should expire or be released at session end. Expiration
returns operational resolution to the default workstation; it does not rewrite
assignment history.

## Shared Scanner Workflow

1. The scanner remains registered with its default home workstation.
2. A user starts a workstation session in another configured room.
3. The scanner receives a temporary current assignment for that session.
4. Scanner events inherit the current scan workstation and device identity.
5. Patient tracing independently records the clinical workstation where care
   occurs.
6. Assignment creation, change, expiration, and release are auditable.
7. Ending the session clears the temporary assignment while leaving the default
   home unchanged.

Only one active current assignment should exist for a physical device at a
time. A conflicting reassignment should close or supersede the prior
assignment explicitly so event attribution remains deterministic.

## Tablet Fallback Workflow

A tablet may be the primary scanner for a small clinic or a backup scanner for
a larger clinic. A browser camera is a scan source and may not have a
first-class registered `device_id`; browser/session identity can provide
diagnostic attribution until device registration is introduced.

When the tablet is physically in the room of use, a known workstation and
patient context are sufficient for a high-confidence workflow. When the tablet
is outside that room, the user must select the clinical workstation and provide
a reason before patient assignment. The selection must come from configured
workstations.

## Patient Trace Audit Model

Future patient trace records should distinguish:

| Field | Purpose |
| --- | --- |
| `scan_workstation_id` | Workstation context where the scan originated. |
| `clinical_workstation_id` | Authoritative room of use where care occurred. |
| `device_id` | Registered scanner/device, or null for an unregistered tablet camera. |
| `user_id` | Authenticated user responsible for the action. |
| `override_reason` | Required explanation when location or assignment is overridden. |
| `confidence_level` | Derived workflow confidence: `excellent`, `high`, `good`, or `exception`. |
| `created_at` | Time the trace action was created. |

The audit record should also retain the source event id and patient/pack
references when those models are integrated. Historical traces must preserve
the recorded workstation and device ids even if hardware is later moved,
replaced, or retired.

## Workflow Confidence

- **Excellent:** registered scanner, known and matching workstation assignment,
  authenticated user, and valid patient context.
- **High:** tablet camera, known clinical workstation, authenticated user, and
  valid patient context.
- **Good:** clinical workstation selected manually with a recorded reason and
  valid patient context.
- **Exception:** reception/non-clinical scan, workstation mismatch, explicit
  override, or another condition requiring elevated review.

Confidence is an auditable description of context completeness, not a clinical
validity verdict. It must not replace the underlying facts or hide an override.
The server should eventually derive it from persisted context rather than trust
an arbitrary client-provided value.

## Integrity Principles

- Room of use and scan location are separate facts.
- Patient assignment requires a configured clinical workstation.
- Device defaults must not silently overwrite temporary or user-confirmed room
  context.
- Scanner events inherit device and scan workstation context automatically when
  known.
- Location mismatches require confirmation and a reason.
- Failed, rejected, delayed, and overridden actions remain auditable.
- Missing hardware lowers automation or confidence; it does not remove a
  compliant fallback.

## Future Implementation Boundaries

This blueprint informs future workstation persistence, hardware assignment,
browser session binding, scanner integration, patient trace integration, and
audit reporting. Each implementation phase should preserve browser/tablet
fallbacks and introduce persistence or enforcement only with explicit workflow
design and migration review.

## Non-Goals For 7.3D

- No migrations or Supabase reads/writes.
- No UI or patient tracing changes.
- No scanner ingestion or Clinic Agent changes.
- No packs, cycles, or print workflow changes.

