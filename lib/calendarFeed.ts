import { fetchEvents } from "./calendar";
import { fetchEboardChannel, fetchMeetings } from "./eboard";
import { fetchPolls, isPollEffectivelyClosed } from "./polls";
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
  kind: "event" | "race" | "meeting" | "poll";
  title: string;
  subtitle: string | null;
  badgeLabel: string;
  // Full ISO datetime for events/meetings/polls; "YYYY-MM-DDT00:00:00" for
  // races, which only ever have a date. `hasTime` tells the UI which of
  // the two to format/compare with.
  atIso: string;
  hasTime: boolean;
  path: string;
  // Only meaningful for kind "poll": a poll doesn't have a fixed "when it
  // happens" the way an event/race/meeting does, so "Upcoming" vs "Past"
  // can't be a raw date compare against atIso the way it is for the other
  // 3 kinds — an open-ended poll (no closes_at) would otherwise flip to
  // "Past" the instant its own createdAt timestamp (used as atIso so it
  // still sorts/displays somewhere) ticks past "now", even though it's
  // still fully votable. isOpen instead reuses lib/polls.ts's own
  // isPollEffectivelyClosed so this can never drift from what the poll
  // screens themselves already show as open/closed.
  isOpen?: boolean;
}

// Merges several already-existing, independently-scoped data sources into
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
//   - polls (task #39, founder follow-up right after task #38 shipped
//     Race/Eboard-scoped polls: "if any poll is created, if the person is
//     in the club, race, or eboard channel he should see it in the
//     calendar"): club polls always shown (every club member can already
//     read them); race polls only for races the caller has access to
//     (same access list already computed for the races branch above, one
//     fetchPolls call per accessible race — race counts per club are
//     small, no batching needed); eboard polls only if the caller is an
//     eboard member (same `eboardChannel` already fetched below for
//     meetings, reused rather than fetched twice).
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

  const clubPolls = await fetchPolls({ type: "club", clubId }, userId);
  for (const p of clubPolls) {
    items.push({
      id: `poll:${p.id}`,
      kind: "poll",
      title: p.question,
      subtitle: null,
      badgeLabel: "Poll",
      atIso: p.closesAt ?? p.createdAt,
      hasTime: true,
      path: `/clubs/${clubId}/polls/${p.id}`,
      isOpen: !isPollEffectivelyClosed(p),
    });
  }

  // Every club member sees every race on the calendar as soon as it's
  // created (migration 0041 follow-up) — access level no longer gates
  // calendar visibility, only what happens if they tap through without
  // access (redirected to the Races & Meets list, per race/[raceId]/
  // _layout.tsx's existing guard).
  const races = await fetchRaces(clubId, isClubAdmin);
  for (const r of races) {
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

    const racePolls = await fetchPolls({ type: "race", clubId, raceId: r.id }, userId);
    for (const p of racePolls) {
      items.push({
        id: `poll:${p.id}`,
        kind: "poll",
        title: p.question,
        subtitle: null,
        badgeLabel: "Poll",
        atIso: p.closesAt ?? p.createdAt,
        hasTime: true,
        path: `/clubs/${clubId}/race/${r.id}/polls/${p.id}`,
        isOpen: !isPollEffectivelyClosed(p),
      });
    }
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

    const eboardPolls = await fetchPolls({ type: "eboard", clubId, eboardChannelId: eboardChannel.id }, userId);
    for (const p of eboardPolls) {
      items.push({
        id: `poll:${p.id}`,
        kind: "poll",
        title: p.question,
        subtitle: null,
        badgeLabel: "Poll",
        atIso: p.closesAt ?? p.createdAt,
        hasTime: true,
        path: `/clubs/${clubId}/eboard/polls/${p.id}`,
        isOpen: !isPollEffectivelyClosed(p),
      });
    }
  }

  items.sort((a, b) => new Date(a.atIso).getTime() - new Date(b.atIso).getTime());
  return items;
}
