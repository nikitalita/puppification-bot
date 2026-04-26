export const DEFAULT_PUPPIFY_MINUTES = 10;
export const MIN_PUPPIFY_MINUTES = 1;
export const MAX_PUPPIFY_MINUTES = 1440; // 24 hours

export function minutesToMs(minutes: number): number {
  return Math.round(minutes * 60_000);
}

/**
 * Pretty-print a duration in minutes for command replies.
 *
 *   1   -> "1 minute"
 *   10  -> "10 minutes"
 *   60  -> "1 hour"
 *   90  -> "1 hour 30 minutes"
 */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) {
    return safe === 1 ? '1 minute' : `${safe} minutes`;
  }
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  const hoursPart = hours === 1 ? '1 hour' : `${hours} hours`;
  if (mins === 0) return hoursPart;
  const minsPart = mins === 1 ? '1 minute' : `${mins} minutes`;
  return `${hoursPart} ${minsPart}`;
}
