import { MaterialIcons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { colors, typography } from "../../constants/theme";
import { useCurrentClub } from "../../contexts/CurrentClubProvider";
import { useNotifications } from "../../contexts/NotificationsProvider";

// Same branded look as the Clubs tab's own "ClubChat" header (see
// clubs/_layout.tsx) — Calendar and Notifications have no nested Stack of
// their own to host it, so it's applied directly at this Tabs level
// instead. Clubs/Profile deliberately don't use this here: each has its
// own nested Stack that already shows it on just its root screen, and
// showing it here too would duplicate it on every subpage.
const brandedHeaderOptions = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.surfaceContainerLow },
  headerTitleStyle: { ...typography.headlineLgMobile, fontSize: 20, color: colors.primary },
  headerTitleAlign: "left" as const,
  headerShadowVisible: false,
};

export default function TabsLayout() {
  const { unreadCount } = useNotifications();
  const { currentClub } = useCurrentClub();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSecondaryContainer,
        tabBarStyle: { backgroundColor: colors.surfaceContainerLow },
        tabBarLabelStyle: { ...typography.labelSm, textTransform: "uppercase" },
      }}
    >
      <Tabs.Screen
        name="clubs"
        options={{ title: "Clubs", tabBarIcon: ({ color, size }) => <MaterialIcons name="groups" size={size} color={color} /> }}
        // Context-aware, mirroring the Calendar tab's currentClub check:
        // while inside a club (anywhere in its nested stack — chat, races,
        // highlights, etc., not just the hub screen), tapping Clubs jumps
        // straight to that club's hub instead of resetting to the Main
        // list. Tapping it again from the hub (already the shallowest stop
        // once inside a club) instead goes to the Main list, same as the
        // `?from=clubsTab` override index.tsx applies to its own back
        // button for this exact entry path. No active club falls back to
        // the original blanket reset from SPEC.md section 6.
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            if (!currentClub) {
              router.replace("/clubs");
              return;
            }
            const clubHubPath = `/clubs/${currentClub.clubId}`;
            router.replace(pathname === clubHubPath ? "/clubs" : `${clubHubPath}?from=clubsTab`);
          },
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          ...brandedHeaderOptions,
          title: "Calendar",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="calendar-month" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          ...brandedHeaderOptions,
          title: "Notifications",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="notifications" size={size} color={color} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.error },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color, size }) => <MaterialIcons name="person" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
