export function getExpirationPreset(days: number) {
  if (days === 180) return "180";
  if (days === 365) return "365";
  if (days === 730) return "730";
  return "custom";
}

export function normalizeProviderName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(dr\.?|dre\.?|hyg\.?)\s+/, "")
    .replace(/\s+/g, " ");
}

export function normalizeSterilizerName(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export function getProviderTitle(role: string) {
  if (role === "Dentist" || role === "Specialist") return "Dr.";
  if (role === "Hygienist") return "Hyg.";
  return "";
}
