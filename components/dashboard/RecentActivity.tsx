import Link from "next/link";
import type { AuditLog } from "./types";

type RecentActivityProps = {
  activities: AuditLog[];
};

export default function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recent Activity</h2>

        <Link href="/audit-logs" className="text-sm font-medium text-blue-700 hover:text-blue-800">
          View All →
        </Link>
      </div>

      {activities.length === 0 ? (
        <p className="text-slate-500">No recent activity yet.</p>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="border-b border-slate-100 py-3 last:border-b-0"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-slate-900">
                    {activity.description || activity.action}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {activity.user_email || "unknown"} · {activity.entity_type}
                  </p>
                </div>

                <span className="text-xs text-slate-400">
                  {new Date(activity.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
