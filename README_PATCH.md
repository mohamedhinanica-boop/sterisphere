# Traceability modules refactor V1

Add the files under `lib/modules/traceability/`.

Then in `app/patients/page.tsx`:

## 1. Add imports

```tsx
import {
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

## 2. Remove local duplicate type definitions

Remove the local `type Patient`, `type Pack`, `type PatientTrace`, `type Provider`, and `type CycleStatus` definitions from `app/patients/page.tsx`.

## 3. Replace fetch functions

```tsx
async function fetchPatients() {
  try {
    setPatients(await getPatients(supabase));
  } catch (error) {
    toast.error("Error loading patients.");
    console.error(error);
  }
}

async function fetchPacks() {
  try {
    setPacks(await getAvailablePacks(supabase));
  } catch (error) {
    toast.error("Error loading available packs.");
    console.error(error);
  }
}

async function fetchTraces() {
  try {
    setTraces(await getPatientTraces(supabase));
  } catch (error) {
    toast.error("Error loading traceability records.");
    console.error(error);
  }
}

async function fetchProviders() {
  try {
    setProviders(await getProviders(supabase));
  } catch (error) {
    toast.error("Error loading providers.");
    console.error(error);
  }
}
```

## 4. Replace validatePackBeforeUse

Either delete `validatePackBeforeUse` and change this line in `saveTrace`:

```tsx
await validatePackBeforeUse(form.packNumber);
```

to:

```tsx
await validatePackUsage(supabase, form.packNumber);
```

Or keep a wrapper:

```tsx
async function validatePackBeforeUse(packNumber: string) {
  return validatePackUsage(supabase, packNumber);
}
```

## 5. Test

- Patients page loads
- Available packs load
- Providers load
- Save trace works
- Expired packs are blocked
- Used packs are blocked
- Packs from non-Passed cycles are blocked
