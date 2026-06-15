type MetricCardProps = {
  title: string;
  value: string | number;
  good?: boolean;
  danger?: boolean;
  warning?: boolean;
};

export default function MetricCard({
  title,
  value,
  good = false,
  danger = false,
  warning = false,
}: MetricCardProps) {
  const className = danger
    ? "border-red-200 bg-red-50 text-red-700"
    : warning
      ? "border-yellow-200 bg-yellow-50 text-yellow-700"
      : good
        ? "border-green-200 bg-green-50 text-green-700"
        : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${className}`}>
      <p className="text-sm opacity-80">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}
