June 2026

Patients Refactor Step 4A
- Extracted CSV export helper functions into:
  components/patients/exportUtils.ts

Moved:
- escapeCsvValue
- buildExportFileName
- slugify

No behavior changes.


June 2026

Patients Refactor Step 4B
- Extracted filtering and date helper functions into:
  components/patients/filterUtils.ts

Moved:
- isTraceWithinDateRange
- formatDate
- formatDateTime

Preserved:
- Dashboard → Patient Traces Today navigation
- Local date filtering behavior
- CSV export compatibility


June 2026

Dashboard Refactor Step 1
- Extracted dashboard helper functions into:
  components/dashboard/utils.ts

Moved:
- getDashboardDateWindows
- countOrZero

No behavior changes.


June 2026

Dashboard Refactor Step 2
- Extracted dashboard data-loading logic into:
  lib/modules/dashboard.ts

Moved:
- Dashboard Supabase queries
- Dashboard aggregation logic
- Dashboard count calculations

Preserved:
- Operational Alerts
- Dashboard statistics
- Steri Assistant
- Auto-refresh
- Quick Actions


June 2026

Settings Refactor Step 1
- Extracted System Overview tab into:
  components/settings/SettingsOverview.tsx

No behavior changes.


June 2026

Settings Refactor Step 2
- Extracted Sterilization Policies tab into:
  components/settings/SettingsPolicies.tsx

No behavior changes.


June 2026

Settings Refactor Step 3
- Extracted Alerts tab into:
  components/settings/SettingsAlerts.tsx

Preserved:
- Sound alert settings
- Alert toggle behavior
- Save functionality


June 2026

Settings Refactor Step 4
- Extracted Settings helper functions into:
  components/settings/settingsUtils.ts

Moved:
- getExpirationPreset
- normalizeProviderName
- normalizeSterilizerName
- getProviderTitle


June 2026

Settings Refactor Step 5
- Extracted Provider Management tab into:
  components/settings/SettingsProviders.tsx

Preserved:
- Add provider
- Edit provider
- Activate/deactivate provider
- Duplicate prevention
- Provider preview


June 2026

Settings Refactor Step 6
- Extracted Sterilizer Management tab into:
  components/settings/SettingsSterilizers.tsx

Fix:
- Resolved sterilizer activation/deactivation failure.
- Removed invalid updated_at update from sterilizers mutations.
- Sterilizer status updates now function correctly.


June 2026

Settings Refactor Step 7
- Extracted Users & Roles tab into:
  components/settings/SettingsUsers.tsx

Preserved:
- RBAC protections
- Super Admin restrictions
- Current user self-protection
- User activation/deactivation
- Role management

Dashboard cards now support contextual navigation
Steri Assistant now displays alert-specific actions
Packs/Cycles support URL-driven status filtering

## Phase 4.1 – Dashboard Alert Management V2

### Added
- Clickable dashboard statistic cards
- Dashboard-to-workflow navigation
- URL-driven status filters for Cycles and Packs
- Today's Traces dashboard navigation

### Improved
- Steri Assistant now provides contextual operational actions
- Added assistant severity levels:
  - Critical
  - Warning
  - Normal
- Replaced generic navigation buttons with alert-specific actions
- Limited assistant actions to reduce visual clutter
## Phase 4.1 – Dashboard Alert Management V2

### Added
- Clickable dashboard statistic cards
- Dashboard-to-workflow navigation
- URL-driven status filtering
- Today's Traces navigation

### Improved
- Contextual Steri Assistant actions
- Severity-aware assistant messaging
- Alert prioritization
- Dashboard severity styling
- Interactive dashboard cards
- Hover and navigation polish

## Phase 4.2 – Investigation Workflow V2

### Added
- Investigation lifecycle statuses:
  - Open
  - In Review
  - Closed
- Investigation status badges
- Investigation closure timestamp tracking

### Improved
- Failed cycle investigation workflow
- Investigation reporting now includes lifecycle status
- Added lifecycle actions:
  - Mark as In Review
  - Mark as Closed

### Technical
- Added investigation_status support
- Added investigation_closed_at tracking
- Preserved existing review workflow and reviewed_at behavior
-we must add pagination
Future enhancement:
- Require upload or reference of management authorization before reopening a closed investigation.
- Store supporting document/reference in audit metadata.

## Phase 4.3 – Investigation Monitoring

### Added
- Open Investigations dashboard card
- Investigation severity indicators
- Dashboard investigation monitoring

### Improved
- Steri Assistant now tracks active investigations
- Investigation count updates in real time as investigations are closed
- Compliance workload is now visible from the dashboard