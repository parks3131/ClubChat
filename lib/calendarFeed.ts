import { fetchEvents } from "./calendar";
import { fetchEboardChannel, fetchMeetings } from "./eboard";
import { fetchRaces } from "./races";
import type { CalendarEventType } from "../types/database";

const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  race: "Race",
  practice: "Practice",
  team_bonding: "Team bonding",
  volunteer: "Volunteer",
  other: "Other",
};

export interface CalendarFeedItem {
  id: string;
  kind: "event" | "race" | "meeting";
  title: string;
  subtitle: string | null;
  badgeLabel: string;
  // Full ISO datetime for events/meetings; "YYYY-MM-DDT00:00:00" for
  // races, which only ever have a date. `hasTime` tells the UI which of
  // the two to format/compare with.
  atIso: string;
  hasTime: boolean;
  path: string;
}

// Merges three already-existing, independently-scoped data sources into
// one club-wide, date-ordered feed:
//   - calendar_events: always shown (unchanged, club-wide).
//   - races: only ones the caller actually has access to (admin, or an
//     approved race_members row) — matches "if you're in the race", not
//     every race in the club (the plain Races & Meets list is visible to
//     everyone regardless of access; this feed is not).
//   - eboard_meetings: only if the caller is an eboard_channel_member —
//     if there's no Eboard channel yet, or the caller isn't in it,
//     fetchEboardChannel returns null/isMember=false and this
//     contributes nothing, same visibility rule the Eboard hub itself
//     already enforces.
// No new tables/RLS — every read here already goes through each
// feature's own existing policies.
export async function fetchCalendarFeed(
  clubId: string,
  userId: string,
  isClubAdmin: boolean
): Promise<CalendarFeedItem[]> {
  const items: CalendarFeedItem[] = [];

  const events = await fetchEvents(clubId);
  for (const e of events) {
    items.push({
      id: `event:${e.id}`,
      kind: "event",
      title: e.title,
      subtitle: e.location,
      badgeLabel: EVENT_TYPE_LABELS[e.eventType],
      atIso: e.startAt,
      hasTime: true,
      path: `/clubs/${clubId}/event/${e.id}`,
    });
  }

  const races = await fetchRaces(clubId, isClubAdmin);
  for (const r of races) {
    if (r.access === "none") continue;
    items.push({
      id: `race:${r.id}`,
      kind: "race",
      title: r.name,
      subtitle: null,
      badgeLabel: "Race/Meet",
      atIso: `${r.eventDate}T00:00:00`,
      hasTime: false,
      path: `/clubs/${clubId}/race/${r.id}`,
    });
  }

  const eboardChannel = await fetchEboardChannel(clubId, userId);
  if (eboardChannel?.isMember) {
    const meetings = await fetchMeetings(eboardChannel.id);
    for (const m of meetings) {
      items.push({
        id: `meeting:${m.id}`,
        kind: "meeting",
        title: m.title,
        subtitle: null,
        badgeLabel: "Eboard Meeting",
        atIso: m.meetingAt,
        hasTime: true,
        path: `/clubs/${clubId}/eboard/meeting/${m.id}`,
      });
    }
  }

  items.sort((a, b) => new Date(a.atIso).getTime() - new Date(b.atIso).getTime());
  return items;
}
