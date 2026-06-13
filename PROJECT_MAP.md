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

## Current Known Improvements

* Patient page layout refinement
* Pack details modal redesign
* Audit log deep linking
* Investigation workflow enhancements
* Label printer integration
* Cycle capacity enforcement
