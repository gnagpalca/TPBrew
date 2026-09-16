const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

export function formatMalaysiaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatMalaysiaDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    dateStyle: "medium",
  });
}
