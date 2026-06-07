export function formatDate(date: string | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString();
}

export function formatDateTime(date: string | null) {
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
