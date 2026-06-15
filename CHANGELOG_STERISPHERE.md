June 2026

Fix:
Resolved timezone issue affecting Dashboard → Patient Traces Today navigation.

The /patients?today=true filter now uses local date comparison rather than UTC-based date handling, ensuring traceability records created today are correctly displayed.


June 2026

Patients Refactor Step 2
- Extracted Traceability Filters & Export section into:
  components/patients/TraceabilityFilters.tsx

Preserved:
- Today trace navigation (/patients?today=true)
- Provider filtering
- Date filtering
- CSV export
- Search filters
- Pagination

No business logic changes.

June 2026

Patients Refactor Step 3
- Extracted Recent Patient Traces section into:
  components/patients/TraceabilityRecordsList.tsx

Preserved:
- Trace search
- Selected trace highlighting
- Pagination
- /patients?traceId=
- /patients?today=true

Additional Fix:
- Clear Filters now removes query parameters from the URL.
- Navigating from Dashboard → Patient Traces Today no longer re-applies filters after refresh.

