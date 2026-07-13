import { addDays, combineToIso, formatCountdown, getMonday, splitIso, toDateKey } from "./dates";

describe("toDateKey", () => {
  it("formats a date as YYYY-MM-DD in local time", () => {
    expect(toDateKey(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("pads single-digit months and days", () => {
    expect(toDateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});

describe("getMonday", () => {
  it("returns the same date when given a Monday", () => {
    // 2026-03-02 is a Monday.
    expect(toDateKey(getMonday(new Date(2026, 2, 2)))).toBe("2026-03-02");
  });

  it("rolls a mid-week date back to that week's Monday", () => {
    // 2026-03-05 is a Thursday.
    expect(toDateKey(getMonday(new Date(2026, 2, 5)))).toBe("2026-03-02");
  });

  it("rolls a Sunday back 6 days to the *preceding* Monday, not forward", () => {
    // 2026-03-08 is a Sunday — the day === 0 branch.
    expect(toDateKey(getMonday(new Date(2026, 2, 8)))).toBe("2026-03-02");
  });
});

describe("addDays", () => {
  it("adds a positive number of days", () => {
    expect(toDateKey(addDays(new Date(2026, 2, 5), 3))).toBe("2026-03-08");
  });

  it("subtracts with a negative number of days", () => {
    expect(toDateKey(addDays(new Date(2026, 2, 5), -3))).toBe("2026-03-02");
  });

  it("rolls over a month boundary", () => {
    expect(toDateKey(addDays(new Date(2026, 2, 30), 3))).toBe("2026-04-02");
  });
});

describe("splitIso / combineToIso", () => {
  it("round-trips a date/time through combine then split", () => {
    const iso = combineToIso("2026-03-05", "14:30");
    expect(iso).not.toBeNull();
    expect(splitIso(iso!)).toEqual({ date: "2026-03-05", time: "14:30" });
  });

  it("combineToIso returns null for a malformed date", () => {
    expect(combineToIso("03-05-2026", "14:30")).toBeNull();
  });

  it("combineToIso returns null for a malformed time", () => {
    expect(combineToIso("2026-03-05", "2:30pm")).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("returns ENDED for a timestamp already in the past", () => {
    expect(formatCountdown(new Date(Date.now() - 1000).toISOString())).toBe("ENDED");
  });

  it("returns ENDING SOON for under an hour away", () => {
    expect(formatCountdown(new Date(Date.now() + 30 * 60000).toISOString())).toBe("ENDING SOON");
  });

  it("pluralizes hours correctly", () => {
    expect(formatCountdown(new Date(Date.now() + 5 * 3600000).toISOString())).toBe("5 HOURS LEFT");
    expect(formatCountdown(new Date(Date.now() + 1 * 3600000 + 60000).toISOString())).toBe("1 HOUR LEFT");
  });

  it("switches to days once 24 hours away, and pluralizes correctly", () => {
    expect(formatCountdown(new Date(Date.now() + 2 * 86400000).toISOString())).toBe("2 DAYS LEFT");
    expect(formatCountdown(new Date(Date.now() + 1 * 86400000 + 60000).toISOString())).toBe("1 DAY LEFT");
  });
});
