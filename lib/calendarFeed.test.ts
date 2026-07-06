import { fetchCalendarFeed } from "./calendarFeed";
import { fetchEvents } from "./calendar";
import { fetchEboardChannel, fetchMeetings } from "./eboard";
import { fetchRaces } from "./races";

jest.mock("./calendar");
jest.mock("./eboard");
jest.mock("./races");

const mockFetchEvents = fetchEvents as jest.MockedFunction<typeof fetchEvents>;
const mockFetchRaces = fetchRaces as jest.MockedFunction<typeof fetchRaces>;
const mockFetchEboardChannel = fetchEboardChannel as jest.MockedFunction<typeof fetchEboardChannel>;
const mockFetchMeetings = fetchMeetings as jest.MockedFunction<typeof fetchMeetings>;

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
  mockFetchRaces.mockReset();
  mockFetchEboardChannel.mockReset();
  mockFetchMeetings.mockReset();
});

describe("fetchCalendarFeed", () => {
  it("excludes races the caller has no access to", async () => {
    mockFetchEvents.mockResolvedValue([]);
    mockFetchRaces.mockResolvedValue([
      { id: "r1", clubId: "club-1", name: "Visible Race", eventDate: "2026-05-01", access: "member", requestStatus: null },
      { id: "r2", clubId: "club-1", name: "Hidden Race", eventDate: "2026-05-02", access: "none", requestStatus: "pending" },
    ]);
    mockFetchEboardChannel.mockResolvedValue(null);

    const feed = await fetchCalendarFeed("club-1", "user-1", false);

    expect(feed.map((i) => i.title)).toEqual(["Visible Race"]);
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
      { id: "r1", clubId: "club-1", name: "Spring Race", eventDate: "2026-05-05", access: "admin", requestStatus: null },
    ]);
    mockFetchEboardChannel.mockResolvedValue({
      id: "eboard-1",
      clubId: "club-1",
      name: "Eboard & Council",
      description: null,
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
});
