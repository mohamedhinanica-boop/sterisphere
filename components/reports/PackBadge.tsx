type PackBadgeProps = {
  status: string;
};

export default function PackBadge({ status }: PackBadgeProps) {
  if (status === "Available") {
    return (
      <span className="w-fit rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
        Available
      </span>
    );
  }

  if (status === "Used") {
    return (
      <span className="w-fit rounded-lg border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
        Used
      </span>
    );
  }

  if (status === "Expired") {
    return (
      <span className="w-fit rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
        Expired
      </span>
    );
  }

  return (
    <span className="w-fit rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700">
      {status}
    </span>
  );
}
