export default function CompactDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="font-semibold text-slate-800">{value || "N/A"}</p>
    </div>
  );
}
