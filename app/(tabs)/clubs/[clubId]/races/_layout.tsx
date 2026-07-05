import { Stack, useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { makeBackHeaderLeft } from "../../../../../components/BackHeaderButton";
import { useClub } from "../_layout";

// Own nested Stack (same shape as routines/_layout.tsx) since "create" is
// a separate sub-screen with its own back-fallback — only "index" needs
// the shared tappable-club-name + invite-code header.
export default function RacesStackLayout() {
  const club = useClub();
  const router = useRouter();

  const clubScreenOptions = {
    headerTitle: () => (
      <TouchableOpacity onPress={() => router.push(`/clubs/${club.clubId}/club-profile`)}>
        <Text style={{ fontSize: 17, fontWeight: "600" as const }}>{club.name}</Text>
      </TouchableOpacity>
    ),
    headerRight: () =>
      club.role === "admin" ? (
        <Text style={{ marginRight: 16, color: "#2563eb", fontWeight: "600" as const }}>
          Invite: {club.inviteCode}
        </Text>
      ) : null,
  };

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          ...clubScreenOptions,
          title: "Races & Meets",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`),
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: "New race channel",
          presentation: "modal",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/races`),
        }}
      />
    </Stack>
  );
}
