Detailed technical reference for each page, section, function, component, and workflow.

CODE_REFERENCE.md

1. Dashboard
   - File paths
   - Data loading functions
   - Components used
   - Dashboard counts
   - Alerts logic
   - Assistant widget logic

2. Packs
   - File paths
   - Pack inventory logic
   - Filters
   - Pack details modal
   - Label printing
   - Expired review workflow

3. Patients / Traceability
   - Patient search
   - Pack validation
   - Trace creation
   - Filters/export
   - Pack → trace navigation

4. Cycles
   - Cycle creation
   - Pass/fail logic
   - Auto pack generation
   - Cycle closure

5. Investigation
   - Failed cycle lookup
   - Affected packs
   - Affected traces
   - Risk level logic

6. Audit Logs
   - Filters
   - Export
   - Metadata viewer

7. AppShell / RBAC
   - Route protection
   - Sidebar
   - SteriAssistantWidget

8. Supabase Tables
   - Table purpose
   - Important fields
   - Relationships

   
   ## Packs Page — app/packs/page.tsx
   # CODE_REFERENCE — Packs Page

## Page

**File:** `app/packs/page.tsx`

**Route:** `/packs`

**Purpose:**
The Packs page manages the sterilized pack inventory. It displays all generated packs, calculates their effective lifecycle status, supports filtering/searching, opens pack details, shows QR codes, handles label preview/printing, and supports expired-pack review acknowledgement.

---

# 1. Related Files and Components

## Direct imports

### `@/lib/supabase`

Used for all Supabase reads and updates on:

* `packs`
* `cycles`
* `patient_traces`
* auth user lookup for expired pack review

---

### `@/lib/audit`

Uses:

```ts
createAuditLog()
```

Used to record:

* label printed
* expired pack reviewed

---

### `@/lib/modules/packs`

Imported helpers/types:

```ts
CycleContext
Pack
formatInitials
formatLoadComposition
formatPackDate
formatPackDateTime
getPackEffectiveStatus
isPackExpiringSoon
```

Responsibilities:

* Determines effective pack status.
* Formats dates.
* Formats load composition.
* Formats operator/released-by initials.
* Determines expiring-soon packs.

Important dependency:
This page relies heavily on `getPackEffectiveStatus(pack)` to avoid trusting the database `status` field alone.

---

### `@/lib/modules/labels/generateLabelData`

Used to transform a pack into label-ready data.

```ts
generateLabelData()
```

Used by:

* `selectedLabelData`
* `LabelPreviewModal`

---

### `qrcode.react`

Used for visual QR code rendering.

Components:

```tsx
QRCodeSVG
```

Used in:

* Pack inventory card
* Pack Details modal
* Label Preview modal
* Print label output

---

# 2. Local Types

## `PatientTrace`

```ts
type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  procedure: string;
  created_at: string | null;
  pack_id: string | null;
  pack_number: string;
};
```

Purpose:

Represents the patient traceability record linked to a pack.

Used inside:

```ts
PackDetailsModal
```

Main role:

* Show usage information if the pack has already been linked to a patient.
* Support Pack → Patient Traceability navigation.

---

## `ExtendedPack`

```ts
type ExtendedPack = Pack & {
  expired_reviewed?: boolean | null;
  expired_reviewed_at?: string | null;
  expired_reviewed_by?: string | null;
};
```

Purpose:

Extends the base `Pack` type with expired-pack review fields.

Used because the expired-pack review workflow added these columns:

```text
expired_reviewed
expired_reviewed_at
expired_reviewed_by
```

These fields are used to:

* Show `Needs Review` badge.
* Show `Reviewed` badge.
* Prevent reviewed expired packs from continuing to appear as dashboard alerts.
* Store review audit information.

---

# 3. Main Component

## `PacksPage`

```ts
export default function PacksPage()
```

This is the main route component for `/packs`.

It owns:

* Pack inventory state
* Filters
* Pagination
* Label preview modal state
* Pack details modal state
* Expired pack review workflow
* Pack loading and cycle enrichment

---

# 4. Main State

## `packs`

```ts
const [packs, setPacks] = useState<ExtendedPack[]>([]);
```

Stores all fetched packs, enriched with cycle details.

Includes:

* base pack data
* cycle context
* expired review fields

---

## `selectedLabelPack`

```ts
const [selectedLabelPack, setSelectedLabelPack] =
  useState<ExtendedPack | null>(null);
```

Controls whether the Label Preview modal is open.

When set:

* `selectedLabelData` is generated.
* `LabelPreviewModal` is displayed.

---

## `selectedDetailsPack`

```ts
const [selectedDetailsPack, setSelectedDetailsPack] =
  useState<ExtendedPack | null>(null);
```

Controls whether the Pack Details modal is open.

When a user clicks a pack card:

```ts
setSelectedDetailsPack(pack)
```

---

## `loading`

```ts
const [loading, setLoading] = useState(false);
```

Used for pack list refresh/loading state.

---

## `searchTerm`

```ts
const [searchTerm, setSearchTerm] = useState("");
```

Used by inventory search.

Searches across:

* pack number
* cycle number
* pack type
* contents
* status
* sterilizer
* operator
* released by

---

## `statusFilter`

```ts
const [statusFilter, setStatusFilter] = useState("All");
```

Controls status dropdown filtering.

Possible values:

```text
All
Available
Used
Expired
Expiring Soon
```

Also supports URL-driven filters.

---

## `currentPage`

```ts
const [currentPage, setCurrentPage] = useState(1);
```

Controls pagination.

Page size:

```ts
const itemsPerPage = 5;
```

---

# 5. Effects

## Initial pack load

```ts
useEffect(() => {
  fetchPacks();
}, []);
```

Runs once when the page loads.

Purpose:

* Load all packs.
* Load related cycle data.
* Enrich packs with cycle context.

---

## URL filter handling

```ts
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get("filter");

  if (filter === "expired") {
    setStatusFilter("Expired");
    setCurrentPage(1);
  }

  if (filter === "expiring-soon") {
    setStatusFilter("Expiring Soon");
    setCurrentPage(1);
  }
}, []);
```

Purpose:

Allows dashboard / assistant / alerts to deep-link to filtered pack views.

Examples:

```text
/packs?filter=expired
/packs?filter=expiring-soon
```

Related components:

* `OperationalAlerts.tsx`
* `SteriAssistantWidget.tsx`
* Dashboard page

---

# 6. Data Loading

## `fetchPacks`

```ts
async function fetchPacks()
```

Purpose:

Loads packs from Supabase and enriches each pack with cycle context.

### Step 1 — Load packs

Reads from:

```text
packs
```

Selects important fields:

* `id`
* `pack_number`
* `cycle_number`
* `pack_type`
* `contents`
* `status`
* `sterilized_at`
* `expires_at`
* `load_item_index`
* `load_item_total`
* `cycle_pack_total`
* `cycle_load_summary`
* `created_at`
* `expired_reviewed`
* `expired_reviewed_at`
* `expired_reviewed_by`

Important:
The expired review fields must remain in this query. If removed, reviewed expired packs will look like `Needs Review` again after refresh.

---

### Step 2 — Extract cycle numbers

```ts
const cycleNumbers = Array.from(
  new Set((packsData || []).map((pack) => pack.cycle_number))
);
```

Purpose:

Avoid duplicate cycle lookups.

---

### Step 3 — Load cycle context

Reads from:

```text
cycles
```

Selects:

* `cycle_number`
* `sterilizer`
* `operator`
* `released_by`
* `released_at`

Purpose:

Adds sterilization context to each pack card and modal.

---

### Step 4 — Enrich packs

```ts
const enrichedPacks = (packsData || []).map((pack) => ({
  ...pack,
  cycle: cyclesByNumber[pack.cycle_number] || null,
}));
```

Purpose:

Attaches cycle metadata to the pack object.

This is why the UI can display:

* sterilizer
* started by
* completed by
* completed at

---

# 7. Label Printing Workflow

## `openLabelPreview`

```ts
function openLabelPreview(pack: ExtendedPack)
```

Purpose:

Opens the label preview modal, but only if the pack is allowed to print.

Uses:

```ts
getPackEffectiveStatus(pack)
```

Rules:

### Used Pack

If effective status is `Used`:

```text
Printing blocked
```

Toast:

```text
This pack has already been used. Reprinting is blocked for now.
```

### Expired Pack

If effective status is `Expired`:

```text
Printing blocked
```

Toast:

```text
This pack is expired. Reprinting is blocked for now.
```

### Available Pack

If available:

```ts
setSelectedLabelPack(pack)
```

This opens the label preview.

---

## `selectedLabelData`

```ts
const selectedLabelData: LabelData | null = selectedLabelPack
  ? generateLabelData(...)
  : null;
```

Purpose:

Converts selected pack into label data.

Used by:

```tsx
<LabelPreviewModal />
```

---

## `printSelectedLabel`

```ts
async function printSelectedLabel()
```

Purpose:

Prints the selected label and creates an audit log.

Audit action:

```text
label_printed
```

Entity:

```text
pack
```

Metadata:

* pack number
* pack type
* expiry date

Then:

```ts
window.print()
```

Important:

The label print workflow is tightly tied to the CSS inside `LabelPreviewModal`.

Be careful when modifying print styles.

---

# 8. Expired Pack Review Workflow

## `markExpiredPackReviewed`

```ts
async function markExpiredPackReviewed(pack: ExtendedPack)
```

Purpose:

Marks an expired pack as reviewed, without changing its expired status.

This is an acknowledgement workflow.

The pack remains:

```text
Expired
```

but dashboard and assistant alerts stop counting it as requiring attention.

---

### Step 1 — Validate expired status

```ts
const effectiveStatus = getPackEffectiveStatus(pack);

if (effectiveStatus !== "Expired") {
  toast.error("Only expired packs can be marked as reviewed.");
  return;
}
```

Prevents non-expired packs from being marked reviewed.

---

### Step 2 — Get current user

```ts
const {
  data: { user },
} = await supabase.auth.getUser();
```

Used to store:

```text
expired_reviewed_by
```

Fallback:

```text
unknown
```

---

### Step 3 — Update Supabase

Updates:

```text
packs
```

Fields:

```text
expired_reviewed = true
expired_reviewed_at = reviewedAt
expired_reviewed_by = reviewedBy
```

Important requirement:

Supabase RLS must allow authenticated updates on `packs`.

Policy added:

```sql
create policy "Allow authenticated users to review expired packs"
on public.packs
for update
to authenticated
using (true)
with check (true);
```

Without this policy, the UI may appear to update locally but revert after refresh.

---

### Step 4 — Audit log

Creates audit log:

```text
expired_pack_reviewed
```

Entity:

```text
pack
```

Metadata:

* pack number
* reviewed by
* reviewed at

---

### Step 5 — Local UI update

Updates local state:

```ts
setPacks(...)
```

This makes the UI immediately show `Reviewed` without waiting for a full page refresh.

---

# 9. Derived Counts

The page calculates:

## `totalPacks`

All loaded packs.

## `availablePacks`

Effective status equals:

```text
Available
```

## `usedPacks`

Effective status equals:

```text
Used
```

## `expiredPacks`

Effective status equals:

```text
Expired
```

## `expiringSoonPacks`

Uses:

```ts
isPackExpiringSoon(pack)
```

Displayed in the inventory cards at the top.

Important:

These counts are local to the Packs page and are not the same as dashboard alert counts.

Dashboard alert counts only **unreviewed expired packs**.

---

# 10. Filtering and Search

## `filteredPacks`

Filters packs using:

* search term
* status dropdown
* effective status
* expiring soon logic

Search includes:

```text
pack_number
cycle_number
pack_type
contents
effectiveStatus
cycle.sterilizer
cycle.operator
cycle.released_by
```

Status filter logic:

```ts
statusFilter === "All" ||
effectiveStatus === statusFilter ||
(statusFilter === "Expiring Soon" && isPackExpiringSoon(pack))
```

---

# 11. Pagination

## `totalPages`

```ts
const totalPages = Math.ceil(filteredPacks.length / itemsPerPage);
```

## `paginatedPacks`

```ts
const paginatedPacks = filteredPacks.slice(...)
```

Current page size:

```text
5 packs per page
```

Pagination controls:

* Previous
* Next

---

# 12. Page Layout Sections

## Header

Displays:

```text
Pack Inventory
```

Subtitle:

```text
View, search, and track sterilized instrument packs generated from sterilization cycles.
```

---

## Inventory Cards

Component:

```tsx
<InventoryCard />
```

Cards:

* Total Packs
* Available
* Used
* Expired
* Expiring Soon

---

## Inventory List

Contains:

* Refresh button
* Status filter dropdown
* Search input
* Pack cards
* Pagination

---

# 13. Pack Card

Each pack card is clickable.

Click action:

```ts
setSelectedDetailsPack(pack)
```

This opens `PackDetailsModal`.

---

## Pack Card Displays

### Header

* pack number
* status badge
* needs review / reviewed badge
* expiring soon badge

### Pack body

* pack type
* load position
* cycle number
* cycle pack total
* load composition
* sterilization context
* sterilized date
* expiry date
* created date

### Right-side actions

* QR code
* Preview / Print Label
* Mark Reviewed button for expired unreviewed packs

---

## Expired badges

If expired and not reviewed:

```text
Needs Review
```

If expired and reviewed:

```text
Reviewed
```

---

## Mark Reviewed button

Shown only when:

```ts
effectiveStatus === "Expired" && !pack.expired_reviewed
```

Click behavior:

* stops card click propagation
* calls `markExpiredPackReviewed(pack)`

This avoids opening the modal when reviewing directly from the card.

---

# 14. Modal Rendering

## Pack Details Modal

Rendered when:

```ts
selectedDetailsPack
```

Component:

```tsx
<PackDetailsModal />
```

Receives:

* pack
* onClose
* onPrintLabel

Purpose:

Shows detailed pack information and usage information.

Current note:

The modal has had layout issues during recent experimentation. Keep it stable for now and avoid adding review actions inside it.

Preferred rule:

```text
Pack card = operational actions
Pack modal = detailed information
```

---

## Label Preview Modal

Rendered when:

```ts
selectedLabelPack && selectedLabelData
```

Component:

```tsx
<LabelPreviewModal />
```

Purpose:

* Show visual label preview
* Print physical 50mm × 30mm label
* Apply print-specific CSS

---

# 15. Helper Components

## `InventoryCard`

Displays the top metric cards.

Props:

```ts
title
value
good
danger
warning
```

Color logic:

* danger = red
* warning = orange
* good = green
* default = white/slate

---

## `StatusBadge`

Displays status badge:

* Available = green
* Used = slate
* Expired = red
* fallback = yellow

Depends on effective status text.

---

## `PackDetailsModal`

Purpose:

Detailed view of one pack.

Main sections:

* Pack identity
* Sterilization details
* Load information
* QR area
* Usage information
* footer actions

Also loads patient traceability data.

---

## `loadTrace`

Inside `PackDetailsModal`.

Searches `patient_traces` in two steps:

### First by `pack_id`

```ts
.eq("pack_id", pack.id)
```

Preferred because it is relationally safer.

### Fallback by `pack_number`

```ts
.eq("pack_number", pack.pack_number)
```

Supports legacy traces that may not have `pack_id`.

---

## `DetailRow`

Card-style detail row.

Used inside modal for larger detail cards.

---

## `CompactDetail`

Smaller label/value display.

Used inside modal sections.

---

## `LabelPreviewModal`

Purpose:

Handles label preview and printing.

Important print settings:

```css
@page {
  size: 50mm 30mm;
  margin: 0;
}
```

This modal includes both:

* on-screen preview
* hidden print area

The print area becomes visible only during printing.

---

# 16. Database Tables Used

## `packs`

Main table.

Important fields used by this page:

```text
id
pack_number
cycle_number
pack_type
contents
status
sterilized_at
expires_at
load_item_index
load_item_total
cycle_pack_total
cycle_load_summary
created_at
expired_reviewed
expired_reviewed_at
expired_reviewed_by
```

---

## `cycles`

Used to enrich packs.

Important fields:

```text
cycle_number
sterilizer
operator
released_by
released_at
```

---

## `patient_traces`

Used to show usage information.

Important fields:

```text
id
patient_name
provider
treatment_room
procedure
created_at
pack_id
pack_number
```

---

## `audit_logs`

Written indirectly through:

```ts
createAuditLog()
```

Actions:

```text
label_printed
expired_pack_reviewed
```

---

# 17. Related Workflows

## Dashboard → Expired Packs

Dashboard alert links to:

```text
/packs?filter=expired
```

Packs page reads URL and applies:

```text
Expired
```

filter.

---

## Dashboard / Assistant → Expired Pack Review

Dashboard and assistant should count only:

```text
expired packs where expired_reviewed is false or null
```

After review:

* pack remains expired
* alert disappears
* audit log is created

---

## Pack → Patient Traceability

If a pack has been used, modal shows:

```text
View Traceability Record
```

Navigation:

```text
/patients?traceId=<trace.id>
```

Patient page then highlights and scrolls to the trace.

---

## Pack → Label Printing

Available pack:

```text
Preview / Print Label
```

opens label preview.

Used or expired pack:

```text
Print blocked
```

---

# 18. Known Issues / Watch Areas

## Modal layout

The Pack Details modal is sensitive and became unstable during recent UI experiments.

Recommendation:

Do not add operational actions inside the modal for now.

Keep:

```text
Card = actions
Modal = details
```

Future polish should extract modal into:

```text
components/packs/PackDetailsModal.tsx
```

and redesign it cleanly.

---

## Large page file

This page currently contains:

* page logic
* inventory UI
* modal UI
* label printing UI
* helper components
* Supabase mutations

It is large and should eventually be split.

---

## Expired review depends on RLS

If review works locally but reverts after refresh, the likely cause is Supabase RLS blocking updates.

Required:

```text
authenticated users must be allowed to update expired_reviewed fields on packs
```

---

## Effective status vs database status

The UI uses:

```ts
getPackEffectiveStatus(pack)
```

This means a pack may display as expired even if the database `status` field is still `Available`.

This is intentional.

Avoid relying only on:

```text
pack.status
```

for lifecycle behavior.

---

# 19. Refactor Opportunities

## Recommended future folder structure

```text
components/packs/
  PackInventoryCard.tsx
  PackCard.tsx
  PackDetailsModal.tsx
  LabelPreviewModal.tsx
  StatusBadge.tsx
  CompactDetail.tsx

lib/modules/packs/
  fetchPacks.ts
  reviewExpiredPack.ts
  packFilters.ts
  packStatus.ts
```

---

## Suggested extraction order

### Step 1

Extract presentational components only:

* `InventoryCard`
* `StatusBadge`
* `CompactDetail`
* `DetailRow`

Low risk.

---

### Step 2

Extract `LabelPreviewModal`.

Medium risk because print CSS must remain intact.

---

### Step 3

Extract `PackDetailsModal`.

Medium/high risk because it uses:

* Supabase
* patient trace lookup
* navigation
* pack formatting helpers

---

### Step 4

Extract business functions:

* `fetchPacks`
* `markExpiredPackReviewed`
* `openLabelPreview`
* filtering helpers

Higher risk; should only be done after tests/build pass.

---

# 20. Recommended Comments To Add Later

Add section comments in the page:

```ts
// -----------------------------
// Types
// -----------------------------

// -----------------------------
// State
// -----------------------------

// -----------------------------
// Data Loading
// -----------------------------

// -----------------------------
// Label Printing
// -----------------------------

// -----------------------------
// Expired Pack Review
// -----------------------------

// -----------------------------
// Filtering and Pagination
// -----------------------------

// -----------------------------
// Render
// -----------------------------
```

Avoid over-commenting JSX details.

Comment business rules, not obvious UI.

---

# 21. Current Status

The Packs page is stable and functional.

Completed:

* Inventory display
* Status filtering
* URL-driven filters
* QR display
* Label preview and print
* Print blocked for used/expired packs
* Pack details modal
* Patient trace lookup
* View traceability record navigation
* Expired pack review acknowledgement
* Audit logging

Current recommendation:

Do not add new features to this page until it is split into smaller components or clearly sectioned.

components/dashboard/PerformanceStats.tsx



```text
## Dashboard Page — app/page.tsx
```

---

# Dashboard Page

## File

```text
app/page.tsx
```

## Route

```text
/
```

## Purpose

The Dashboard is the operational control center of SteriSphere.

It provides:

* Real-time sterilization overview
* Compliance monitoring
* Operational alerts
* Quick access to workflows
* Recent sterilization activity
* Failed cycle monitoring
* Pack inventory monitoring
* Patient traceability monitoring

This page does **not create data** itself.

Its primary responsibility is:

```text
Read data
Calculate operational metrics
Display operational status
Navigate users to action pages
```

---

# Related Components

## Dashboard Components

### FailedCyclesAlert

```text
components/dashboard/FailedCyclesAlert.tsx
```

Purpose:

Displays urgent failed cycle alerts.

Related page:

```text
/investigation
```

---

### DashboardStats

```text
components/dashboard/DashboardStats.tsx
```

Displays top statistic cards.

Cards:

* Total Cycles
* Pending Cycles
* Failed Cycles
* Available Packs
* Patient Records
* Total Packs
* Used Packs
* Expired Packs
* Expiring Soon

---

### OperationalAlerts

```text
components/dashboard/OperationalAlerts.tsx
```

Displays actionable alerts.

Examples:

* Failed cycles awaiting review
* Expired packs awaiting review
* Packs expiring soon
* Pending cycles
* Patient traces today
* Labels printed today

Related pages:

```text
/investigation
/packs
/cycles
/patient-history
```

---

### DashboardQuickActions

```text
components/dashboard/DashboardQuickActions.tsx
```

Contains quick-action buttons.

Currently includes:

```text
CycleWizard
```

---

### CycleWizard

```text
components/CycleWizard.tsx
```

Purpose:

Fast cycle creation workflow.

Related tables:

```text
cycles
packs
```

---

### LatestFailedCycles

```text
components/dashboard/LatestFailedCycles.tsx
```

Displays newest failed cycles.

Related page:

```text
/investigation
```

---

### RecentGeneratedPacks

```text
components/dashboard/RecentGeneratedPacks.tsx
```

Displays newest packs.

Related page:

```text
/packs
```

---

### LatestPatientTraceability

```text
components/dashboard/LatestPatientTraceability.tsx
```

Displays latest patient traces.

Related page:

```text
/patient-history
```

---

### RecentActivity

```text
components/dashboard/RecentActivity.tsx
```

Displays audit activity.

Related table:

```text
audit_logs
```

Related page:

```text
/audit-logs
```

---

### PerformanceStats

```text
components/dashboard/PerformanceStats.tsx
```

Displays:

* Open cycles
* Closed cycles

Used for operational performance monitoring.

---

# State Variables

## Refresh State

```ts
lastRefresh
```

Purpose:

Displays:

```text
Last updated: HH:MM:SS
```

Updated every refresh cycle.

---

## Activity State

```ts
recentActivity
```

Stores latest audit log entries.

Source:

```text
audit_logs
```

---

## Core Statistics

### cyclesCount

Total cycles.

Source:

```text
cycles
```

---

### packsCount

Total packs.

Source:

```text
packs
```

---

### patientRecordsCount

Total patient traces.

Source:

```text
patient_traces
```

---

### failedCyclesCount

Total failed cycles.

Source:

```text
cycles.status = Failed
```

---

### unreviewedFailedCyclesCount

Failed cycles not reviewed.

Logic:

```text
status = Failed
reviewed_at IS NULL
```

Used by:

* FailedCyclesAlert
* OperationalAlerts

---

### pendingCyclesCount

Cycles awaiting confirmation.

Logic:

```text
status = Pending
```

---

### openCyclesCount

Open sterilization cycles.

Logic:

```text
cycle_state = Open
```

---

### closedCyclesCount

Closed sterilization cycles.

Logic:

```text
cycle_state = Closed
```

---

# Pack Statistics

## availablePacksCount

Logic:

```text
status = Available
```

---

## usedPacksCount

Logic:

```text
status = Used
```

---

## expiredPacksCount

Logic:

```text
expires_at < now
status != Used
```

Important:

This includes reviewed and unreviewed expired packs.

Used for inventory visibility.

---

## unreviewedExpiredPacksCount

Logic:

```text
expires_at < now
status != Used
expired_reviewed IS NULL OR FALSE
```

Used for:

```text
Operational Alerts
```

Purpose:

Only packs still requiring attention.

---

## expiringSoonPacksCount

Logic:

```text
Expires within next 30 days
```

Used for proactive inventory review.

---

# Daily Metrics

## patientTracesTodayCount

Logic:

```text
created today
```

Source:

```text
patient_traces
```

Used by:

```text
Operational Alerts
```

---

## labelsPrintedTodayCount

Logic:

```text
audit_logs.action = label_printed
today
```

Used by:

```text
Operational Alerts
```

---

# Dashboard Data Loading

## Function

```ts
fetchDashboardData()
```

This is the most important function on the page.

Purpose:

Loads every dashboard metric.

---

# Data Sources

## cycles

Used for:

* total cycles
* failed cycles
* pending cycles
* open cycles
* closed cycles

---

## packs

Used for:

* total packs
* available packs
* used packs
* expired packs
* expiring packs

---

## patient_traces

Used for:

* total patient records
* traces today
* recent traces

---

## audit_logs

Used for:

* recent activity
* labels printed today

---

# Auto Refresh

Dashboard automatically refreshes every:

```ts
60000 ms
```

Equivalent:

```text
60 seconds
```

Implementation:

```ts
setInterval(fetchDashboardData, 60000)
```

Cleanup:

```ts
clearInterval(interval)
```

---

# Latest Data Widgets

## Latest Failed Cycles

Query:

```ts
limit(3)
```

Displays:

Most recent failed cycles.

---

## Latest Patient Records

Query:

```ts
limit(3)
```

Displays:

Most recent traceability records.

---

## Recent Generated Packs

Query:

```ts
limit(5)
```

Displays:

Newest packs.

---

## Recent Activity

Query:

```ts
limit(5)
```

Displays:

Newest audit events.

---

# Cross-Page Dependencies

Dashboard is connected to almost every page.

```text
Dashboard
│
├── Cycles
├── Packs
├── Patients
├── Patient History
├── Investigation
├── Audit Logs
└── Steri Assistant
```

Any major workflow change usually requires dashboard updates.

---

# Known Improvements

## Priority 1

Make dashboard cards clickable.

Examples:

```text
Failed Cycles → Investigation
Available Packs → Packs
Patient Records → Patient History
```

---

## Priority 2

Deep-link alerts.

Examples:

```text
Expired Packs
→ /packs?filter=expired

Expiring Soon
→ /packs?filter=expiring-soon
```

---

## Priority 3

Replace polling with realtime subscriptions.

Current:

```text
Refresh every 60 seconds
```

Future:

```text
Supabase realtime
```

---

## Priority 4

Add compliance widget.

Potential future card:

```text
Compliance Score
```

Based on:

* failed cycles
* unreviewed failures
* expired packs
* traceability completeness

---

This page is much smaller than Packs, but it is actually **more important architecturally**, because it aggregates data from almost every SteriSphere module.

```text
app/patients/import/page.tsx
```
## Patient Import Page — app/patients/import/page.tsx

### Route

`/patients/import`

### Purpose

This page imports patient records into SteriSphere from a CSV file.

It is used mainly for initial patient database setup or clinic software migration.

---

## Main Workflow

```text
Upload CSV
→ Parse file
→ Validate required fields
→ Preview patient rows
→ Skip duplicate external_id records
→ Insert new patients
→ Show success or warning message
```

---

## Related Table

### patients

Fields imported:

```text
external_id
full_name
date_of_birth
source_system
```

---

## Related Libraries

### PapaParse

Used to parse CSV files in the browser.

```ts
Papa.parse<PatientRow>(file, ...)
```

### Supabase

Used to:

* Check existing patients by `external_id`
* Insert new patient rows into `patients`

---

## Local Type

### PatientRow

Represents one CSV patient row.

```ts
type PatientRow = {
  external_id?: string | null;
  full_name: string;
  date_of_birth?: string | null;
  source_system?: string | null;
};
```

---

## Main State

### rows

Stores parsed and validated CSV rows before import.

```ts
const [rows, setRows] = useState<PatientRow[]>([]);
```

---

### errors

Stores CSV parsing or validation errors.

```ts
const [errors, setErrors] = useState<string[]>([]);
```

---

### loading

Used while importing patients.

```ts
const [loading, setLoading] = useState(false);
```

---

### success

Stores success or warning message after import.

```ts
const [success, setSuccess] = useState("");
```

---

### messageType

Controls whether the final message is green or yellow.

```ts
const [messageType, setMessageType] = useState<"success" | "warning">("success");
```

Used when:

* All patients imported successfully → success
* Some or all patients skipped as duplicates → warning

---

## Function: handleFileUpload

```ts
function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>)
```

### Purpose

Handles CSV file selection and parsing.

### Steps

1. Reads selected file.
2. Resets errors and success messages.
3. Uses PapaParse to parse CSV rows.
4. Removes empty rows.
5. Trims text values.
6. Defaults `source_system` to `CSV Import`.
7. Validates that `full_name` exists.
8. Stores valid rows for preview.

### Validation Rule

Required:

```text
full_name
```

Optional:

```text
external_id
date_of_birth
source_system
```

### Date Rule

The page tells users to use:

```text
YYYY-MM-DD
```

This is important because Supabase/Postgres may reject dates like:

```text
22-04-1985
```

---

## Function: importPatients

```ts
async function importPatients()
```

### Purpose

Imports the validated CSV rows into Supabase.

### Step 1 — Stop if no rows

```ts
if (rows.length === 0) return;
```

---

### Step 2 — Collect external IDs

```ts
const externalIds = rows
  .filter((row) => row.external_id)
  .map((row) => row.external_id as string);
```

Purpose:

Used for duplicate detection.

---

### Step 3 — Check existing patients

Queries:

```text
patients
```

By:

```text
external_id
```

Purpose:

Avoid duplicate patient imports.

---

### Step 4 — Build duplicate set

```ts
existingExternalIds = new Set(...)
```

Used to quickly filter rows already present in the database.

---

### Step 5 — Filter rows to import

```ts
const rowsToImport = rows.filter(
  (row) => !row.external_id || !existingExternalIds.has(row.external_id)
);
```

Important behavior:

* Rows with existing `external_id` are skipped.
* Rows without `external_id` are allowed.

---

### Step 6 — Handle all duplicates

If all rows are duplicates:

```text
No new patients imported. X duplicate patient(s) skipped.
```

Message type:

```text
warning
```

---

### Step 7 — Insert new patients

```ts
supabase.from("patients").insert(rowsToImport)
```

If successful:

```text
X patient(s) imported successfully. Y duplicate patient(s) skipped.
```

---

## UI Sections

### Page Header

Displays:

```text
Import Patients
Upload a CSV file to import patients into SteriSphere.
```

---

### CSV Upload Card

Contains:

* File input
* Required format example
* Date format warning
* Source system examples

Expected CSV format:

```csv
external_id,full_name,date_of_birth,source_system
12345,John Smith,1980-01-15,Dentitek
```

---

### Error Box

Displayed when:

```ts
errors.length > 0
```

Shows:

* parsing errors
* missing full_name validation errors
* Supabase errors

---

### Success / Warning Box

Displayed when:

```ts
success
```

Green if full success.

Yellow if duplicate rows were skipped.

---

### Preview Table

Displayed when:

```ts
rows.length > 0
```

Shows parsed rows before import.

Columns:

* External ID
* Full name
* Date of birth
* Source

Includes:

```text
Import Patients
```

button.

---

## Important Business Rules

### Duplicate Prevention

The page prevents duplicates based on:

```text
external_id
```

If two patients have the same external ID, the already-existing one is skipped.

---

### Patient Name Required

The only required CSV field is:

```text
full_name
```

This prevents incomplete patient records.

---

### Source System Tracking

Each row can include:

```text
Dentitek
ABELDent
AD2000
Progident
Manual
CSV Import
```

This helps identify where patient data came from.

---

## Related Pages

### Patient Traceability

`app/patients/page.tsx`

Uses imported patients for patient search and trace creation.

---

### Patient History

`app/patient-history/page.tsx`

Displays existing traceability/patient history records.

---

## Related Workflows

### CSV Import → Patient Traceability

```text
Import patients
→ Search patient on Patient Traceability page
→ Assign pack to patient
→ Create traceability record
```

---

## Known Risks

### Date format errors

Postgres expects a valid date format.

Recommended:

```text
YYYY-MM-DD
```

Avoid:

```text
DD-MM-YYYY
MM/DD/YYYY
```

---

### Duplicate patients without external_id

Rows without `external_id` are always imported because they cannot be checked for duplicates by external ID.

Future improvement:

Add optional duplicate detection by:

```text
full_name + date_of_birth
```

---

### No audit log yet

Currently, this page does not appear to create an audit log for patient imports.

Future improvement:

Add audit event:

```text
patients_imported
```

Metadata:

```text
imported_count
skipped_count
source_system
```

---

## Refactor Opportunities

### Extract CSV parsing

Move CSV parsing logic to:

```text
lib/modules/patients/importPatientsCsv.ts
```

---

### Extract duplicate detection

Move duplicate checking to:

```text
lib/modules/patients/checkDuplicatePatients.ts
```

---

### Add audit logging

Add:

```ts
createAuditLog({
  action: "patients_imported",
  entityType: "patient",
  ...
})
```

---

### Improve validation

Future validation could include:

* invalid date format
* missing external ID warning
* duplicate rows inside the CSV file itself
* source system normalization

---

## Current Status

The Patient Import page is stable and functional.

Completed:

* CSV upload
* CSV parsing
* required full_name validation
* duplicate external_id skipping
* preview table
* success/warning messages
* Supabase insert

Recommended next improvement:

Add audit logging for patient imports.

## Patient Traceability Page — app/patients/page.tsx

## Patient Traceability Page — app/patients/page.tsx

### Route

`/patients`

### Purpose

This page is the core traceability workflow of SteriSphere.

It links:

```text
Patient
→ Provider
→ Procedure
→ Treatment Room
→ Sterilized Pack
→ Traceability Record
```

This page is the final compliance step proving which sterilized pack was used for a specific patient procedure.

---

## Related Tables

### patients

Imported patient database.

Used for:

* Patient search
* Patient selection
* Patient identification

---

### packs

Provides available sterilized packs.

Used for:

* Pack assignment
* QR scan selection
* Validation before use

---

### patient_traces

Stores the actual traceability records.

Created by:

```ts
saveTrace()
```

---

### providers

Provides provider dropdown options.

Loaded by:

```ts
fetchProviders()
```

---

### audit_logs

Used through:

```ts
createAuditLog()
```

to record traceability actions.

---

## Main Functions

### fetchPatients()

Loads patient database.

Used for:

* Search
* Manual selection
* Patient lookup

---

### fetchPacks()

Loads available packs.

Used for:

* Pack dropdown
* QR workflow

Important:

Only valid packs should be available for assignment.

---

### fetchTraces()

Loads existing traceability records.

Used for:

* Recent traceability list
* Pagination
* Filters
* Exports

---

### fetchProviders()

Loads provider list.

Source:

```ts
getProviders()
```

---

### validatePackBeforeUse()

Critical compliance function.

Purpose:

Prevents assignment of:

```text
Used packs
Expired packs
Invalid packs
```

This is one of the most important safety functions in SteriSphere.

---

### saveTrace()

Creates a patient traceability record.

Workflow:

```text
Validate Patient
→ Validate Pack
→ Validate Provider
→ Insert patient_trace
→ Mark pack as used
→ Create audit log
→ Refresh trace list
```

This function is the heart of the page.

---

### exportFilteredCsv()

Exports filtered traceability records.

Supports:

* Provider filtering
* Date filtering
* Search filtering

Output:

```text
CSV
```

Used for:

* Compliance reviews
* Internal audits
* Investigation support

---

### clearFilters()

Resets all active filters.

---

### selectPatient()

Loads selected patient into traceability form.

---

## Utility Functions

### updateForm()

Generic form state updater.

### updateFilter()

Generic filter state updater.

### isTraceWithinDateRange()

Determines if a trace falls within selected export range.

### buildExportFileName()

Generates export filenames.

### escapeCsvValue()

CSV-safe formatting.

### formatDate()

UI date formatting.

### formatDateTime()

UI datetime formatting.

### slugify()

Used for export naming.

---

## Major Page Sections

### Traceability Entry Form

Purpose:

Create new patient traceability records.

Contains:

* Patient
* Provider
* Procedure
* Room
* Pack Number

---

### Selected Pack Preview

Displays selected pack information before assignment.

Purpose:

Operator verification before saving.

---

### Traceability Summary Panel

Displays:

* Total traces
* Today's traces
* Provider counts
* Other operational statistics

(Current layout may require future visual refinement.)

---

### Recent Traceability Records

Displays latest patient trace records.

Supports:

* Pagination
* Search
* Filtering

---

### CSV Export Area

Exports current filtered results.

Used by:

* Audits
* Investigations
* Compliance reviews

---

## Cross-Page Integrations

### Packs → Patients

Pack Details modal:

```text
View Traceability Record
```

navigates to:

```text
/ patients ? traceId=<id>
```

Patient page then highlights the selected trace.

---

### Dashboard → Patient Traces Today

Dashboard alert:

```text
Patient Traces Today
```

navigates to patient traceability records.

---

### Investigation → Patient Traces

Failed cycle investigations may display affected traces originating from this page.

---

## Business Importance

This page provides:

```text
Sterilization Compliance Proof
```

Without traceability records, SteriSphere cannot prove:

* Which patient received which pack
* Which provider performed the procedure
* Which sterilization cycle was involved

This page is therefore one of the most critical compliance pages in the entire application.

---

## Refactor Opportunities

Future component extraction:

```text
components/patients/
  TraceabilityForm.tsx
  SelectedPackPreview.tsx
  TraceSummaryPanel.tsx
  TraceTable.tsx
  TraceFilters.tsx
```

Business logic extraction:

```text
lib/modules/traceability/
  saveTrace.ts
  validatePackBeforeUse.ts
  exportTracesCsv.ts
  fetchProviders.ts
```

---

## Current Status

Implemented:

* Patient search
* Provider dropdown
* Pack assignment
* QR workflow
* Trace creation
* Pack validation
* CSV export
* Date filtering
* Provider filtering
* Trace highlighting from Pack Details

Known future improvements:

* Layout refinement
* Advanced exports
* Additional audit metadata
* Enhanced provider matching
* Better summary panel responsiveness

## Cycles Page — app/cycles/page.tsx

## Cycles Page — app/cycles/page.tsx

### Route

`/cycles`

### Purpose

The Cycles page manages sterilization cycle creation, monitoring, review, and release.

This page is the beginning of the sterilization workflow.

Workflow:

```text
Start Cycle
→ Run Sterilizer
→ Review Cycle
→ Pass / Fail
→ Generate Packs
→ Patient Traceability
```

Every sterilized pack in SteriSphere originates from a cycle created here.

---

## Related Tables

### cycles

Primary table.

Stores:

```text
cycle_number
sterilizer
operator
status
cycle_state
load_contents
released_by
released_at
reviewed_at
```

---

### sterilizers

Stores available sterilizer machines.

Used for:

```text
Start Cycle form
```

---

### packs

Created from successful cycle review.

Relationship:

```text
Cycle
→ Generates Packs
```

---

### audit_logs

Used through cycle services.

Records:

```text
cycle_created
cycle_reviewed
cycle_failed
cycle_closed
```

---

## Related Modules

### lib/modules/cycles

Provides business logic.

Functions:

```ts
calculateExpectedPackCount()
createCycle()
reviewCycle()
```

Purpose:

Keeps cycle business rules outside the page.

---

## Related Components

### PageHeader

Displays page title and summary.

---

### StartCycleForm

Used to create a new cycle.

Contains:

```text
Sterilizer
Operator
Load Contents
```

---

### RunningCyclesSection

Displays cycles currently in progress.

Purpose:

Monitor active sterilization work.

---

### SavedCyclesSection

Displays completed cycles.

Purpose:

Review historical sterilization records.

---

## Main State

### cycles

Stores all cycle records loaded from Supabase.

---

### sterilizers

Stores available sterilizer list.

---

### cycleCounter

Used for generating the next cycle number.

Format:

```text
STERI-YYYY-0001
```

---

### loading

Controls data-loading state.

---

### searchTerm

Used for cycle searching.

Searches:

```text
Cycle Number
Sterilizer
Operator
Status
```

---

### statusFilter

Filters:

```text
All
Pending
Passed
Failed
```

---

### stateFilter

Filters:

```text
All
Open
Closed
```

---

### currentPage

Pagination state.

---

### now

Current timestamp.

Used for:

```text
Running cycle duration
Cycle age calculations
```

---

## Core Functions

### fetchCycles()

Loads cycles from Supabase.

Purpose:

Populate:

```text
Running Cycles
Saved Cycles
Statistics
```

---

### fetchSterilizers()

Loads available sterilizer devices.

Used by:

```text
StartCycleForm
```

---

### createCycle()

Creates new cycle.

Workflow:

```text
Validate Form
→ Generate Cycle Number
→ Save Cycle
→ Audit Log
→ Refresh List
```

---

### reviewCycle()

Reviews cycle result.

Possible outcomes:

```text
Passed
Failed
```

---

## Cycle Lifecycle

### Open Cycle

State:

```text
Open
```

Cycle is still active.

Can be reviewed.

---

### Passed Cycle

Status:

```text
Passed
```

Can generate packs.

---

### Failed Cycle

Status:

```text
Failed
```

Triggers:

```text
Investigation workflow
```

Related page:

```text
/investigation
```

---

### Closed Cycle

State:

```text
Closed
```

Cycle is complete and locked.

---

## Pack Generation Relationship

Only passed cycles should generate packs.

Relationship:

```text
Cycle
→ Review Passed
→ Packs Created
```

Future enhancement:

```text
Cycle Capacity Enforcement
```

to prevent additional packs after cycle capacity reached.

---

## Filtering

Supports:

### Search

Searches:

```text
Cycle Number
Sterilizer
Operator
Status
```

---

### Status Filter

```text
Pending
Passed
Failed
```

---

### State Filter

```text
Open
Closed
```

---

## Pagination

Current page size:

```text
5 records per page
```

Used by:

```text
SavedCyclesSection
```

---

## Cross-Page Integrations

### Investigation

Failed cycles appear in:

```text
/investigation
```

---

### Packs

Passed cycles generate packs.

```text
/packs
```

---

### Dashboard

Dashboard statistics depend heavily on cycle data.

Used for:

```text
Pending Cycles
Failed Cycles
Open Cycles
Closed Cycles
```

---

## Business Importance

This page is the starting point of all sterilization traceability.

Without a cycle:

```text
No Packs
No Patient Traceability
No Compliance Chain
```

The cycle is therefore the root object of the SteriSphere workflow.

---

## Current Status

Implemented:

* Cycle creation
* Sterilizer selection
* Running cycles
* Cycle review
* Passed / Failed workflow
* Pagination
* Filtering
* Dashboard integration

---

## Refactor Status

Current status:

```text
Good
```

Compared to Packs and Patients, the Cycles page already uses:

```text
lib/modules/cycles
components/cycles
```

and is one of the cleanest pages in the application.

Future improvements should continue following this architecture.

## Investigation Page — app/investigation/page.tsx

### Route

`/investigation`

### Purpose

The Investigation page is SteriSphere's compliance and risk-management center.

Its role is to investigate failed sterilization cycles and determine:

```text
Failed Cycle
→ Affected Packs
→ Affected Patient Traces
→ Providers Involved
→ Risk Assessment
→ Corrective Actions
→ Review Completion
```

This page is used when a sterilization cycle fails and staff must determine whether patient exposure occurred.

---

## Related Tables

### cycles

Source of failed cycle records.

Important fields:

```text
cycle_number
status
reviewed_at
reviewed_by
```

---

### packs

Used to identify packs generated from the failed cycle.

Important fields:

```text
pack_number
cycle_number
pack_type
created_at
```

---

### patient_traces

Used to determine whether packs from a failed cycle were assigned to patients.

Important fields:

```text
patient_name
provider
procedure
treatment_room
pack_number
created_at
```

---

### audit_logs

Used indirectly through investigation actions.

Records:

```text
cycle_reviewed
investigation_review_completed
```

---

## Related Module

### lib/modules/investigation

Provides business logic for investigations.

Functions imported:

```ts
getFailedCycles()
getInvestigationData()
markCycleAsReviewed()
```

Formatting helpers:

```ts
formatDate()
formatDateTime()
formatInitials()
```

Types:

```ts
FailedCycle
InvestigationCycle
InvestigationPack
InvestigationPatientTrace
InvestigationLoadItem
```

---

## Main State

### cycleNumber

Stores the selected cycle number.

Used when opening an investigation.

---

### failedCycles

List of all failed cycles available for review.

Loaded from:

```ts
getFailedCycles()
```

---

### selectedCycle

Stores the currently investigated cycle.

Type:

```ts
InvestigationCycle
```

---

### affectedPacks

Stores packs linked to the failed cycle.

---

### affectedPatientTraces

Stores patient traceability records connected to those packs.

---

### providersInvolved

Derived from patient traces.

Purpose:

Identify providers who used packs originating from the failed cycle.

---

### riskLevel

Calculated investigation risk.

Possible values:

```text
Low
Medium
High
Critical
```

---

### loading

Used while investigation data loads.

---

### reviewing

Used while marking a cycle investigation as completed.

---

## Core Functions

### loadFailedCycles()

Loads all failed cycles.

Purpose:

Populate investigation selector.

Source:

```ts
getFailedCycles()
```

---

### loadInvestigation()

Loads investigation details for selected cycle.

Source:

```ts
getInvestigationData(cycleNumber)
```

Returns:

```text
Cycle
Affected Packs
Affected Traces
Load Composition
Risk Data
```

---

### markCycleAsReviewed()

Marks investigation as completed.

Purpose:

Remove cycle from "needs review" workflow.

Updates:

```text
reviewed_at
reviewed_by
```

Creates audit log.

---

## Investigation Workflow

### Step 1

Failed cycle detected.

Source:

```text
cycles.status = Failed
```

---

### Step 2

Cycle appears:

```text
Dashboard
Operational Alerts
Failed Cycles Alert
Investigation Page
```

---

### Step 3

User opens investigation.

Cycle information loaded.

---

### Step 4

Affected packs identified.

Relationship:

```text
Cycle
→ Packs
```

---

### Step 5

Patient exposure determined.

Relationship:

```text
Cycle
→ Packs
→ Patient Traces
```

---

### Step 6

Providers identified.

Relationship:

```text
Patient Traces
→ Provider
```

---

### Step 7

Risk level calculated.

---

### Step 8

Corrective actions documented.

---

### Step 9

Investigation reviewed and closed.

---

## Major Page Sections

### Failed Cycle Selector

Allows choosing failed cycle.

Source:

```ts
failedCycles
```

---

### Investigation Snapshot

Displays high-level information:

```text
Cycle Number
Sterilizer
Operator
Review Status
Failure Date
```

Purpose:

Quick cycle overview.

---

### Risk Level Review

Displays calculated risk level.

Examples:

```text
Low
Medium
High
Critical
```

Purpose:

Help determine urgency.

---

### Affected Packs

Displays all packs originating from failed cycle.

Information:

```text
Pack Number
Pack Type
Creation Date
```

Purpose:

Identify inventory impact.

---

### Patient Exposure

Displays all patient traces linked to affected packs.

Information:

```text
Patient
Provider
Procedure
Room
Date Used
```

Purpose:

Determine real-world impact.

---

### Providers Involved

Displays providers connected to affected traces.

Purpose:

Identify staff involved in affected procedures.

---

### Corrective Action Notes

Purpose:

Record investigation findings and actions.

Examples:

```text
Pack recall
Staff retraining
Sterilizer maintenance
Biological test review
```

Future improvement:

Persist notes to database.

---

### Investigation Checklist

Purpose:

Ensure investigation completeness.

Examples:

```text
Affected packs reviewed
Patient exposure reviewed
Provider review completed
Corrective action documented
```

Future improvement:

Persist checklist state.

---

### Review Completion

Allows marking investigation complete.

Function:

```ts
markCycleAsReviewed()
```

Result:

Cycle removed from "needs review" workflows.

---

## Risk Assessment Logic

Current risk level depends on:

```text
Affected Packs
Affected Patient Traces
Patient Exposure
```

General interpretation:

### Low

No packs used.

### Medium

Packs generated but no patient exposure.

### High

Patient exposure occurred.

### Critical

Multiple exposed patients and providers.

---

## Cross-Page Integrations

### Dashboard

Failed cycle alerts.

---

### Cycles

Failed cycles originate from:

```text
/ cycles
```

---

### Packs

Affected packs displayed.

---

### Patient Traceability

Affected traces displayed.

---

### Audit Logs

Investigation actions recorded.

---

## Business Importance

This page is the highest-risk compliance page in SteriSphere.

It provides evidence that failed sterilization events were:

```text
Detected
Investigated
Documented
Reviewed
Closed
```

Without this page, failed cycles would not have a documented corrective-action workflow.

---

## Current Status

Implemented:

* Failed cycle lookup
* Investigation loading
* Affected pack analysis
* Patient exposure analysis
* Provider involvement
* Risk review
* Investigation completion

---

## Known Improvements

### Persist corrective action notes

Currently operational only.

Future:

```text
investigation_notes
```

database storage.

---

### Persist checklist items

Currently temporary.

Future:

```text
investigation_checklist
```

database storage.

---

### Investigation timeline

Future section:

```text
Failure
Review
Actions
Closure
```

---

### PDF Investigation Report

Future enhancement:

```text
Export Investigation Report
```

for regulatory compliance.

---

## Refactor Status

Current status:

```text
Good
```

Business logic already separated into:

```text
lib/modules/investigation
```

Future extraction:

```text
components/investigation/
  InvestigationSnapshot.tsx
  RiskReviewCard.tsx
  AffectedPacks.tsx
  PatientExposure.tsx
  CorrectiveActions.tsx
```

This page is already following the same architecture direction as the Cycles module.

## Audit Logs Page — app/audit-logs/page.tsx

### Route

`/audit-logs`

### Purpose

The Audit Logs page is the compliance history center of SteriSphere.

It records and displays operational events occurring throughout the application.

Workflow:

```text
Cycle Action
→ Pack Action
→ Patient Traceability Action
→ Investigation Action
→ Audit Log
```

This page allows administrators and auditors to review historical system activity.

---

## Related Tables

### audit_logs

Primary table.

Stores:

```text
id
action
entity_type
entity_id
description
user_email
metadata
created_at
```

Every record in this page originates from this table.

---

## Related Modules

### createAuditLog()

Imported indirectly throughout the application.

Used by:

```text
Cycles
Packs
Patients
Investigation
Settings
```

Purpose:

Create immutable compliance records.

---

## Local Types

### AuditLog

Represents one audit record.

Fields:

```text
id
action
entity_type
entity_id
description
user_email
metadata
created_at
```

---

### AuditFilters

Stores date filtering values.

Fields:

```text
dateFrom
dateTo
```

Used for export and filtering.

---

## Main State

### logs

Stores loaded audit log records.

```ts
const [logs, setLogs] = useState<AuditLog[]>([]);
```

---

### loading

Controls loading state.

---

### exporting

Controls CSV export state.

---

### searchTerm

Global text search.

Searches:

```text
action
entity_type
entity_id
description
user_email
```

---

### actionFilter

Filters by audit action.

Examples:

```text
cycle_created
cycle_reviewed
label_printed
expired_pack_reviewed
patient_trace_created
```

---

### entityFilter

Filters by entity type.

Examples:

```text
cycle
pack
patient
trace
investigation
```

---

### currentPage

Pagination state.

Page size:

```text
10 records
```

---

### filters

Stores:

```text
dateFrom
dateTo
```

Used by:

* Filtering
* Export

---

## Core Functions

### fetchAuditLogs()

Loads audit records from Supabase.

Query:

```text
audit_logs
```

Order:

```text
created_at DESC
```

Purpose:

Populate page records.

Current limit:

```text
300
```

---

### exportAuditLogs()

Exports filtered audit records.

Purpose:

Generate compliance review files.

Includes:

```text
Date
Action
Entity Type
Entity ID
Description
User
```

Supports:

* Search filter
* Action filter
* Entity filter
* Date range filter

Output:

```text
CSV
```

---

## Derived Data

### actionOptions

Built dynamically from loaded audit records.

Purpose:

Populate Action dropdown.

Example:

```text
All
cycle_created
cycle_reviewed
label_printed
expired_pack_reviewed
```

---

### entityOptions

Built dynamically from loaded audit records.

Purpose:

Populate Entity dropdown.

Example:

```text
All
cycle
pack
patient
trace
```

---

### filteredLogs

Main filtering engine.

Applies:

```text
Search
Action Filter
Entity Filter
Date Range
```

before pagination.

---

### totalPages

Pagination calculation.

---

### paginatedLogs

Visible page records.

---

## Badge System

### getActionBadgeClass()

Determines badge color.

Rules:

#### Created

```text
Green
```

Examples:

```text
cycle_created
patient_created
```

---

#### Failed

```text
Red
```

Examples:

```text
cycle_failed
pack_deactivated
```

---

#### Updated / Reviewed

```text
Blue
```

Examples:

```text
cycle_reviewed
expired_pack_reviewed
```

---

#### Closed / Used

```text
Gray
```

Examples:

```text
cycle_closed
pack_used
```

---

#### Default

```text
Yellow
```

Fallback category.

---

## Major Page Sections

### Header

Displays:

```text
Audit Logs
Review system activity, user actions, and traceability events.
```

---

### Filters Section

Contains:

#### Action Filter

Dropdown built dynamically.

---

#### Entity Filter

Dropdown built dynamically.

---

#### Search Input

Searches:

```text
Action
Entity
Description
User
```

---

#### Date Filters

Fields:

```text
From
To
```

Used for filtering and export.

---

#### Refresh Button

Calls:

```ts
fetchAuditLogs()
```

Purpose:

Reload latest audit records.

---

### Export Section

Exports currently filtered records.

Output:

```text
CSV
```

Purpose:

Compliance review.

---

### Audit Records List

Displays:

```text
Action Badge
Entity Badge
Description
User
Timestamp
```

Optional:

```text
Entity ID
```

---

### Pagination

Controls:

```text
Previous
Next
```

Page size:

```text
10
```

---

## Cross-Page Integrations

### Cycles

Creates records such as:

```text
cycle_created
cycle_reviewed
cycle_failed
cycle_closed
```

---

### Packs

Creates records such as:

```text
label_printed
expired_pack_reviewed
pack_used
```

---

### Patients

Creates records such as:

```text
patient_trace_created
patient_imported
```

(future import audit recommended)

---

### Investigation

Creates records such as:

```text
investigation_review_completed
```

---

### Settings

Future settings changes should create audit events.

---

## Compliance Importance

This page is SteriSphere's evidence repository.

It proves:

```text
Who performed an action
What was changed
When it happened
Which entity was affected
```

Without audit logs:

```text
No historical accountability
No regulatory traceability
No investigation evidence
```

---

## Known Improvements

### Deep Linking

Future:

```text
Click Audit Log
→ Open Related Cycle
→ Open Related Pack
→ Open Related Trace
```

Based on:

```text
entity_type
entity_id
```

---

### Metadata Viewer

Future:

Display:

```json
metadata
```

inside expandable card.

---

### Export Enhancements

Future:

```text
PDF Export
Excel Export
```

---

### Investigation Correlation

Future:

Ability to group audit logs by:

```text
Cycle
Pack
Patient
Investigation
```

---

### Audit Dashboard

Future metrics:

```text
Events Today
Events This Week
Most Active User
Most Common Actions
```

---

## Refactor Opportunities

### Components

Future extraction:

```text
components/audit/
  AuditFilters.tsx
  AuditExportButton.tsx
  AuditLogCard.tsx
  AuditPagination.tsx
```

---

### Business Logic

Future extraction:

```text
lib/modules/audit/
  fetchAuditLogs.ts
  exportAuditLogs.ts
  filterAuditLogs.ts
```

---

## Current Status

Implemented:

* Audit record loading
* Search
* Action filter
* Entity filter
* Date range filtering
* CSV export
* Pagination
* Dynamic filter options
* Badge system

Current maturity:

```text
Good
```

This page already provides a strong compliance audit trail and is one of the most important regulatory-support pages in SteriSphere.

## Settings Page — app/settings/page.tsx

### Route

`/settings`

### Purpose

The Settings page is the administrative control center of SteriSphere.

It manages:

```text
Clinic Configuration
User Roles
Providers
Sterilizers
Policies
Alerts
System Administration
```

Only authorized administrative users should access this page.

---

## Related Tables

### clinic_settings

Stores global clinic configuration.

Examples:

```text
clinic_name
clinic_address
clinic_phone
clinic_email
pack_expiration_days
auto_print_labels
sound_alerts_enabled
```

---

### user_roles

Stores RBAC permissions.

Examples:

```text
user_email
role
active
```

---

### providers

Stores clinical providers.

Examples:

```text
Dentists
Hygienists
Assistants
```

Used by:

```text
Patient Traceability
Investigation
Reports
```

---

### sterilizers

Stores sterilization equipment.

Examples:

```text
Sterilizer Name
Sterilizer Type
Active Status
```

Used by:

```text
Cycles
Dashboard
Investigation
```

---

## Main Tabs

### Overview

System summary.

Displays:

* Users
* Providers
* Sterilizers
* Policies

---

### General

Clinic information.

Editable:

```text
Clinic Name
Address
Phone
Email
```

---

### Policies

Operational rules.

Examples:

```text
Pack Expiration Days
Auto Print Labels
```

---

### Alerts

System alert preferences.

Examples:

```text
Cycle Complete Alert
Failed Cycle Alert
Expiring Pack Alert
Expired Pack Alert
```

---

### Users & Roles

Manages application access.

Roles:

```text
super_admin
admin
clinical_staff
doctor
auditor
```

---

### Providers

Manages provider directory.

Used by:

```text
Patient Traceability
Investigation
Reports
```

Supports:

* Add
* Edit
* Activate
* Deactivate

---

### Sterilizers

Manages sterilization devices.

Supports:

* Add
* Activate
* Deactivate

Used by:

```text
Cycles
Investigation
Dashboard
```

---

### Super Admin

Visible only to:

```text
super_admin
```

Purpose:

Reserved for future system-level administration.

---

## Business Importance

This page defines how SteriSphere behaves operationally.

Without this page:

```text
No provider management
No sterilizer management
No clinic settings
No role management
```

---

## Refactor Status

Current status:

```text
Medium
```

Page contains a large amount of administrative logic and should eventually be split into:

```text
components/settings/
  GeneralSettings.tsx
  PolicySettings.tsx
  AlertSettings.tsx
  UserRolesManager.tsx
  ProvidersManager.tsx
  SterilizersManager.tsx
```
## AppShell / RBAC — components/AppShell.tsx

### Purpose

AppShell is the security and navigation backbone of SteriSphere.

Responsibilities:

```text
Authentication
Role-Based Access Control
Navigation
Global Layout
Steri Assistant
```

Every page passes through AppShell.

---

## Related Components

### AuthGuard

Purpose:

Protect authenticated routes.

Unauthenticated users are redirected.

---

### SteriAssistantWidget

Global assistant available throughout the application.

Provides:

```text
Failed Cycles
Expired Packs Awaiting Review
Expiring Packs
Available Packs
Pending Cycles
```

Refreshes every:

```text
60 seconds
```

---

## Navigation System

Routes are controlled through:

```ts
navItems
```

Each route contains:

```text
label
href
roles
```

---

## Role Matrix

### super_admin

Full access.

---

### admin

Administrative access.

No super-admin functions.

---

### clinical_staff

Operational workflow access.

Examples:

```text
Cycles
Packs
Patient Traceability
```

---

### doctor

Clinical review access.

Examples:

```text
Patient Traceability
Reports
Investigation
```

---

### auditor

Read-only compliance access.

Examples:

```text
Patient History
Reports
Investigation
Audit Logs
```

---

## Assistant Data

Loaded from:

```text
cycles
packs
audit_logs
```

Metrics:

```text
overdueCycles
failedCycles
expiredPacks
expiringSoonPacks
availablePacks
```

---

## Assistant Refresh

Current implementation:

```text
60-second polling
```

Future improvement:

```text
Supabase Realtime
```

---

## Security Importance

This file controls:

```text
Who sees pages
Who can access features
Who receives operational information
```

It is one of the most critical files in SteriSphere.

Any role modification should be documented in:

```text
PROJECT_MAP.md
CHANGELOG_STERISPHERE.md
```

## Login Page — app/login/page.tsx

### Route

`/login`

### Purpose

The Login page authenticates users into SteriSphere using Supabase Auth.

It is the entry point before accessing protected application routes.

---

## Related Services

### Supabase Auth

Used through:

```ts
supabase.auth.signInWithPassword()
```

---

## Main State

### email

Stores the user email input.

### password

Stores the password input.

### loading

Controls login button state while authentication is in progress.

---

## Main Function

### login()

Purpose:

Authenticates the user.

Workflow:

```text
Validate email/password
→ Call Supabase signInWithPassword
→ Show success or error toast
→ Redirect to Dashboard
```

Redirect:

```text
/
```

---

## UI Sections

### Branding

Displays:

```text
SteriSphere
Sterilization Traceability Platform
```

### Login Form

Fields:

* Email
* Password

### Submit Button

Triggers:

```ts
login()
```

---

## Business Importance

This page protects access to SteriSphere and begins the authenticated session used by AppShell, RBAC, and audit workflows.

---

## Known Improvements

* Add forgot password flow
* Add loading spinner
* Improve error messages
* Add clinic logo
* Add role-based post-login redirect

## Reports Page — app/reports/page.tsx

### Route

`/reports`

### Purpose

The Reports page is SteriSphere's operational reporting and analytics center.

It provides visibility into:

```text
Cycles
Packs
Patient Traceability
Audit Activity
```

within a selected reporting period.

---

## Related Module

### lib/modules/reports

Provides:

```ts
getReportsData()
formatDate()
formatDateTime()
formatInitials()
```

Types:

```ts
Cycle
Pack
PatientTrace
AuditLog
```

This page already follows good architecture by keeping business logic outside the page.

---

## Related Tables

### cycles

Used for cycle reporting.

### packs

Used for inventory and pack reporting.

### patient_traces

Used for traceability reporting.

### audit_logs

Used for activity reporting.

---

## Main State

### cycles

Stores cycle report data.

### packs

Stores pack report data.

### patientTraces

Stores traceability report data.

### auditLogs

Stores audit activity report data.

### loading

Controls loading state.

### range

Reporting period.

Values:

```text
7
30
90
365
```

Represents days.

### searchTerm

Global report search.

---

## Pagination State

### cyclesPage

Cycle report pagination.

### packsPage

Pack report pagination.

### tracesPage

Patient trace pagination.

Current page size:

```text
5 records
```

---

## Main Function

### fetchReportsData()

Loads all reporting data.

Calls:

```ts
getReportsData()
```

Returns:

```text
Cycles
Packs
Patient Traces
Audit Logs
```

Purpose:

Populate dashboard-style reporting sections.

---

## Filtering Logic

### Date Range Filter

Uses:

```ts
range
```

Purpose:

Restrict reporting window.

Examples:

```text
Last 7 Days
Last 30 Days
Last 90 Days
Last Year
```

---

### Search Filter

Uses:

```ts
searchTerm
```

Searches report records across displayed sections.

---

## Major Page Sections

### Reports Header

Displays:

```text
Reports
Operational reporting and compliance insights
```

---

### Reporting Period Selector

Controls:

```ts
range
```

Used to reload reporting data.

---

### Cycle Reports

Displays:

```text
Cycle Number
Sterilizer
Operator
Status
Review Information
```

Purpose:

Operational sterilization review.

---

### Pack Reports

Displays:

```text
Pack Number
Pack Type
Cycle Number
Status
Expiration
```

Purpose:

Inventory and sterilization tracking.

---

### Patient Traceability Reports

Displays:

```text
Patient
Provider
Procedure
Pack Number
Date
```

Purpose:

Clinical traceability review.

---

### Audit Activity Reports

Displays:

```text
Action
Entity
User
Date
```

Purpose:

Compliance and accountability review.

---

## Cross-Page Integrations

### Cycles

Data originates from:

```text
/ cycles
```

---

### Packs

Data originates from:

```text
/ packs
```

---

### Patient Traceability

Data originates from:

```text
/ patients
```

---

### Audit Logs

Data originates from:

```text
/ audit-logs
```

---

## Business Importance

This page provides management-level visibility.

It answers:

```text
How many cycles were completed?
How many packs were generated?
How many patient traces exist?
What activity occurred?
```

Unlike Audit Logs, which focus on individual events, Reports focuses on operational summaries.

---

## Current Status

Implemented:

* Cycle reporting
* Pack reporting
* Traceability reporting
* Audit reporting
* Date range filtering
* Search
* Pagination

---

## Known Improvements

### CSV Export

Future:

```text
Export Cycles
Export Packs
Export Traces
Export Audit Activity
```

---

### PDF Reporting

Future:

```text
Compliance Report PDF
```

---

### Dashboard Metrics Integration

Future:

```text
Cycle Trends
Pack Usage Trends
Provider Activity Trends
```

---

### Charts

Future:

```text
Monthly Cycles
Monthly Packs
Monthly Traceability
```

---

## Refactor Status

Current status:

```text
Very Good
```

Most business logic already exists in:

```text
lib/modules/reports
```

making this one of the cleanest pages in SteriSphere.

## Patient History Page — app/patient-history/page.tsx

### Route

`/patient-history`

### Purpose

The Patient History page provides historical traceability records for individual patients.

It allows users to review:

```text
Patient
→ Procedure
→ Provider
→ Pack Used
→ Sterilization Cycle
→ Sterilizer
```

This page serves as the patient-centered view of the SteriSphere traceability chain.

---

## Related Tables

### patients

Used to select patients.

Fields:

```text
id
full_name
external_id
```

---

### patient_traces

Primary source of patient history records.

Fields:

```text
patient_name
provider
treatment_room
pack_number
procedure
created_at
```

---

### packs

Used to link traceability records to sterilization packs.

Fields:

```text
pack_number
cycle_number
```

---

### cycles

Used to retrieve sterilization details.

Fields:

```text
cycle_number
status
sterilizer
```

---

## Main Workflow

```text
Select Patient
→ Load Traceability Records
→ Load Related Packs
→ Load Related Cycles
→ Display Full Traceability Chain
```

---

## Local Types

### Patient

Represents patient lookup data.

Fields:

```text
id
full_name
external_id
```

---

### PatientHistoryRecord

Represents one traceability event.

Fields:

```text
id
patient_name
provider
treatment_room
pack_number
procedure
created_at
```

---

### Pack

Stores pack linkage information.

Fields:

```text
id
pack_number
cycle_number
```

---

### Cycle

Stores cycle information.

Fields:

```text
cycle_number
status
sterilizer
```

---

## Main State

### patients

Stores all available patients.

Loaded from:

```text
patients
```

---

### search

Patient search input.

Supports:

```text
Patient Name
External ID
```

---

### selectedPatient

Stores selected patient ID.

---

### history

Stores traceability records for selected patient.

Loaded from:

```text
patient_traces
```

---

### packs

Stores related packs used in patient history.

Loaded from:

```text
packs
```

---

### cycles

Stores cycle data linked to packs.

Loaded from:

```text
cycles
```

---

### loading

Controls loading state while retrieving patient history.

---

## Core Functions

### fetchPatients()

Loads patient list.

Query:

```text
patients
```

Ordered by:

```text
full_name ASC
```

Purpose:

Populate patient selector.

---

### loadHistory(patientId)

Main page function.

Purpose:

Build complete traceability chain.

Workflow:

```text
Load Patient
→ Load Patient Traces
→ Load Related Packs
→ Load Related Cycles
→ Build History View
```

---

### getPack(packNumber)

Helper function.

Purpose:

Retrieve linked pack information.

Returns:

```text
Pack
```

or:

```text
undefined
```

---

### getCycle(cycleNumber)

Helper function.

Purpose:

Retrieve linked cycle information.

Returns:

```text
Cycle
```

or:

```text
undefined
```

---

## URL Integration

Supports:

```text
/patient-history?patient=<patientId>
```

Purpose:

Open patient history directly from another page.

Current initialization:

```ts
const patientId = params.get("patient");
```

If present:

```text
Auto-select patient
Auto-load history
```

---

## Major Page Sections

### Search Patient

Contains:

#### Search Input

Searches:

```text
Patient Name
External ID
```

---

#### Patient Selector

Displays filtered patients.

Selection triggers:

```ts
loadHistory()
```

---

### Patient Traceability History

Displays complete traceability records.

For each record:

#### Patient

```text
patient_name
```

---

#### Pack Number

```text
pack_number
```

---

#### Procedure

```text
procedure
```

---

#### Provider

```text
provider
```

---

#### Treatment Room

```text
treatment_room
```

---

#### Linked Cycle

Retrieved through:

```text
Pack → Cycle
```

---

#### Cycle Status

Examples:

```text
Passed
Failed
Pending
```

---

#### Sterilizer

Displays sterilizer machine used.

---

#### Date Used

Displays:

```text
created_at
```

---

### Print History

Button:

```ts
window.print()
```

Purpose:

Generate printable patient traceability report.

---

## Cross-Page Integrations

### Patient Traceability Page

Records created in:

```text
/ patients
```

appear here.

Relationship:

```text
Patient Traceability
→ Patient History
```

---

### Packs

Pack records provide cycle linkage.

Relationship:

```text
Patient History
→ Pack
→ Cycle
```

---

### Dashboard

Future integration opportunity:

```text
Patient History Shortcut
```

---

## Business Importance

This page provides patient-centered traceability proof.

It answers:

```text
Which pack was used?
Which provider performed the procedure?
Which sterilization cycle generated that pack?
Which sterilizer was used?
When was the procedure performed?
```

This is one of the most important pages during:

```text
Internal Reviews
Regulatory Audits
Patient Inquiries
Failed Cycle Investigations
```

---

## Known Improvements

### Export PDF

Future:

```text
Patient Traceability Report PDF
```

---

### Export CSV

Future:

```text
Patient History CSV
```

---

### Multiple Patient Comparison

Future:

```text
Compare Traceability Records
```

---

### Direct Navigation

Future links:

```text
Open Pack
Open Cycle
Open Investigation
```

from history records.

---

### Pagination

Current implementation:

```text
No pagination
```

Future:

```text
Paginated History View
```

for large patient histories.

---

## Refactor Opportunities

### Components

Future extraction:

```text
components/patient-history/
  PatientSelector.tsx
  PatientHistoryCard.tsx
  HistoryToolbar.tsx
```

---

### Business Logic

Future extraction:

```text
lib/modules/patient-history/
  fetchPatients.ts
  loadPatientHistory.ts
  buildTraceabilityChain.ts
```

---

## Current Status

Implemented:

* Patient search
* Patient selection
* Full traceability chain
* Pack linkage
* Cycle linkage
* Sterilizer display
* Printable history

Current maturity:

```text
Good
```

The page is simple but highly valuable from a compliance perspective because it provides a complete patient-focused traceability history.
