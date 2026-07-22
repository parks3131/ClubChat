import {
  addDays,
  addMonths,
  combineToIso,
  formatCountdown,
  getMonday,
  isPastDateOnly,
  isPastInstant,
  isSameInstant,
  splitIso,
  toDateKey,
} from "./dates";

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

describe("addMonths", () => {
  it("adds a positive number of months", () => {
    expect(toDateKey(addMonths(new Date(2026, 2, 5), 2))).toBe("2026-05-01");
  });

  it("subtracts with a negative number of months", () => {
    expect(toDateKey(addMonths(new Date(2026, 2, 5), -2))).toBe("2026-01-01");
  });

  it("rolls over a year boundary", () => {
    expect(toDateKey(addMonths(new Date(2026, 11, 15), 1))).toBe("2027-01-01");
  });

  it("doesn't overflow into the wrong month for a day that doesn't exist in the target month", () => {
    // Jan 31 + 1 month would land on "Feb 31", which JS Date normalizes
    // forward to Mar 3 — addMonths resets the day-of-month to 1 first so
    // this always lands in February instead.
    expect(toDateKey(addMonths(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
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

describe("isPastInstant", () => {
  it("returns true for a timestamp already in the past", () => {
    expect(isPastInstant(new Date(Date.now() - 60000).toISOString())).toBe(true);
  });

  it("returns false for a timestamp in the future", () => {
    expect(isPastInstant(new Date(Date.now() + 60000).toISOString())).toBe(false);
  });
});

describe("isPastDateOnly", () => {
  it("returns true for yesterday", () => {
    expect(isPastDateOnly(toDateKey(addDays(new Date(), -1)))).toBe(true);
  });

  it("returns false for today", () => {
    expect(isPastDateOnly(toDateKey(new Date()))).toBe(false);
  });

  it("returns false for a future date", () => {
    expect(isPastDateOnly(toDateKey(addDays(new Date(), 1)))).toBe(false);
  });
});

describe("isSameInstant", () => {
  it("treats a +00:00-offset string and a Z-suffixed string for the same instant as equal", () => {
    // Mirrors a real round trip: Supabase/PostgREST returns timestamptz
    // as "...+00:00", while combineToIso always produces "...Z".
    expect(isSameInstant("2026-03-05T14:30:00+00:00", "2026-03-05T14:30:00.000Z")).toBe(true);
  });

  it("returns false for genuinely different instants", () => {
    expect(isSameInstant("2026-03-05T14:30:00.000Z", "2026-03-05T15:30:00.000Z")).toBe(false);
  });

  it("treats two nulls as equal, and null vs a value as unequal", () => {
    expect(isSameInstant(null, null)).toBe(true);
    expect(isSameInstant(null, "2026-03-05T14:30:00.000Z")).toBe(false);
    expect(isSameInstant("2026-03-05T14:30:00.000Z", null)).toBe(false);
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
    // +60000ms buffer above the exact hour mark on every case here — sitting
    // exactly on a boundary (e.g. `Date.now() + 5 * 3600000` with zero
    // margin) is genuinely flaky: formatCountdown recomputes Date.now()
    // internally, and any execution delay between building the timestamp
    // here and that internal call (real on a loaded CI runner) pushes the
    // diff a hair under the threshold, flooring to one hour less. Caught
    // live by a real CI failure, not hypothetical.
    expect(formatCountdown(new Date(Date.now() + 5 * 3600000 + 60000).toISOString())).toBe("5 HOURS LEFT");
    expect(formatCountdown(new Date(Date.now() + 1 * 3600000 + 60000).toISOString())).toBe("1 HOUR LEFT");
  });

  it("switches to days once 24 hours away, and pluralizes correctly", () => {
    // Same boundary-buffer reasoning as above.
    expect(formatCountdown(new Date(Date.now() + 2 * 86400000 + 60000).toISOString())).toBe("2 DAYS LEFT");
    expect(formatCountdown(new Date(Date.now() + 1 * 86400000 + 60000).toISOString())).toBe("1 DAY LEFT");
  });
});
