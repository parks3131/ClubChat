import { fetchCalendarFeed, fetchGlobalCalendarFeed } from "./calendarFeed";
import { fetchEvents } from "./calendar";
import { fetchMyClubs } from "./clubs";
import { fetchEboardChannel, fetchMeetings } from "./eboard";
import { fetchPolls } from "./polls";
import { fetchRaces } from "./races";

jest.mock("./calendar");
jest.mock("./clubs");
jest.mock("./eboard");
// Only fetchPolls is mocked — isPollEffectivelyClosed keeps its real
// implementation (via requireActual) since calendarFeed.ts's own isOpen
// computation calls it directly, and a plain jest.mock("./polls") would
// silently replace it with a mock returning undefined for every poll.
jest.mock("./polls", () => ({
  ...jest.requireActual("./polls"),
  fetchPolls: jest.fn(),
}));
jest.mock("./races");

const mockFetchEvents = fetchEvents as jest.MockedFunction<typeof fetchEvents>;
const mockFetchMyClubs = fetchMyClubs as jest.MockedFunction<typeof fetchMyClubs>;
const mockFetchRaces = fetchRaces as jest.MockedFunction<typeof fetchRaces>;
const mockFetchEboardChannel = fetchEboardChannel as jest.MockedFunction<typeof fetchEboardChannel>;
const mockFetchMeetings = fetchMeetings as jest.MockedFunction<typeof fetchMeetings>;
const mockFetchPolls = fetchPolls as jest.MockedFunction<typeof fetchPolls>;

const baseEvent = {
  clubId: "club-1",
  description: null,
  location: null,
  endAt: null,
  createdBy: "user-1",
  createdByName: "Admin Ann",
};

const baseMeeting = {
  eboardChannelId: "eboard-1",
  description: null,
  meetingLink: null,
  createdBy: "user-1",
  createdByName: "Admin Ann",
};

beforeEach(() => {
  mockFetchEvents.mockReset();
  mockFetchMyClubs.mockReset();
  mockFetchRaces.mockReset();
  mockFetchEboardChannel.mockReset();
  mockFetchMeetings.mockReset();
  mockFetchPolls.mockReset().mockResolvedValue([]);
});

describe("fetchCalendarFeed", () => {
  it("includes every race regardless of access (only tapping through is access-gated)", async () => {
    mockFetchEvents.mockResolvedValue([]);
    mockFetchRaces.mockResolvedValue([
      { id: "r1", clubId: "club-1", name: "Visible Race", eventDate: "2026-05-01", avatarUrl: null, pinned: false, access: "member", requestStatus: null },
      { id: "r2", clubId: "club-1", name: "Hidden Race", eventDate: "2026-05-02", avatarUrl: null, pinned: false, access: "none", requestStatus: "pending" },
    ]);
    mockFetchEboardChannel.mockResolvedValue(null);

    const feed = await fetchCalendarFeed("club-1", "user-1", false);

    expect(feed.map((i) => i.title)).toEqual(["Visible Race", "Hidden Race"]);
  });

  it("excludes eboard meetings when there is no eboard channel yet", async () => {
    mockFetchEvents.mockResolvedValue([]);
    mockFetchRaces.mockResolvedValue([]);
    mockFetchEboardChannel.mockResolvedValue(null);

    const feed = await fetchCalendarFeed("club-1", "user-1", true);

    expect(feed).toEqual([]);
    expect(mockFetchMeetings).not.toHaveBeenCalled();
  });

  it("excludes eboard meetings when the caller isn't a member of the channel", async () => {
    mockFetchEvents.mockResolvedValue([]);
    mockFetchRaces.mockResolvedValue([]);
    mockFetchEboardChannel.mockResolvedValue({
      id: "eboard-1",
      clubId: "club-1",
      name: "Eboard & Council",
      description: null,
      avatarUrl: null,
      channelId: "channel-1",
      isMember: false,
      requestStatus: null,
    });

    const feed = await fetchCalendarFeed("club-1", "user-1", false);

    expect(feed).toEqual([]);
    expect(mockFetchMeetings).not.toHaveBeenCalled();
  });

  it("includes eboard meetings when the caller is a member, and sorts the merged feed ascending by date", async () => {
    mockFetchEvents.mockResolvedValue([
      { ...baseEvent, id: "e1", eventType: "practice", title: "Practice", startAt: "2026-05-10T18:00:00.000Z" },
    ]);
    mockFetchRaces.mockResolvedValue([
      { id: "r1", clubId: "club-1", name: "Spring Race", eventDate: "2026-05-05", avatarUrl: null, pinned: false, access: "admin", requestStatus: null },
    ]);
    mockFetchEboardChannel.mockResolvedValue({
      id: "eboard-1",
      clubId: "club-1",
      name: "Eboard & Council",
      description: null,
      avatarUrl: null,
      channelId: "channel-1",
      isMember: true,
      requestStatus: null,
    });
    mockFetchMeetings.mockResolvedValue([
      { ...baseMeeting, id: "m1", title: "Officer sync", meetingAt: "2026-05-01T12:00:00.000Z" },
    ]);

    const feed = await fetchCalendarFeed("club-1", "user-1", true);

    expect(feed.map((i) => i.title)).toEqual(["Officer sync", "Spring Race", "Practice"]);
    expect(feed.map((i) => i.kind)).toEqual(["meeting", "race", "event"]);
  });

  it("merges polls from every scope the caller can access, dated by closesAt (falling back to createdAt), with isOpen reflecting is_closed/closes_at", async () => {
    mockFetchEvents.mockResolvedValue([]);
    mockFetchRaces.mockResolvedValue([
      { id: "r1", clubId: "club-1", name: "Visible Race", eventDate: "2026-05-05", avatarUrl: null, pinned: false, access: "member", requestStatus: null },
      { id: "r2", clubId: "club-1", name: "Hidden Race", eventDate: "2026-05-06", avatarUrl: null, pinned: false, access: "none", requestStatus: "pending" },
    ]);
    mockFetchEboardChannel.mockResolvedValue({
      id: "eboard-1",
      clubId: "club-1",
      name: "Eboard & Council",
      description: null,
      avatarUrl: null,
      channelId: "channel-1",
      isMember: true,
      requestStatus: null,
    });
    mockFetchMeetings.mockResolvedValue([]);

    // closesAt values for the still-open polls are computed relative to
    // Date.now() (like formatCountdown's own tests) rather than hardcoded
    // to a fixed calendar date, so isPollEffectivelyClosed's `closesAt <
    // now()` comparison is correct no matter when this suite actually
    // runs. createdAt values stay fixed, safely-past dates — they're only
    // used as the sort key for the two no-deadline polls, never compared
    // against "now".
    const futureClosesAt1 = new Date(Date.now() + 40 * 86400000).toISOString();
    const futureClosesAt2 = new Date(Date.now() + 41 * 86400000).toISOString();

    mockFetchPolls.mockImplementation(async (scope) => {
      if (scope.type === "club") {
        return [
          {
            id: "club-poll-open",
            question: "Club poll, open with a deadline",
            isClosed: false,
            closesAt: futureClosesAt1,
            optionCount: 2,
            voteCount: 0,
            hasVoted: false,
            createdAt: "2026-04-01T00:00:00.000Z",
          },
          {
            id: "club-poll-closed",
            question: "Club poll, manually closed",
            isClosed: true,
            closesAt: null,
            optionCount: 2,
            voteCount: 0,
            hasVoted: false,
            createdAt: "2026-04-02T00:00:00.000Z",
          },
        ];
      }
      if (scope.type === "race" && scope.raceId === "r1") {
        return [
          {
            id: "race-poll",
            question: "Race poll, no deadline",
            isClosed: false,
            closesAt: null,
            optionCount: 2,
            voteCount: 0,
            hasVoted: false,
            createdAt: "2026-04-03T00:00:00.000Z",
          },
        ];
      }
      if (scope.type === "eboard") {
        return [
          {
            id: "eboard-poll",
            question: "Eboard poll",
            isClosed: false,
            closesAt: futureClosesAt2,
            optionCount: 2,
            voteCount: 0,
            hasVoted: false,
            createdAt: "2026-04-04T00:00:00.000Z",
          },
        ];
      }
      return [];
    });

    const feed = await fetchCalendarFeed("club-1", "user-1", false);
    const polls = feed.filter((i) => i.kind === "poll");

    // Every race's polls are requested now, including Hidden Race's — the
    // race item itself is no longer access-gated on the calendar, and
    // fetchPolls is called uniformly regardless (RLS enforces read access
    // server-side; the mock above returns [] for r2 since no case matches
    // raceId: "r2").
    expect(mockFetchPolls).toHaveBeenCalledWith(expect.objectContaining({ type: "race", raceId: "r2" }), expect.anything());

    expect(polls.map((p) => p.title)).toEqual([
      "Club poll, manually closed", // dated by createdAt (2026-04-02) — closesAt null, earliest
      "Race poll, no deadline", // dated by createdAt (2026-04-03) — closesAt null
      "Club poll, open with a deadline", // dated by closesAt (2026-05-03)
      "Eboard poll", // dated by closesAt (2026-05-04)
    ]);
    expect(polls.map((p) => p.isOpen)).toEqual([false, true, true, true]);
    expect(polls.every((p) => p.badgeLabel === "Poll" && p.hasTime === true)).toBe(true);
    expect(polls.find((p) => p.id === "poll:race-poll")?.path).toBe("/clubs/club-1/race/r1/polls/race-poll");
    expect(polls.find((p) => p.id === "poll:eboard-poll")?.path).toBe("/clubs/club-1/eboard/polls/eboard-poll");
    expect(polls.find((p) => p.id === "poll:club-poll-open")?.path).toBe("/clubs/club-1/polls/club-poll-open");
  });
});

describe("fetchGlobalCalendarFeed", () => {
  it("merges every club's own feed, tags each item with its club name, and sorts the combined result", async () => {
    mockFetchMyClubs.mockResolvedValue([
      { id: "club-1", name: "Track Club", description: null, sport: null, invite_code: "AAA", avatarUrl: null, role: "owner" },
      { id: "club-2", name: "Swim Club", description: null, sport: null, invite_code: "BBB", avatarUrl: null, role: "member" },
    ]);
    mockFetchEboardChannel.mockResolvedValue(null);
    mockFetchEvents.mockImplementation(async (clubId) =>
      clubId === "club-1"
        ? [{ ...baseEvent, id: "e1", clubId, eventType: "practice", title: "Track practice", startAt: "2026-05-10T18:00:00.000Z" }]
        : [{ ...baseEvent, id: "e2", clubId, eventType: "practice", title: "Swim practice", startAt: "2026-05-01T18:00:00.000Z" }]
    );
    mockFetchRaces.mockResolvedValue([]);

    const feed = await fetchGlobalCalendarFeed("user-1");

    expect(feed.map((i) => ({ title: i.title, clubName: i.clubName }))).toEqual([
      { title: "Swim practice", clubName: "Swim Club" },
      { title: "Track practice", clubName: "Track Club" },
    ]);
  });
});
