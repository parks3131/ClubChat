import { formatDateOfBirth } from "./profile";

describe("formatDateOfBirth", () => {
  it("returns 'Not set' for null", () => {
    expect(formatDateOfBirth(null)).toBe("Not set");
  });

  it("does not shift the date a day earlier in timezones behind UTC", () => {
    // Regression test for the bug this function was specifically written
    // to avoid (SPEC.md section 6): new Date("1998-01-01") parses as UTC
    // midnight, which renders as Dec 31, 1997 in any timezone behind UTC.
    // formatDateOfBirth builds the Date from local y/m/d components
    // instead, so the year/month/day here must match the input exactly.
    const formatted = formatDateOfBirth("1998-01-01");
    expect(formatted).toContain("1998");
    expect(formatted).not.toContain("1997");
  });
});
