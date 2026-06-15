June 2026

Fix:
Resolved timezone issue affecting Dashboard → Patient Traces Today navigation.

The /patients?today=true filter now uses local date comparison rather than UTC-based date handling, ensuring traceability records created today are correctly displayed.