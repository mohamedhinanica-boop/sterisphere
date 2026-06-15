import type { ReactNode } from "react";

type StatCardProps = {
  icon: ReactNode;
  title: string;
  value: number;
  warning?: boolean;
  pending?: boolean;
  good?: boolean;
  interactive?: boolean;
};

export default function StatCard({
  icon,
  title,
  value,
  warning = false,
  pending = false,
  good = false,
  interactive = false,
}: StatCardProps) {
  const tone = warning ? "critical" : pending ? "warning" : good ? "normal" : "default";

  const cardClasses = {
    critical: "border-red-200 border-l-red-500 bg-red-50",
    warning: "border-yellow-200 border-l-yellow-500 bg-yellow-50",
    normal: "border-green-200 border-l-green-500 bg-green-50",
    default: "border-slate-200 border-l-slate-300 bg-white",
  };

  const iconClasses = {
    critical: "bg-red-100 text-red-600",
    warning: "bg-yellow-100 text-yellow-600",
    normal: "bg-green-100 text-green-600",
    default: "bg-blue-50 text-blue-600",
  };

  const titleClasses = {
    critical: "text-red-700",
    warning: "text-yellow-700",
    normal: "text-green-700",
    default: "text-slate-500",
  };

  const valueClasses = {
    critical: "text-red-700",
    warning: "text-yellow-700",
    normal: "text-green-700",
    default: "text-slate-950",
  };

  return (
    <div
      className={`rounded-2xl border border-l-4 p-6 shadow-sm transition duration-200 ${cardClasses[tone]} ${
        interactive ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""
      }`}
    >
      <div
        className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${iconClasses[tone]}`}
      >
        {icon}
      </div>

      <p className={`text-sm ${titleClasses[tone]}`}>
        {title}
      </p>

      <p className={`mt-1 text-3xl font-bold ${valueClasses[tone]}`}>
        {value}
      </p>
    </div>
  );
}
