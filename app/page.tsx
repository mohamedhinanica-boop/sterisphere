"use client";

import toast from "react-hot-toast";
import { useEffect, useState } from "react";
import CycleWizard from "@/components/CycleWizard";
import FailedCyclesAlert from "@/components/dashboard/FailedCyclesAlert";
import DashboardStats from "@/components/dashboard/DashboardStats";
import DashboardQuickActions from "@/components/dashboard/DashboardQuickActions";
import LatestFailedCycles from "@/components/dashboard/LatestFailedCycles";
import RecentGeneratedPacks from "@/components/dashboard/RecentGeneratedPacks";
import LatestPatientTraceability from "@/components/dashboard/LatestPatientTraceability";
import RecentActivity from "@/components/dashboard/RecentActivity";
import PerformanceStats from "@/components/dashboard/PerformanceStats";
import OperationalAlerts from "@/components/dashboard/OperationalAlerts";
import type {
  AuditLog,
  Cycle,
  Pack,
  PatientTrace,
} from "@/components/dashboard/types";
import { getDashboardData } from "@/lib/modules/dashboard";

export default function Home() {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [cyclesCount, setCyclesCount] = useState(0);
  const [packsCount, setPacksCount] = useState(0);
  const [patientRecordsCount, setPatientRecordsCount] = useState(0);
  const [failedCyclesCount, setFailedCyclesCount] = useState(0);
  const [unreviewedFailedCyclesCount, setUnreviewedFailedCyclesCount] =
    useState(0);
  const [pendingCyclesCount, setPendingCyclesCount] = useState(0);
  const [openCyclesCount, setOpenCyclesCount] = useState(0);
  const [closedCyclesCount, setClosedCyclesCount] = useState(0);
  const [availablePacksCount, setAvailablePacksCount] = useState(0);
  const [usedPacksCount, setUsedPacksCount] = useState(0);
  const [expiredPacksCount, setExpiredPacksCount] = useState(0);
  const [unreviewedExpiredPacksCount, setUnreviewedExpiredPacksCount] =
    useState(0);
  const [expiringSoonPacksCount, setExpiringSoonPacksCount] = useState(0);
  const [patientTracesTodayCount, setPatientTracesTodayCount] = useState(0);
  const [labelsPrintedTodayCount, setLabelsPrintedTodayCount] = useState(0);

  const [latestFailedCycles, setLatestFailedCycles] = useState<Cycle[]>([]);
  const [latestPatientRecords, setLatestPatientRecords] = useState<
    PatientTrace[]
  >([]);
  const [recentPacks, setRecentPacks] = useState<Pack[]>([]);

  useEffect(() => {
    fetchDashboardData();

    const interval = setInterval(() => {
      fetchDashboardData();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  async function fetchDashboardData() {
    const dashboardData = await getDashboardData();

    if (dashboardData.recentActivityError) {
      toast.error("Error loading recent activity.");
      console.error(dashboardData.recentActivityError);
    } else {
      setRecentActivity(dashboardData.recentActivity);
    }

    setCyclesCount(dashboardData.cyclesCount);
    setPacksCount(dashboardData.packsCount);
    setPatientRecordsCount(dashboardData.patientRecordsCount);
    setFailedCyclesCount(dashboardData.failedCyclesCount);
    setUnreviewedFailedCyclesCount(dashboardData.unreviewedFailedCyclesCount);
    setPendingCyclesCount(dashboardData.pendingCyclesCount);
    setOpenCyclesCount(dashboardData.openCyclesCount);
    setClosedCyclesCount(dashboardData.closedCyclesCount);
    setAvailablePacksCount(dashboardData.availablePacksCount);
    setUsedPacksCount(dashboardData.usedPacksCount);
    setExpiredPacksCount(dashboardData.expiredPacksCount);
    setUnreviewedExpiredPacksCount(dashboardData.unreviewedExpiredPacksCount);
    setExpiringSoonPacksCount(dashboardData.expiringSoonPacksCount);
    setPatientTracesTodayCount(dashboardData.patientTracesTodayCount);
    setLabelsPrintedTodayCount(dashboardData.labelsPrintedTodayCount);
    setLatestFailedCycles(dashboardData.latestFailedCycles);
    setLatestPatientRecords(dashboardData.latestPatientRecords);
    setRecentPacks(dashboardData.recentPacks);
    setLastRefresh(new Date());
  }

  return (
    <>
      <header className="mb-8">
        <p className="text-sm text-slate-500">Dentaria Internal System</p>
        <h2 className="mt-1 text-4xl font-bold">Sterilization Dashboard</h2>
        <p className="mt-2 text-slate-600">
          Daily control center for sterilization cycles, auto-generated packs,
          patient traceability, and compliance alerts.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      </header>

      <FailedCyclesAlert count={unreviewedFailedCyclesCount} />

      <DashboardStats
        cyclesCount={cyclesCount}
        pendingCyclesCount={pendingCyclesCount}
        failedCyclesCount={failedCyclesCount}
        availablePacksCount={availablePacksCount}
        patientRecordsCount={patientRecordsCount}
        packsCount={packsCount}
        usedPacksCount={usedPacksCount}
        expiredPacksCount={expiredPacksCount}
        expiringSoonPacksCount={expiringSoonPacksCount}
      />

      <OperationalAlerts
        unreviewedFailedCyclesCount={unreviewedFailedCyclesCount}
        pendingCyclesCount={pendingCyclesCount}
        expiredPacksCount={unreviewedExpiredPacksCount}
        expiringSoonPacksCount={expiringSoonPacksCount}
        patientTracesTodayCount={patientTracesTodayCount}
        labelsPrintedTodayCount={labelsPrintedTodayCount}
      />

      <DashboardQuickActions>
        <CycleWizard onCycleCreated={fetchDashboardData} />
      </DashboardQuickActions>

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <LatestFailedCycles cycles={latestFailedCycles} />
        <RecentGeneratedPacks packs={recentPacks} />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <LatestPatientTraceability records={latestPatientRecords} />
        <RecentActivity activities={recentActivity} />
      </div>

      <PerformanceStats
        openCyclesCount={openCyclesCount}
        closedCyclesCount={closedCyclesCount}
        availablePacksCount={availablePacksCount}
        usedPacksCount={usedPacksCount}
      />
    </>
  );
}
