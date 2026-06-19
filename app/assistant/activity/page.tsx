"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, Home, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import {
  getActivityVariantClass,
  loadAssistantActivity,
  type AssistantActivityItem,
} from "@/lib/modules/assistantActivity";

export default function AssistantActivityPage() {
  const [activity, setActivity] = useState<AssistantActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
  }, []);

  async function loadActivity() {
    setLoading(true);

    try {
      const items = await loadAssistantActivity(40);
      setActivity(items);
    } catch (error) {
      toast.error("Error loading activity.");
      console.error("Assistant activity load error:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100svh] flex-col bg-slate-100 p-3 text-slate-950 lg:h-[100svh] lg:overflow-hidden">
      <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-300">
            SteriSphere Workstation
          </p>
          <h1 className="text-2xl font-bold tracking-normal">Activity Timeline</h1>
        </div>

        <Link
          href="/assistant"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/15 active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          <ArrowLeft className="h-5 w-5" />
          Workstation
        </Link>
      </header>

      <section className="grid min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-hidden">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-lg font-bold text-slate-500">
            Loading activity...
          </div>
        ) : activity.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
            <div>
              <Activity className="mx-auto h-14 w-14 text-slate-500" />
              <h2 className="mt-4 text-3xl font-black">No Activity Today</h2>
              <p className="mt-2 text-base font-semibold text-slate-500">
                Cycle, pack, traceability, and investigation events will appear here.
              </p>
              <Link
                href="/assistant"
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-base font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                <Home className="h-5 w-5" />
                Back to Workstation
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Today</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {activity.length} recent event{activity.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={loadActivity}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {activity.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-500">{item.time}</p>
                        <h3 className="mt-1 truncate text-lg font-black text-slate-950">
                          {item.title}
                        </h3>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black uppercase ${getActivityVariantClass(
                          item.variant
                        )}`}
                      >
                        {item.variant}
                      </span>
                    </div>

                    <p className="mt-2 truncate text-sm font-black text-slate-700">
                      {item.entityLabel}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">
                      {item.detail}
                    </p>
                    {item.userEmail && (
                      <p className="mt-3 truncate text-xs font-semibold text-slate-400">
                        {item.userEmail}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}