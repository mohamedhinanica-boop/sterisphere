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