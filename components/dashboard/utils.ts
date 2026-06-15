import type { Pack } from "./types";

export function getEffectivePackStatus(pack: Pack) {
  if (pack.status === "Used") return "Used";

  if (pack.expires_at && new Date(pack.expires_at) < new Date()) {
    return "Expired";
  }

  return pack.status || "Available";
}

export function formatInitials(value: string | null | undefined) {
  if (!value) return "N/A";

  const emailName = value.split("@")[0] || value;
  const parts = emailName
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return emailName.slice(0, 2).toUpperCase();
}

export function getDashboardDateWindows(referenceDate = new Date()) {
  const now = new Date(referenceDate);

  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  return {
    now,
    thirtyDaysFromNow,
    todayStart,
    tomorrowStart,
  };
}

export function countOrZero(count: number | null | undefined) {
  return count || 0;
}
