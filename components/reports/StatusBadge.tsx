type StatusBadgeProps = {
  status: string;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (status === "Passed") {
    return (
      <span className="w-fit rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
        Passed
      </span>
    );
  }

  if (status === "Failed") {
    return (
      <span className="w-fit rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
        Failed
      </span>
    );
  }

  return (
    <span className="w-fit rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700">
      {status}
    </span>
  );
}
