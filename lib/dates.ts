// Shared date-math helpers, extracted from what were 3 identical copies
// of toDateKey (calendar.tsx, routines/index.tsx, races/index.tsx) and 2
// identical copies of splitIso/combineToIso (event/create.tsx,
// eboard/meeting/create.tsx). This app has already had two real,
// documented bugs in this exact class of logic (see formatDateOfBirth in
// lib/profile.ts, and SPEC.md section 6) — consolidating them here means
// a fix only has to happen once, and makes them unit-testable.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Monday-start-of-week for a given date, in local time. Sunday (day 0)
// rolls back 6 days rather than forward 1, per the `day === 0 ? -6 : ...`
// branch below — this is exactly the kind of one-line date-math a test
// should pin down explicitly.
export function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

export function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

// Sets the day-of-month to 1 before adding months, so e.g. Jan 31 + 1
// month doesn't overflow into March (JS Date would otherwise interpret
// "Jan 31 + 1 month" as "Feb 31", which normalizes to Mar 3) — month-grid
// navigation only ever cares about which month is visible, never a
// specific day, so this loses no information that matters for that.
export function addMonths(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(1);
  date.setMonth(date.getMonth() + n);
  return date;
}

export function splitIso(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function combineToIso(date: string, time: string): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// Coarse relative-time label (minutes/hours/days ago) for a real
// timestamptz column — e.g. club_join_requests.created_at or
// club_members.joined_at — never for a fabricated "last active" concept
// this app doesn't track.
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// "Can't create/schedule this in the past" guards, shared by every create
// form that takes a date (events, races, Eboard meetings, routine
// workouts). Two variants since some fields carry a time component
// (compare the full instant against now) and some are date-only (compare
// against today's local date key, so "today" is never rejected).
export function isPastInstant(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

export function isPastDateOnly(dateStr: string): boolean {
  return dateStr < toDateKey(new Date());
}

// Compares two ISO instants by parsed value, not raw string — a
// round-tripped Supabase timestamptz (e.g. "...+00:00") and a freshly
// combineToIso'd string (always "...Z") represent the same instant but
// are never string-equal, which would otherwise defeat an "unchanged
// since load" edit-exemption check.
export function isSameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

// The forward-looking mirror of timeAgo, for a poll's optional closes_at
// deadline — the Stitch mockup's "2 DAYS LEFT" list-card badge. Enforcement
// of the deadline itself lives server-side (is_poll_closed/cast_vote,
// 0038_polls_scope_and_deadline.sql); this is purely the display string.
export function formatCountdown(closesAtIso: string): string {
  const diffMs = new Date(closesAtIso).getTime() - Date.now();
  if (diffMs <= 0) return "ENDED";
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return "ENDING SOON";
  if (hours < 24) return `${hours} HOUR${hours === 1 ? "" : "S"} LEFT`;
  const days = Math.floor(hours / 24);
  return `${days} DAY${days === 1 ? "" : "S"} LEFT`;
}
