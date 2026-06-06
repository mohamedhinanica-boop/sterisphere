import Link from "next/link";
import type { Pack } from "./types";
import PackBadge from "./PackBadge";
import { getEffectivePackStatus } from "./utils";

type RecentGeneratedPacksProps = {
  packs: Pack[];
};

export default function RecentGeneratedPacks({ packs }: RecentGeneratedPacksProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">Recent Generated Packs</h3>

        <Link href="/packs" className="text-sm font-medium text-blue-700 hover:text-blue-800">
          View Inventory →
        </Link>
      </div>

      {packs.length === 0 ? (
        <p className="text-sm text-slate-500">No packs generated yet.</p>
      ) : (
        <div className="space-y-3">
          {packs.map((pack) => (
            <div key={pack.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:justify-between">
                <div>
                  <p className="font-medium">{pack.pack_number}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {pack.pack_type} · Cycle: {pack.cycle_number}
                  </p>
                </div>

                <PackBadge status={getEffectivePackStatus(pack)} />
              </div>

              <p className="mt-2 text-xs text-slate-400">
                Created: {new Date(pack.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
