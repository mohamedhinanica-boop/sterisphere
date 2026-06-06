import type { Pack } from "./types";

export function isPackExpired(pack: Pick<Pack, "expires_at">, now = new Date()) {
  if (!pack.expires_at) {
    return false;
  }

  return new Date(pack.expires_at) < now;
}

export function getPackEffectiveStatus(
  pack: Pick<Pack, "status" | "expires_at">,
  now = new Date()
) {
  if (pack.status === "Used") {
    return "Used";
  }

  if (isPackExpired(pack, now)) {
    return "Expired";
  }

  return pack.status || "Available";
}

export function isPackExpiringSoon(
  pack: Pick<Pack, "status" | "expires_at">,
  daysThreshold = 30,
  now = new Date()
) {
  if (!pack.expires_at || getPackEffectiveStatus(pack, now) !== "Available") {
    return false;
  }

  const expiry = new Date(pack.expires_at);
  const diffInDays = Math.ceil(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return diffInDays >= 0 && diffInDays <= daysThreshold;
}
