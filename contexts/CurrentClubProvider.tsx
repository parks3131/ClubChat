import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";

export interface CurrentClub {
  clubId: string;
  name: string;
  isAdmin: boolean;
}

interface CurrentClubContextValue {
  currentClub: CurrentClub | null;
  setCurrentClub: (club: CurrentClub | null) => void;
}

const CurrentClubContext = createContext<CurrentClubContextValue | undefined>(undefined);

// Tracks "which club is the user currently inside," readable from outside
// that club's own nested Stack — specifically by the bottom-tab Calendar
// screen (app/(tabs)/calendar.tsx), which needs this to decide between a
// single club's feed and the cross-club merged one. clubs/[clubId]/_layout.tsx
// is the sole writer: it sets this once the club loads, and clears it back
// to null on unmount (leaving that club's stack entirely, from anywhere
// nested under it — chat, races, etc., not just the hub screen).
export function CurrentClubProvider({ children }: PropsWithChildren) {
  const [currentClub, setCurrentClub] = useState<CurrentClub | null>(null);

  const value = useMemo(() => ({ currentClub, setCurrentClub }), [currentClub]);

  return <CurrentClubContext.Provider value={value}>{children}</CurrentClubContext.Provider>;
}

export function useCurrentClub() {
  const ctx = useContext(CurrentClubContext);
  if (!ctx) throw new Error("useCurrentClub must be used within a CurrentClubProvider");
  return ctx;
}
