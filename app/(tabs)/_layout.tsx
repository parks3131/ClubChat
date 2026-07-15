import { MaterialIcons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { colors, typography } from "../../constants/theme";
import { useNotifications } from "../../contexts/NotificationsProvider";

export default function TabsLayout() {
  const { unreadCount } = useNotifications();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surfaceContainerLow },
        headerTitleStyle: { ...typography.headlineLgMobile, fontSize: 20, color: colors.primary },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSecondaryContainer,
        tabBarStyle: { backgroundColor: colors.surfaceContainerLow },
        tabBarLabelStyle: { ...typography.labelSm, textTransform: "uppercase" },
      }}
    >
      <Tabs.Screen
        name="clubs"
        options={{ title: "Clubs", tabBarIcon: ({ color, size }) => <MaterialIcons name="groups" size={size} color={color} /> }}
        // Tapping the Clubs tab always resets straight to the Main clubs
        // list, no matter how deep this tab's own Stack currently is or
        // which tab you're coming from — a blanket version of the
        // `router.replace("/clubs")` reset SPEC.md section 6 already
        // documents for the narrower ?from=profile case.
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.replace("/clubs");
          },
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
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
