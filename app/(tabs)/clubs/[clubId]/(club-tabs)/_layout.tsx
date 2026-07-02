import { Tabs, useLocalSearchParams, useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { useClub } from "../_layout";

export default function ClubTabsLayout() {
  const club = useClub();
  const router = useRouter();
  // Cross-tab pushes (e.g. from Profile's "Your clubs" list) don't leave
  // real back-history to the origin tab — even the browser's own back
  // button lands on /clubs, not /profile, because switching a nested
  // tab's focused route this way doesn't preserve the previous tab's
  // stack entry. So the origin is passed explicitly instead of relying
  // on canGoBack()/back().
  const { from } = useLocalSearchParams<{ from?: string }>();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => {
              if (from === "profile") router.replace("/profile");
              else if (router.canGoBack()) router.back();
              else router.replace("/clubs");
            }}
            style={{ marginLeft: 12, padding: 4 }}
          >
            <Text style={{ fontSize: 24, color: "#2563eb" }}>‹</Text>
          </TouchableOpacity>
        ),
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
