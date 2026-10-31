// All times are stored in UTC and always *displayed* in Pacific time.
// "America/Los_Angeles" shows PST in winter and PDT in summer automatically.
const TZ = 'America/Los_Angeles';

const full = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

const short = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateOnly = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
});

/** "Oct 31, 2026, 3:45 PM PDT" */
export function pst(iso: string | null | undefined): string {
  return iso ? full.format(new Date(iso)) : '—';
}

/** "Oct 31, 3:45 PM" (Pacific) */
export function pstShort(iso: string | null | undefined): string {
  return iso ? short.format(new Date(iso)) : '—';
}

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar day in Pacific time, as "2026-10-31". */
export function pstDayKey(iso: string | Date): string {
  return dayKeyFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** "Oct 31" */
export function pstDate(iso: string | null | undefined): string {
  return iso ? dateOnly.format(new Date(iso)) : '—';
}

/** Elapsed time between two timestamps, e.g. "2d 4h" or "35m". */
export function duration(fromIso: string | null, toIso: string | null): string | null {
  if (!fromIso || !toIso) return null;
  const mins = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
