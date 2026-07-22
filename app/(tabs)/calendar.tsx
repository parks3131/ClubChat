import { useNavigation } from "expo-router";
import { useLayoutEffect } from "react";
import CalendarScreen from "../../components/CalendarScreen";
import { useCurrentClub } from "../../contexts/CurrentClubProvider";

// Bottom-tab Calendar (founder wireframe, task after #47): scoped to
// whichever club is currently active (per CurrentClubProvider, set by
// clubs/[clubId]/_layout.tsx) — anywhere nested under that club, not just
// its hub screen — or the cross-club merged feed when no club is active
// (e.g. sitting on the Clubs list, Notifications, or Profile).
export default function CalendarTabScreen() {
  const { currentClub } = useCurrentClub();
  const navigation = useNavigation();

  // headerTitle only, deliberately not `title` — `title` also drives the
  // bottom tab bar's own label (via Tabs.Screen's `options.title` in
  // (tabs)/_layout.tsx), which should stay a plain, short "Calendar"
  // regardless of which club is active.
  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: currentClub ? `${currentClub.name} Calendar` : "Calendar" });
  }, [currentClub, navigation]);

  return currentClub ? (
    <CalendarScreen mode="club" clubId={currentClub.clubId} isAdmin={currentClub.isAdmin} />
  ) : (
    <CalendarScreen mode="global" />
  );
}
