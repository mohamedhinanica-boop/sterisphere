import type {
  AuditLog,
  Cycle,
  Pack,
  PatientTrace,
} from "@/components/dashboard/types";
import {
  countOrZero,
  getDashboardDateWindows,
} from "@/components/dashboard/utils";
import { supabase } from "@/lib/supabase";

export type DashboardData = {
  recentActivity: AuditLog[];
  recentActivityError: unknown;
  cyclesCount: number;
  packsCount: number;
  patientRecordsCount: number;
  failedCyclesCount: number;
  unreviewedFailedCyclesCount: number;
  openInvestigationsCount: number;
  pendingCyclesCount: number;
  openCyclesCount: number;
  closedCyclesCount: number;
  availablePacksCount: number;
  usedPacksCount: number;
  expiredPacksCount: number;
  unreviewedExpiredPacksCount: number;
  expiringSoonPacksCount: number;
  patientTracesTodayCount: number;
  labelsPrintedTodayCount: number;
  latestFailedCycles: Cycle[];
  latestPatientRecords: PatientTrace[];
  recentPacks: Pack[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const { now, thirtyDaysFromNow, todayStart, tomorrowStart } =
    getDashboardDateWindows();

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

  const { count: openInvestigations } = await supabase
    .from("cycles")
    .select("*", { count: "exact", head: true })
    .in("investigation_status", ["Open", "In Review"]);

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

  return {
    recentActivity: auditLogs || [],
    recentActivityError: auditError,
    cyclesCount: countOrZero(cycles),
    packsCount: countOrZero(packs),
    patientRecordsCount: countOrZero(patientRecords),
    failedCyclesCount: countOrZero(failedCycles),
    unreviewedFailedCyclesCount: countOrZero(unreviewedFailedCycles),
    openInvestigationsCount: countOrZero(openInvestigations),
    pendingCyclesCount: countOrZero(pendingCycles),
    openCyclesCount: countOrZero(openCycles),
    closedCyclesCount: countOrZero(closedCycles),
    availablePacksCount: countOrZero(availablePacks),
    usedPacksCount: countOrZero(usedPacks),
    expiredPacksCount: countOrZero(expiredPacks),
    unreviewedExpiredPacksCount: countOrZero(unreviewedExpiredPacks),
    expiringSoonPacksCount: countOrZero(expiringSoonPacks),
    patientTracesTodayCount: countOrZero(patientTracesToday),
    labelsPrintedTodayCount: countOrZero(labelsPrintedToday),
    latestFailedCycles: failedData || [],
    latestPatientRecords: patientData || [],
    recentPacks: packData || [],
  };
}
