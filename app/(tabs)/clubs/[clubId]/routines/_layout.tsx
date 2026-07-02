import { Stack, useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { makeBackHeaderLeft } from "../../../../../components/BackHeaderButton";
import { useClub } from "../_layout";

// Its own nested Stack (same shape as club-profile/_layout.tsx) rather than
// flat entries in the parent layout, since routines needs several
// sub-screens (activity-type picker, create/edit form, detail) each with
// their own title/back-fallback — only "index" needs the shared
// tappable-club-name + invite-code header the hub/chat/calendar share.
export default function RoutinesStackLayout() {
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
          title: "Routines",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`),
        }}
      />
      <Stack.Screen
        name="activity-type"
        options={{ title: "Add workout", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/routines`) }}
      />
      <Stack.Screen
        name="workout/create"
        options={{
          title: "New workout",
          presentation: "modal",
          headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/routines`),
        }}
      />
      <Stack.Screen
        name="workout/[workoutId]"
        options={{ title: "Workout", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/routines`) }}
      />
    </Stack>
  );
}
