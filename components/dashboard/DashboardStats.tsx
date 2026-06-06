import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  PackageCheck,
  ShieldCheck,
  Timer,
} from "lucide-react";
import StatCard from "./StatCard";

type DashboardStatsProps = {
  cyclesCount: number;
  pendingCyclesCount: number;
  failedCyclesCount: number;
  availablePacksCount: number;
  patientRecordsCount: number;
  packsCount: number;
  usedPacksCount: number;
  expiredPacksCount: number;
  expiringSoonPacksCount: number;
};

export default function DashboardStats({
  cyclesCount,
  pendingCyclesCount,
  failedCyclesCount,
  availablePacksCount,
  patientRecordsCount,
  packsCount,
  usedPacksCount,
  expiredPacksCount,
  expiringSoonPacksCount,
}: DashboardStatsProps) {
  return (
    <>
      <section className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={<ClipboardCheck />} title="Total Cycles" value={cyclesCount} />

        <StatCard
          icon={<Timer />}
          title="Pending Cycles"
          value={pendingCyclesCount}
          pending={pendingCyclesCount > 0}
        />

        <Link href="/investigation?filter=failed">
          <StatCard
            icon={<ShieldCheck />}
            title="Failed Cycles"
            value={failedCyclesCount}
            warning={failedCyclesCount > 0}
          />
        </Link>

        <StatCard
          icon={<PackageCheck />}
          title="Available Packs"
          value={availablePacksCount}
          good
        />

        <StatCard icon={<FileText />} title="Patient Records" value={patientRecordsCount} />
      </section>

      <section className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<PackageCheck />} title="Total Packs" value={packsCount} />

        <StatCard icon={<FileText />} title="Used Packs" value={usedPacksCount} />

        <StatCard
          icon={<AlertTriangle />}
          title="Expired Packs"
          value={expiredPacksCount}
          warning={expiredPacksCount > 0}
        />

        <StatCard
          icon={<Timer />}
          title="Expiring Soon"
          value={expiringSoonPacksCount}
          pending={expiringSoonPacksCount > 0}
        />
      </section>
    </>
  );
}
