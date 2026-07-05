# Phase 7 Overview

Phase 7 moved SteriSphere from a browser-only workflow application toward a
hardware-aware clinical platform. It established room-based workstation
context, local Clinic Agent infrastructure, device capability models, shared
scan and print interpretation boundaries, and consistent traceability
workflows across desktop and tablet surfaces.

The architecture remains progressively adoptable: clinics can use browser and
tablet workflows without purchasing dedicated hardware, while configured local
devices can improve speed and reliability.

---

# Infrastructure Completed

## Clinical Workstations

Clinical Workstations represent physical rooms or operational locations. They
provide stable clinical context for room selection, assigned capabilities, and
future workstation-aware automation.

## Clinic Agents

Clinic Agents bridge SteriSphere Cloud and hardware on a clinic's private
network. Registration and heartbeat foundations provide an identifiable,
security-conscious path for local execution without exposing local devices
directly to the cloud.

## Hardware Devices

Hardware Devices describe scanners, printers, cameras, sterilizers, and other
equipment as capabilities. Device records can be associated with agents and
workstations without embedding device-specific behavior in clinical workflows.

## Workstation Sessions

Workstation Sessions provide runtime context for who or what is operating at a
workstation. This creates a foundation for deliberate temporary assignments,
session-aware activity, and future audit enrichment.

---

# Hardware Integration

- **USB HID Scanner:** Keyboard-wedge scanning supports ordinary USB scanners
  without a proprietary browser SDK.
- **Tablet Camera:** The assistant trace workflow can decode pack QR values and
  pass them through the same clinical interpretation layer as USB scans.
- **Local Print Agent:** A lightweight local service supports the existing
  clinic-network printing path while browser printing remains available.
- **Heartbeat:** Clinic Agents can report operational presence to SteriSphere.
- **Printer support:** Pack labels and test labels support the current
  Zywell-compatible TSPL path, with configuration and browser fallback
  preserved.
- **Diagnostics:** Settings surfaces expose scanner capture, printer
  connectivity, test-label, agent, and hardware status information without
  placing clinical decisions inside hardware tooling.

---

# Unified Clinical Services

## Unified Scan Services

Unified Scan Services accepts raw values from sources such as USB HID scanners,
tablet cameras, mobile cameras, Bluetooth scanners, or system handoffs. It
normalizes the value and returns a clinical intent such as `PACK_TRACE` or
`UNKNOWN`. It does not navigate, display UI, or write clinical records.

## Unified Print Services

Unified Print Services provides the typed foundation for interpreting
`PACK_LABEL`, `TEST_LABEL`, and `REPORT` requests. It normalizes and validates a
request without sending it, contacting an agent, rendering output, or writing
to the database. Print execution remains a separate responsibility.

The shared dependency direction is:

Hardware produces data.

Clinical Services produce intent.

Workflows consume intent.

---

# Clinical Workflow Improvements

- **Patient Traceability:** Desktop traceability and the guided tablet workflow
  share pack validation and preserve explicit confirmation before a trace is
  saved.
- **Manual Patient Creation:** Authorized trace workflows can create and select
  a patient without leaving the task.
- **Clinical Room Selection:** Active configured operatories provide the room
  choices used by traceability workflows, with safe fallback behavior.
- **Scan Anywhere:** Pack-like USB scans outside Patient Traceability can offer
  a deliberate handoff into that workflow without creating a trace.
- **Assistant improvements:** Guided pack, patient, care, review, and
  confirmation steps provide a tablet-oriented workflow while preserving
  manual pack entry and camera fallback.

---

# Engineering Principles Introduced

- Business logic never depends on hardware.
- Clinical intent comes before technical implementation.
- Workstations own context.
- Devices provide capabilities.
- Observe before control.
- Security is designed in, not added later.
- Configuration is preferred over hardcoding.
- Reusable clinical services come before feature duplication.
- Manual and browser-safe fallbacks remain available during progressive
  automation.

---

# Phase 8 Entry Criteria

Phase 8 can begin with the following foundations available:

- Persisted workstation, agent, hardware-device, and workstation-session
  models.
- Clinic Agent registration guidance and live heartbeat infrastructure.
- USB HID and tablet-camera scan sources using Unified Scan Services.
- Unified Print Services request interpretation foundation.
- Existing local-agent and browser print paths.
- Desktop and tablet Patient Traceability workflows.
- Hardware and printing diagnostic surfaces.
- Documented hardware-independent engineering boundaries.

Phase 8 goals are:

- Implement the Clinic Setup Wizard.
- Introduce workflow automation behind explicit safety controls.
- Apply workstation awareness to appropriate clinical workflows and audits.
- Integrate Unified Print Services with execution and routing.
- Add carefully scoped AI-assisted workflows.
- Complete a security review of agent identity, credentials, local endpoints,
  and clinical event handling.
- Refine deployment, diagnostics, recovery, and day-to-day operations.

---

# Future Hardware

Planned capability areas include:

- Bluetooth scanners
- Multiple printers
- Sterilizers
- Signature pads
- RFID
- Environmental sensors
