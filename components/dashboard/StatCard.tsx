import type { ReactNode } from "react";

type StatCardProps = {
  icon: ReactNode;
  title: string;
  value: number;
  warning?: boolean;
  pending?: boolean;
  good?: boolean;
};

export default function StatCard({
  icon,
  title,
  value,
  warning = false,
  pending = false,
  good = false,
}: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${
        warning
          ? "border-red-200 bg-red-50"
          : pending
          ? "border-yellow-200 bg-yellow-50"
          : good
          ? "border-green-200 bg-green-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={
          warning
            ? "mb-4 text-red-600"
            : pending
            ? "mb-4 text-yellow-600"
            : good
            ? "mb-4 text-green-600"
            : "mb-4 text-blue-600"
        }
      >
        {icon}
      </div>

      <p
        className={
          warning
            ? "text-sm text-red-700"
            : pending
            ? "text-sm text-yellow-700"
            : good
            ? "text-sm text-green-700"
            : "text-sm text-slate-500"
        }
      >
        {title}
      </p>

      <p
        className={
          warning
            ? "mt-1 text-3xl font-bold text-red-700"
            : pending
            ? "mt-1 text-3xl font-bold text-yellow-700"
            : good
            ? "mt-1 text-3xl font-bold text-green-700"
            : "mt-1 text-3xl font-bold"
        }
      >
        {value}
      </p>
    </div>
  );
}
