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
