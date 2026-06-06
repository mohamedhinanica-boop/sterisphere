import { ClipboardCheck, FileText, PackageCheck, ShieldCheck } from "lucide-react";
import StatCard from "./StatCard";

type PerformanceStatsProps = {
  openCyclesCount: number;
  closedCyclesCount: number;
  availablePacksCount: number;
  usedPacksCount: number;
};

export default function PerformanceStats({
  openCyclesCount,
  closedCyclesCount,
  availablePacksCount,
  usedPacksCount,
}: PerformanceStatsProps) {
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-2xl font-semibold">Sterilization Performance</h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<ClipboardCheck size={28} />} title="Open Cycles" value={openCyclesCount} />

        <StatCard
          icon={<ShieldCheck size={28} />}
          title="Closed Cycles"
          value={closedCyclesCount}
        />

        <StatCard
          icon={<PackageCheck size={28} />}
          title="Available Packs"
          value={availablePacksCount}
          good
        />

        <StatCard icon={<FileText size={28} />} title="Used Packs" value={usedPacksCount} />
      </div>
    </section>
  );
}
