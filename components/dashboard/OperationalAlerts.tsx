import Link from "next/link";

type OperationalAlertsProps = {
  unreviewedFailedCyclesCount: number;
  pendingCyclesCount: number;
  expiredPacksCount: number;
  expiringSoonPacksCount: number;
  patientTracesTodayCount: number;
  labelsPrintedTodayCount: number;
};

type AlertTone = "danger" | "warning" | "info" | "success";

type AlertItem = {
  title: string;
  description: string;
  count: number;
  href: string;
  tone: AlertTone;
};

const toneClasses: Record<AlertTone, string> = {
  danger: "border-red-200 bg-red-50 text-red-800",
  warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-green-200 bg-green-50 text-green-800",
};

const countClasses: Record<AlertTone, string> = {
  danger: "bg-red-600 text-white",
  warning: "bg-yellow-500 text-white",
  info: "bg-blue-600 text-white",
  success: "bg-green-600 text-white",
};

export default function OperationalAlerts({
  unreviewedFailedCyclesCount,
  pendingCyclesCount,
  expiredPacksCount,
  expiringSoonPacksCount,
  patientTracesTodayCount,
  labelsPrintedTodayCount,
}: OperationalAlertsProps) {
  const alerts: AlertItem[] = [
    {
      title: "Failed cycles need review",
      description: "Investigate and document failed sterilization cycles.",
      count: unreviewedFailedCyclesCount,
      href: "/investigation?filter=failed",
      tone: "danger",
    },
    {
      title: "Expired packs blocked",
      description: "Review expired packs that are blocked from patient use.",
      count: expiredPacksCount,
      href: "/packs?filter=expired",
      tone: "danger",
    },
    {
      title: "Packs expiring soon",
      description: "Review packs expiring within the next 30 days.",
      count: expiringSoonPacksCount,
      href: "/packs?filter=expiring-soon",
      tone: "warning",
    },
    {
      title: "Pending cycles",
      description: "Cycles still waiting for operator review or release.",
      count: pendingCyclesCount,
      href: "/cycles?filter=pending",
      tone: "info",
    },
    {
      title: "Patient traces today",
      description: "Traceability records created today.",
      count: patientTracesTodayCount,
      href: "/patients?today=true",
      tone: "success",
    },
    {
      title: "Labels printed today",
      description: "Pack labels printed or reprinted today.",
      count: labelsPrintedTodayCount,
      href: "/audit-logs?action=label_printed&today=true",
      tone: "success",
    },
  ];

  const visibleAlerts = alerts.filter((alert) => alert.count > 0);

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-2xl font-semibold">Operational Alerts</h3>
          <p className="mt-1 text-sm text-slate-600">
            Daily priorities for sterilization, traceability, and label workflow.
          </p>
        </div>

        <div className="flex shrink-0 items-start">
          <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-medium leading-none text-slate-500">
            {visibleAlerts.length === 0
              ? "All clear"
              : `${visibleAlerts.length} active`}
          </span>
        </div>
      </div>

      {visibleAlerts.length === 0 ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
          No urgent operational alerts right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleAlerts.map((alert) => (
            <Link
              key={alert.title}
              href={alert.href}
              className={`rounded-xl border p-4 transition hover:shadow-sm ${toneClasses[alert.tone]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{alert.title}</p>
                  <p className="mt-1 text-xs opacity-80">
                    {alert.description}
                  </p>
                </div>

                <span
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold ${countClasses[alert.tone]}`}
                >
                  {alert.count}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}