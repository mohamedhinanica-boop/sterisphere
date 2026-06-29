"use client";

export type NewPatientForm = {
  fullName: string;
  dateOfBirth: string;
  externalId: string;
};

type AddPatientModalProps = {
  form: NewPatientForm;
  saving: boolean;
  onChange: (field: keyof NewPatientForm, value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function AddPatientModal({
  form,
  saving,
  onChange,
  onClose,
  onSave,
}: AddPatientModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-patient-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div>
          <h2
            id="add-patient-title"
            className="text-2xl font-semibold text-slate-950"
          >
            Add Patient
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Create and select a patient without leaving this trace.
          </p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Full name <span className="text-red-600">*</span>
            </span>
            <input
              autoFocus
              value={form.fullName}
              onChange={(event) => onChange("fullName", event.target.value)}
              disabled={saving}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Patient full name"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Date of birth
            </span>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(event) =>
                onChange("dateOfBirth", event.target.value)
              }
              disabled={saving}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              External ID / chart number
            </span>
            <input
              value={form.externalId}
              onChange={(event) => onChange("externalId", event.target.value)}
              disabled={saving}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Optional"
            />
          </label>

          <p className="text-xs text-slate-500">
            Source system will be recorded as Manual.
          </p>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create and Select"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
