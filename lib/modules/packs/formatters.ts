export function formatPackDate(date: string | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString();
}

export function formatPackDateTime(date: string | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleString();
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

export function formatLoadComposition(summary: string | null) {
  if (!summary) return [];

  return summary
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
