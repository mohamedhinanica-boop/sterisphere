# Traceability modules refactor V2

This V2 moves the trace creation business workflow into `lib/modules/traceability/createPatientTrace.ts`.

## Files to replace/add

Copy these files into your project:

```text
lib/modules/traceability/types.ts
lib/modules/traceability/getProviders.ts
lib/modules/traceability/createPatientTrace.ts
lib/modules/traceability/index.ts
```

Keep the other V1 traceability files already added:

```text
getPatients.ts
getAvailablePacks.ts
getPatientTraces.ts
validatePackUsage.ts
```

## 1. Update imports in `app/patients/page.tsx`

Make sure your traceability import includes `createPatientTrace`:

```tsx
import {
  createPatientTrace,
  getAvailablePacks,
  getPatientTraces,
  getPatients,
  getProviders,
  validatePackUsage,
  type Pack,
  type Patient,
  type PatientTrace,
  type Provider,
} from "@/lib/modules/traceability";
```

If you no longer use `validatePackUsage` directly in the page after this patch, you can remove it from the import.

## 2. Remove unused audit import from `app/patients/page.tsx`

After replacing `saveTrace`, the page no longer needs to create audit logs directly.

Remove:

```tsx
import { createAuditLog } from "@/lib/audit";
```

Only remove it if the page does not use it anywhere else.

## 3. Replace `saveTrace()` in `app/patients/page.tsx`

Replace the whole current `saveTrace()` function with:

```tsx
async function saveTrace() {
  if (
    !selectedPatient ||
    !form.packNumber ||
    !form.provider ||
    !form.treatmentRoom ||
    !form.procedure
  ) {
    toast.error("Please fill all required fields.");
    return;
  }

  setLoading(true);

  try {
    await createPatientTrace(supabase, {
      patientId: selectedPatient.id,
      patientName: selectedPatient.full_name,
      provider: form.provider,
      treatmentRoom: form.treatmentRoom,
      packNumber: form.packNumber,
      procedure: form.procedure,
    });

    setForm({
      patientId: "",
      packNumber: "",
      provider: "",
      treatmentRoom: "",
      procedure: "",
    });

    setPatientSearch("");
    setCurrentPage(1);

    await fetchTraces();
    await fetchPacks();

    toast.success("Patient traceability record saved. Pack marked as used.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error saving patient trace.";

    toast.error(message);
    console.error(error);
  } finally {
    setLoading(false);
  }
}
```

## 4. Optional cleanup

If this local wrapper still exists and is no longer used, delete it:

```tsx
async function validatePackBeforeUse(packNumber: string) {
  return validatePackUsage(supabase, packNumber);
}
```

## 5. Test

- Patients page loads
- Provider dropdown excludes Assistant and Other
- Saving trace works
- Used pack disappears from available packs
- Used pack cannot be used again
- Expired pack remains blocked
- Pack from non-Passed cycle remains blocked
- Audit logs still appear for trace creation and pack marked used
