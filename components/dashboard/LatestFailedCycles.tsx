import Link from "next/link";
import type { Cycle } from "./types";
import { formatInitials } from "./utils";

type LatestFailedCyclesProps = {
  cycles: Cycle[];
};

export default function LatestFailedCycles({ cycles }: LatestFailedCyclesProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-xl font-semibold">Latest Failed Cycles</h3>

      {cycles.length === 0 ? (
        <p className="text-sm text-slate-500">No failed cycles currently detected.</p>
      ) : (
        <div className="space-y-3">
          {cycles.map((cycle) => (
            <div
              key={cycle.id}
              className="rounded-xl border border-red-200 bg-red-50 p-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:justify-between">
                <p className="font-medium text-red-800">{cycle.cycle_number}</p>

                <Link
                  href={`/investigation?cycle=${cycle.cycle_number}`}
                  className="text-sm font-medium text-red-700 underline"
                >
                  Investigate
                </Link>
              </div>

              <p className="mt-1 text-sm text-red-700">
                {cycle.sterilizer} · Started by: {formatInitials(cycle.operator)}
              </p>

              <p className="mt-2 text-xs text-red-500">
                {new Date(cycle.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
