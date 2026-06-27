# SteriSphere Project Map

## Technology Stack

* Next.js
* TypeScript
* TailwindCSS
* Supabase
* Vercel

---

## Routes

### Dashboard

/app/page.tsx

Purpose:
Main operational overview.

Components:

* DashboardStats
* OperationalAlerts
* SteriAssistantWidget
* LatestPatientTraceability
* RecentGeneratedPacks
* RecentActivity
* PerformanceStats

---

### Cycles

/app/cycles/page.tsx

Purpose:
Create and manage sterilization cycles.

Main Features:

* Cycle creation
* Pass / Fail validation
* Release cycle
* Cycle closing

Tables:

* cycles

---

### Packs

/ app/packs/page.tsx

Purpose:
Manage generated sterilization packs.

Main Features:

* Pack inventory
* QR code generation
* Label printing
* Expiration tracking
* Expired pack review workflow

Tables:

* packs

---

### Patient Traceability

/ app/patients/page.tsx

Purpose:
Assign sterilization packs to patients.

Main Features:

* Pack assignment
* Provider selection
* Traceability creation
* QR scanning
* Patient search

Tables:

* patient_traces
* patients

---

### Investigation

/ app/investigation/page.tsx

Purpose:
Investigate failed sterilization cycles.

Main Features:

* Risk analysis
* Affected packs
* Affected patients
* Investigation notes

Tables:

* cycles
* packs
* patient_traces

---

### Audit Logs

/ app/audit-logs/page.tsx

Purpose:
Compliance audit history.

Main Features:

* Event filtering
* CSV export
* Activity review

Tables:

* audit_logs

---

## Database Tables

### cycles

Purpose:
Sterilization cycle records.

### packs

Purpose:
Generated sterilization packs.

### patient_traces

Purpose:
Patient traceability.

### patients

Purpose:
Imported clinic patients.

### audit_logs

Purpose:
Compliance event tracking.

### user_roles

Purpose:
Role-based access control.

---

## Completed Workflows

* Cycle → Pack generation
* Pack → Patient traceability
* Failed cycle investigation
* Audit logging
* Expired pack review
* Dashboard operational alerts

---

---

## Current Known Improvements

* Clinic Agent registration
* Hardware discovery
* Device assignment to workstations
* Clinical workstation sessions
* USB scanner integration
* Patient traceability automation
* Settings navigation reorganization
* Clinic Setup Wizard implementation
* Hardware diagnostics dashboard
* Patient page layout refinement
* Pack details modal redesign
* Audit log deep linking
* Investigation workflow enhancements









# Current Roadmap Snapshot

---

## Current Phase

### Phase 7 — Smart Clinical Workstations

Purpose:
Transform SteriSphere from a web-based sterilization workflow app into a connected clinical infrastructure platform.

Completed foundation:

* Clinical Workstations architecture
* Clinical Hardware architecture
* Clinical Event architecture
* Operational Device Assignment model
* Clinic Setup Wizard architecture
* Engineering Principles documentation
* Persisted `clinical_workstations` table
* Read-only Settings Workstations UI
* Workstation display order foundation
* Development scanner selected and ordered

Current milestone:

* Phase 7.5 — Clinic Agent Registration

Upcoming milestones:

* Phase 7.6 — Hardware Discovery
* Phase 7.7 — Device Assignment
* Phase 7.8 — Clinical Workstation Sessions
* Phase 7.9 — USB Scanner Integration
* Phase 7.10 — Patient Traceability Automation