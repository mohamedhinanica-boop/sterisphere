type DetailCardProps = {
  label: string;
  value: string;
};

export default function DetailCard({ label, value }: DetailCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-800">{value || "N/A"}</p>
    </div>
  );
}
