"use client";

import toast from "react-hot-toast";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const { count: cycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true });

    const { count: packs } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true });

    const { count: patientRecords } = await supabase
      .from("patient_traces")
      .select("*", { count: "exact", head: true });

    const { count: failedCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("status", "Failed");

    const { count: unreviewedFailedCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("status", "Failed")
      .is("reviewed_at", null);

    const { count: pendingCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("status", "Pending");

    const { count: openCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("cycle_state", "Open");

    const { count: closedCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("cycle_state", "Closed");

    const { count: availablePacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .eq("status", "Available");

    const { count: usedPacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .eq("status", "Used");

    const { count: expiredPacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .lt("expires_at", now.toISOString())
      .neq("status", "Used");

    const { count: unreviewedExpiredPacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .lt("expires_at", now.toISOString())
      .neq("status", "Used")
      .or("expired_reviewed.is.null,expired_reviewed.eq.false");

    const { count: expiringSoonPacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .gte("expires_at", now.toISOString())
      .lte("expires_at", thirtyDaysFromNow.toISOString())
      .neq("status", "Used");

    const { count: patientTracesToday } = await supabase
      .from("patient_traces")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString())
      .lt("created_at", tomorrowStart.toISOString());

    const { count: labelsPrintedToday } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("action", "label_printed")
      .gte("created_at", todayStart.toISOString())
      .lt("created_at", tomorrowStart.toISOString());

    const { data: auditLogs, error: auditError } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, description, user_email, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (auditError) {
      toast.error("Error loading recent activity.");
      console.error(auditError);
    } else {
      setRecentActivity(auditLogs || []);
    }

    const { data: failedData } = await supabase
      .from("cycles")
      .select("id, cycle_number, sterilizer, operator, status, created_at")
      .eq("status", "Failed")
      .order("created_at", { ascending: false })
      .limit(3);

    const { data: patientData } = await supabase
      .from("patient_traces")
      .select(
        "id, patient_id, patient_name, provider, treatment_room, pack_number, procedure, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(3);

    const { data: packData } = await supabase
      .from("packs")
      .select(
        "id, pack_number, cycle_number, pack_type, status, expires_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(5);

    setCyclesCount(cycles || 0);
    setPacksCount(packs || 0);
    setPatientRecordsCount(patientRecords || 0);
    setFailedCyclesCount(failedCycles || 0);
    setUnreviewedFailedCyclesCount(unreviewedFailedCycles || 0);
    setPendingCyclesCount(pendingCycles || 0);
    setOpenCyclesCount(openCycles || 0);
    setClosedCyclesCount(closedCycles || 0);
    setAvailablePacksCount(availablePacks || 0);
    setUsedPacksCount(usedPacks || 0);
    setExpiredPacksCount(expiredPacks || 0);
    setUnreviewedExpiredPacksCount(unreviewedExpiredPacks || 0);
    setExpiringSoonPacksCount(expiringSoonPacks || 0);
    setPatientTracesTodayCount(patientTracesToday || 0);
    setLabelsPrintedTodayCount(labelsPrintedToday || 0);
    setLatestFailedCycles(failedData || []);
    setLatestPatientRecords(patientData || []);
    setRecentPacks(packData || []);
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