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

/**
 * Returns today's start-of-day boundary in Malaysia time, as a UTC ISO
 * string suitable for a `gte` filter — regardless of the server's own
 * runtime timezone. Malaysia has no DST, so a fixed +08:00 offset is safe.
 */
export function malaysiaTodayStartUtc(): string {
  const todayInMalaysia = new Date().toLocaleDateString("en-CA", { timeZone: MALAYSIA_TIME_ZONE });
  return new Date(`${todayInMalaysia}T00:00:00+08:00`).toISOString();
}
