type StatusBadgeProps = {
  status: string;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (status === "Open") {
    return (
      <span className="inline-flex rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
        Open
      </span>
    );
  }

  if (status === "In Review") {
    return (
      <span className="inline-flex rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700">
        In Review
      </span>
    );
  }

  if (status === "Closed") {
    return (
      <span className="inline-flex rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
        Closed
      </span>
    );
  }

  if (status === "Failed") {
    return (
      <span className="inline-flex rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
        Failed
      </span>
    );
  }

  if (status === "Passed") {
    return (
      <span className="inline-flex rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
        Passed
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700">
      {status}
    </span>
  );
}
