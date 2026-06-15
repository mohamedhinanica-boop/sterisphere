import type { Pack } from "@/lib/modules/reports";

export function paginate<T>(items: T[], page: number, itemsPerPage: number) {
  return items.slice((page - 1) * itemsPerPage, page * itemsPerPage);
}

export function getRangeLabel(range: string) {
  if (range === "today") return "Today";
  if (range === "7") return "Last 7 days";
  if (range === "30") return "Last 30 days";
  if (range === "90") return "Last 90 days";
  return "All time";
}

export function getEffectivePackStatus(pack: Pack) {
  if (pack.status === "Used") return "Used";

  if (pack.expires_at && new Date(pack.expires_at) < new Date()) {
    return "Expired";
  }

  return pack.status || "Available";
}

export function isExpiringSoon(pack: Pack) {
  if (!pack.expires_at || getEffectivePackStatus(pack) !== "Available") {
    return false;
  }

  const today = new Date();
  const expiry = new Date(pack.expires_at);
  const diffInDays = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  return diffInDays >= 0 && diffInDays <= 30;
}
