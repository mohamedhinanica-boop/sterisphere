# SteriSphere – Codex Context

## Project

SteriSphere is a sterilization traceability platform built for dental clinics.

Stack:

* Next.js
* TypeScript
* Supabase
* Tailwind CSS
* Vercel

---

## Documentation

Always review:

* PROJECT_MAP.md
* CODE_REFERENCE.md
* CHANGELOG_STERISPHERE.md
* REFRACTOR_ROADMAP.md

before major changes.

---

## Development Rules

1. Small safe changes only.
2. Run `npm run build` after every change.
3. Never commit automatically.
4. Provide changed files summary.
5. Preserve existing workflows whenever possible.
6. Prefer extending existing logic over rewriting.

---

## Current Phase

Phase 5 – Assistant Workstation and Tablet Experience

---

## Completed Major Areas

### Dashboard V2

* Operational alerts
* Open investigations
* Assistant awareness
* Clickable operational cards

### Investigation Workflow V2

* Lifecycle states
* Open / In Review / Closed
* Reopen governance
* Audit logs
* Root cause tracking
* Preventive actions
* Corrective actions
* Investigation checklist

### Reports V2

* Compliance Overview
* Compliance Analytics
* Root Cause Breakdown
* Failed Cycles by Sterilizer
* Tabbed layout

### Assistant Workstation

* Tablet-first layout
* Operational Center
* Bottom navigation
* Responsive design
* Running cycle awareness
* Pending reviews
* Human-friendly countdowns

### Guided Cycle Workflow

Route:

* /assistant/cycle/start

Status:

* Shell complete
* Auto-return implemented
* Backend integration pending

---

## Current Priorities

### High Priority

1. Guided Patient Traceability Workflow
2. Guided Cycle Workflow backend integration
3. Assistant workflow optimization
4. Tablet-first UX improvements

### Medium Priority

1. Live cycle command center
2. Running cycle completion workflow
3. Sound alerts
4. Kiosk mode foundations

### Future

1. Android application
2. PWA installation
3. Lock screen widgets
4. Connected sterilizers
5. AI workflow assistant

---

## User Experience Direction

Desktop:

* Management platform
* Reports
* Investigations
* Audit logs
* Settings

Tablet:

* Assistant workstation
* Guided workflows
* Large touch targets
* Minimal navigation

Future Android:

* Dedicated workstation experience
* Fullscreen operation
* Kiosk mode support

---

## Important Principle

Do not optimize for desktop first.

For assistant workflows:

* Tablet experience comes first.
* Desktop compatibility comes second.

---

## Build Verification

Required after changes:

npm run build

Do not consider work complete until build passes.
