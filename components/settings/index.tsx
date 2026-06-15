import React from "react";

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 mb-6 text-sm text-slate-600">{description}</p>
      )}
      {children}
    </section>
  );
}

export function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  min?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <input
        type={type}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
        placeholder={placeholder}
      />
    </div>
  );
}

export function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}

export function SectionHeader({
  activeCount,
  inactiveCount,
}: {
  activeCount: number;
  inactiveCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-sm mb-4">
      <StatusCount label="Active" value={activeCount} />
      <StatusCount label="Inactive" value={inactiveCount} />
    </div>
  );
}

export function StatusCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
      {label}: {value}
    </span>
  );
}

export function ManagementRow({
  title,
  badge,
  active,
  createdAt,
  onToggle,
  loading,
  extraAction,
}: {
  title: string;
  badge: React.ReactNode;
  active: boolean;
  createdAt: string;
  onToggle: () => void;
  loading: boolean;
  extraAction?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{title}</p>
          {badge}
          <StatusBadge active={active} />
        </div>

        <p className="text-xs text-slate-400 mt-1">
          Added: {new Date(createdAt).toLocaleString()}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {extraAction}

        <button
          type="button"
          onClick={onToggle}
          disabled={loading}
          className={`rounded-xl px-5 py-3 text-sm font-medium cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed ${
            active
              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "bg-green-600 text-white hover:bg-green-700"
          }`}
        >
          {active ? "Deactivate" : "Activate"}
        </button>
      </div>
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const classes: Record<string, string> = {
    super_admin: "border-purple-200 bg-purple-50 text-purple-700",
    admin: "border-blue-200 bg-blue-50 text-blue-700",
    clinical_staff: "border-green-200 bg-green-50 text-green-700",
    doctor: "border-indigo-200 bg-indigo-50 text-indigo-700",
    auditor: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span
      className={`rounded-lg border px-3 py-1 text-xs font-medium ${
        classes[role] || classes.auditor
      }`}
    >
      {role}
    </span>
  );
}

export function ProviderRoleBadge({ role }: { role: string }) {
  const classes: Record<string, string> = {
    Dentist: "border-blue-200 bg-blue-50 text-blue-700",
    Hygienist: "border-green-200 bg-green-50 text-green-700",
    Assistant: "border-purple-200 bg-purple-50 text-purple-700",
    Specialist: "border-indigo-200 bg-indigo-50 text-indigo-700",
    Other: "border-slate-200 bg-slate-50 text-slate-600",
    Provider: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span
      className={`rounded-lg border px-3 py-1 text-xs font-medium ${
        classes[role] || classes.Provider
      }`}
    >
      {role}
    </span>
  );
}

export function SterilizerTypeBadge({ type }: { type: string }) {
  const classes: Record<string, string> = {
    Autoclave: "border-blue-200 bg-blue-50 text-blue-700",
    Statim: "border-green-200 bg-green-50 text-green-700",
    Washer: "border-purple-200 bg-purple-50 text-purple-700",
    Other: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span
      className={`rounded-lg border px-3 py-1 text-xs font-medium ${
        classes[type] || classes.Other
      }`}
    >
      {type}
    </span>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-lg border px-3 py-1 text-xs font-medium ${
        active
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-slate-200 bg-slate-100 text-slate-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
