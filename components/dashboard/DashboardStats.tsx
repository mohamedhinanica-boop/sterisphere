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
  openInvestigationsCount: number;
  availablePacksCount: number;
  patientRecordsCount: number;
  patientTracesTodayCount: number;
  packsCount: number;
  usedPacksCount: number;
  expiredPacksCount: number;
  expiringSoonPacksCount: number;
};

export default function DashboardStats({
  cyclesCount,
  pendingCyclesCount,
  failedCyclesCount,
  openInvestigationsCount,
  availablePacksCount,
  patientRecordsCount,
  patientTracesTodayCount,
  packsCount,
  usedPacksCount,
  expiredPacksCount,
  expiringSoonPacksCount,
}: DashboardStatsProps) {
  return (
    <>
      <section className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={<ClipboardCheck />} title="Total Cycles" value={cyclesCount} />

        <Link href="/cycles?status=Pending" className="block">
          <StatCard
            icon={<Timer />}
            title="Pending Cycles"
            value={pendingCyclesCount}
            pending
            interactive
          />
        </Link>

        <Link href="/cycles?status=Failed" className="block">
          <StatCard
            icon={<ShieldCheck />}
            title="Failed Cycles"
            value={failedCyclesCount}
            warning
            interactive
          />
        </Link>

        <Link href="/packs?status=Available" className="block">
          <StatCard
            icon={<PackageCheck />}
            title="Available Packs"
            value={availablePacksCount}
            good
            interactive
          />
        </Link>

        <StatCard icon={<FileText />} title="Patient Records" value={patientRecordsCount} />

        <Link href="/patients?today=true" className="block">
          <StatCard
            icon={<FileText />}
            title="Today's Traces"
            value={patientTracesTodayCount}
            good
            interactive
          />
        </Link>
      </section>

      <section className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <Link href="/investigation" className="block">
          <StatCard
            icon={<ClipboardCheck />}
            title="Open Investigations"
            value={openInvestigationsCount}
            good={openInvestigationsCount === 0}
            pending={openInvestigationsCount > 0 && openInvestigationsCount <= 3}
            warning={openInvestigationsCount >= 4}
            interactive
          />
        </Link>

        <StatCard icon={<PackageCheck />} title="Total Packs" value={packsCount} />

        <StatCard icon={<FileText />} title="Used Packs" value={usedPacksCount} />

        <Link href="/packs?status=Expired" className="block">
          <StatCard
            icon={<AlertTriangle />}
            title="Expired Packs"
            value={expiredPacksCount}
            warning
            interactive
          />
        </Link>

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
