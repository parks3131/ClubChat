import { Tabs, useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { useClub } from "../_layout";

export default function ClubTabsLayout() {
  const club = useClub();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: () => (
          <TouchableOpacity onPress={() => router.push(`/clubs/${club.clubId}/club-profile`)}>
            <Text style={{ fontSize: 17, fontWeight: "600" }}>{club.name}</Text>
          </TouchableOpacity>
        ),
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
