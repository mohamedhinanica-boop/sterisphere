import Link from "next/link";
import { AlertTriangle } from "lucide-react";

type FailedCyclesAlertProps = {
  count: number;
};

export default function FailedCyclesAlert({ count }: FailedCyclesAlertProps) {
  if (count <= 0) return null;

  return (
    <section className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-3">
          <AlertTriangle className="shrink-0 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-800">
              Failed sterilization cycles need attention
            </h3>
            <p className="mt-1 text-sm text-red-700">
              There are {count} new failed cycle(s). Review linked packs and
              patient traceability.
            </p>
          </div>
        </div>

        <Link
          href="/investigation?filter=failed"
          className="min-h-11 rounded-xl bg-red-600 px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-red-700 active:scale-95"
        >
          Open Investigation
        </Link>
      </div>
    </section>
  );
}
