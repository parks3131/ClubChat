import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { makeBackHeaderLeft } from "../../../../components/BackHeaderButton";
import { useAuth } from "../../../../contexts/AuthProvider";
import { supabase } from "../../../../lib/supabase";
import type { ClubRole } from "../../../../types/database";

interface ClubContextValue {
  clubId: string;
  channelId: string;
  name: string;
  inviteCode: string;
  role: ClubRole;
}

const ClubContext = createContext<ClubContextValue | undefined>(undefined);

export function useClub() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error("useClub must be used within a club route");
  return ctx;
}

export default function ClubLayout() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [club, setClub] = useState<ClubContextValue | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      const [{ data: membership }, { data: clubRow }, { data: channelRow }] = await Promise.all([
        supabase
          .from("club_members")
          .select("role")
          .eq("club_id", clubId)
          .eq("user_id", session!.user.id)
          .single(),
        supabase.from("clubs").select("name, invite_code").eq("id", clubId).single(),
        supabase
          .from("channels")
          .select("id")
          .eq("club_id", clubId)
          .is("race_id", null)
          .is("eboard_channel_id", null)
          .single(),
      ]);

      if (!cancelled && membership && clubRow && channelRow) {
        setClub({
          clubId,
          channelId: channelRow.id,
          name: clubRow.name,
          inviteCode: clubRow.invite_code,
          role: membership.role,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clubId, session]);

  if (!club) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  const clubScreenOptions = {
    headerShown: true,
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
    <ClubContext.Provider value={club}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{ ...clubScreenOptions, title: club.name, headerLeft: makeBackHeaderLeft(router, "/clubs") }}
        />
        <Stack.Screen
          name="chat"
          options={{
            ...clubScreenOptions,
            title: "Chat",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`),
          }}
        />
        <Stack.Screen
          name="calendar"
          options={{
            ...clubScreenOptions,
            title: "Calendar",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`),
          }}
        />
        <Stack.Screen name="routines" options={{ headerShown: false }} />
        <Stack.Screen name="polls" options={{ headerShown: false }} />
        <Stack.Screen name="races" options={{ headerShown: false }} />
        <Stack.Screen name="eboard" options={{ headerShown: false }} />
        <Stack.Screen
          name="highlights"
          options={{ title: "Highlights", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/chat`) }}
        />
        <Stack.Screen name="club-profile" options={{ headerShown: false }} />
        <Stack.Screen name="race/[raceId]" options={{ headerShown: false }} />
        <Stack.Screen
          name="event/[eventId]"
          options={{ title: "Event", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/calendar`) }}
        />
        <Stack.Screen
          name="event/create"
          options={{
            title: "New event",
            presentation: "modal",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/calendar`),
          }}
        />
        <Stack.Screen
          name="member/[userId]"
          options={{ title: "Member", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/club-profile`) }}
        />
      </Stack>
    </ClubContext.Provider>
  );
}
