# Clinical Event Architecture Blueprint

Phase 7.2C defines the planning architecture for Smart Clinical Workstation
events. This document does not implement scanner behavior, patient tracing,
printing changes, or Clinic Agent runtime changes.

## Scope

Smart Clinical Workstations represent physical clinical locations such as
Reception, Sterilization Room, Operatory 1, and Operatory 2. Each workstation
may eventually connect to a SteriSphere Clinic Agent that brokers local hardware
events for printers, USB scanners, cameras, sound alerts, sterilizers, RFID/NFC,
and future sensors.

This blueprint covers the event shape, routing principles, scanner lifecycle,
patient context rules, audit requirements, offline/retry strategy, security
model, and implementation phases.

## High-Level Architecture

```text
SteriSphere Cloud
  -> browser / Assistant Workstation
  -> SteriSphere Clinic Agent
  -> workstation hardware
  -> event flow back to cloud/browser
```

The browser remains the clinical interface. The Clinic Agent becomes the local
hardware gateway inside the clinic network. SteriSphere Cloud should not attempt
direct LAN access to clinic printers, scanners, cameras, speakers, or
sterilizers.

Expected responsibilities:

- SteriSphere Cloud stores configuration, validates clinical workflow state,
  resolves pack/patient context, and records audit trails.
- Browser / Assistant Workstation owns the visible clinical session and active
  patient context.
- Clinic Agent owns local hardware communication, workstation identity, event
  normalization, local queueing, and retry.
- Workstation hardware emits raw actions such as scans, print outcomes, camera
  scan states, sound requests, sterilizer signals, and health updates.

## Core Event Model

Future events should use a stable envelope so browser, cloud, and Clinic Agent
code can share one routing contract.

| Field | Purpose |
| --- | --- |
| `event_id` | Globally unique idempotency key for the hardware or workstation event. |
| `clinic_id` | Clinic scope for routing, authorization, and audit filtering. |
| `workstation_id` | Registered workstation identity when available. |
| `workstation_name` | Human-readable room/location name such as Operatory 1. |
| `workstation_type` | Location type such as `reception`, `sterilization`, `operatory`, `admin`, or `other`. |
| `device_type` | Hardware category such as `printer`, `usb_scanner`, `tablet_camera`, `camera`, `sound`, `sterilizer`, `rfid_nfc`, `sensor`, or `workstation`. |
| `device_id` | Local or registered hardware identifier when available. |
| `event_type` | Domain event name such as `scanner.pack_scanned`. |
| `payload` | Event-specific data. Avoid unnecessary PHI. |
| `user_id` | Authenticated SteriSphere user when the browser/session can provide it. |
| `patient_context_id` | Active patient context when present and valid. |
| `source` | Origin such as `clinic_agent`, `browser`, `cloud`, or `system`. |
| `created_at` | Time the event was created at the source. |
| `processed_at` | Time the cloud/browser finished handling the event. |
| `status` | Processing state such as `queued`, `received`, `processing`, `processed`, `rejected`, or `failed`. |
| `error_message` | Human-readable error if processing failed or was rejected. |

## Event Types

Initial event names should remain explicit and domain-scoped:

- `scanner.pack_scanned`
- `scanner.unknown_code_scanned`
- `printer.label_print_requested`
- `printer.label_printed`
- `printer.error`
- `camera.scan_started`
- `camera.scan_completed`
- `sound.alert_requested`
- `sterilizer.cycle_detected`
- `sterilizer.cycle_completed`
- `workstation.heartbeat`
- `workstation.offline`
- `workstation.needs_attention`

Future event families can be added for RFID/NFC, environmental sensors,
sterilizer diagnostics, or hardware inventory changes without changing the
core event envelope.

## Scanner Event Lifecycle

USB scanner flow should be explicit and recoverable:

1. USB scanner emits a code into the Clinic Agent.
2. Clinic Agent attaches workstation and device context.
3. Clinic Agent creates an event with a stable `event_id`.
4. Event is sent to SteriSphere Cloud or a bound local browser session.
5. Active browser session receives or polls for the event.
6. Event resolves to a pack when the code matches a known pack identifier.
7. Pack assignment proceeds only if the patient context is valid.
8. Audit log is created for accepted, rejected, and failed scanner events.
9. Errors are visible to the user and recoverable through manual retry,
   re-scan, or fallback entry.

Important rule: scanning a code must not automatically assign a pack unless the
browser/workstation has a valid active patient context and the pack is eligible
for traceability assignment.

## Patient Context Flow

Patient context should belong to the browser/workstation clinical session, not
to a raw scanner device.

Supported and future context paths:

- User manually opens a patient record.
- User selects a patient from a future appointment list.
- Assistant starts Trace Patient Pack.
- Browser session stores an active patient context for the current workflow.
- Workstation scanner events attach only to that active context.
- Context expires or clears when the page changes, session ends, patient is
  changed, or the workflow explicitly resets.

The Clinic Agent may include workstation/device context, but it should not be
the authority for patient assignment. Patient assignment requires cloud/browser
validation against the active clinical session.

## Audit Logging Principles

Every hardware-triggered clinical action must be auditable.

Audit events should include:

- Event id and event type.
- Clinic id.
- Workstation id, name, and type when available.
- Device type and device id when available.
- User identity when available.
- Patient context id when relevant.
- Pack id or code resolution result when relevant.
- Accepted, rejected, failed, and retried outcomes.
- Error reason for failed or rejected events.

Scanner events should be logged even when rejected because rejected scans can
indicate workflow confusion, wrong-room activity, expired packs, unknown codes,
or hardware issues. Patient assignment requires clear traceability from scanner
event to user, workstation, patient context, pack, and final action.

## Offline And Retry Strategy

Clinic Agent and browser sessions should assume the network can fail.

Planned strategy:

- Clinic Agent may queue events locally when SteriSphere Cloud is unavailable.
- Queued events retain their original `event_id` as the idempotency key.
- Cloud processing must reject duplicates by `event_id`.
- Retried events should preserve original `created_at` and append/update
  retry metadata in payload or audit logs.
- Browser should surface delayed-event feedback when an event was captured but
  not yet confirmed by cloud processing.
- Patient-assignment events should be conservative when delayed; if active
  patient context has expired, the event should require manual confirmation or
  be rejected with a clear recovery path.

Duplicate prevention should use `event_id` first, then device/event-specific
payload checks as a secondary guard when appropriate.

## Security Model

Access and trust boundaries:

- `super_admin` controls workstation setup and hardware configuration.
- Assistant and clinical users can use configured workstation hardware through
  authorized clinical workflows.
- Clinic Agent should eventually authenticate with a registration token, shared
  secret, or paired credential issued from SteriSphere.
- Clinic Agent credentials should be scoped to a clinic and, ideally, to one or
  more workstation registrations.
- Vercel/SteriSphere Cloud must not directly access private LAN devices.
- Browser code should avoid direct exposure to printer/scanner internals when
  the Clinic Agent can broker hardware safely.
- Clinic Agent logs must avoid unnecessary PHI and should prefer event ids,
  device ids, status, and minimal diagnostic detail.

The browser may receive normalized event notifications, but low-level hardware
protocols should stay inside the Clinic Agent where possible.

## Implementation Phases

- 7.2C Blueprint only.
- 7.3 Workstation registration UI/data persistence.
- 7.4 Clinic Agent event endpoint prototype.
- 7.5 Browser workstation session binding.
- 7.6 USB scanner event prototype.
- 7.7 Patient trace integration.
- 7.8 Audit logs and reports integration.

## Non-Goals For 7.2C

- No Supabase reads or writes.
- No scanner ingestion.
- No patient tracing changes.
- No packs, cycles, or print workflow changes.
- No Clinic Agent runtime changes.
- No migrations applied.
