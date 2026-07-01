import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useClub } from "../_layout";

export default function ClubTabsLayout() {
  const club = useClub();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: club.name,
        headerRight: () =>
          club.role === "admin" ? (
            <Text style={{ marginRight: 16, color: "#2563eb", fontWeight: "600" }}>
              Invite: {club.inviteCode}
            </Text>
          ) : null,
      }}
    >
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="routines" options={{ title: "Routines" }} />
    </Tabs>
  );
}
