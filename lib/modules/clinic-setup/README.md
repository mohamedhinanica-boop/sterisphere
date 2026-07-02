# Clinic Setup

The Clinic Setup module is the domain foundation for first-time clinic
deployment and future reconfiguration by Super Admins. It contains no UI,
database access, routing, authentication changes, or persistence.

## Architecture

The module defines:

- An ordered, extensible setup-step vocabulary.
- Typed configuration for clinic profile, workstations, providers,
  sterilizers, policies, hardware, completion status, and future expansion.
- An immutable in-memory setup state.
- Pure helpers for forward and backward navigation and completion checks.

Callers own validation rules, timestamps, authorization, persistence, and the
decision to mark steps complete.

## Platform relationships

- **Clinical Workstations** provide the room and location context configured by
  the wizard.
- **Clinic Agents** provide the future local bridge for configured clinic
  hardware.
- **Hardware Devices** contribute capabilities and can be assigned to
  workstations and agents.
- **Unified Scan Services** interpret scan data after setup; the wizard only
  configures relevant capabilities.
- **Unified Print Services** interpret print requests after setup; the wizard
  only configures printing context and policy.

Configuration is established before operational workflows consume it. Existing
clinic workflows remain independent of this module until a future integration
phase explicitly adopts it.
