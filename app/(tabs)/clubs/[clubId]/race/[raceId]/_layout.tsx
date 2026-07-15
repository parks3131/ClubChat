import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { makeBackHeaderLeft } from "../../../../../../components/BackHeaderButton";
import { LoadError } from "../../../../../../components/LoadError";
import { colors, typography } from "../../../../../../constants/theme";
import { useAuth } from "../../../../../../contexts/AuthProvider";
import { fetchRace } from "../../../../../../lib/races";
import { supabase } from "../../../../../../lib/supabase";
import { useClub } from "../../_layout";

interface RaceContextValue {
  raceId: string;
  clubId: string;
  name: string;
  eventDate: string;
  channelId: string;
  isAdmin: boolean;
}

const RaceContext = createContext<RaceContextValue | undefined>(undefined);

export function useRace() {
  const ctx = useContext(RaceContext);
  if (!ctx) throw new Error("useRace must be used within a race route");
  return ctx;
}

// Mirrors [clubId]/_layout.tsx's shape: fetch race + this user's access
// once, expose via context. A club admin always has access (no separate
// "race admin" role — see migration 0016_races.sql); a regular member
// needs an approved race_members row. Anyone without either is bounced
// back to the races list rather than shown a locked/partial hub — the
// list screen is where requesting access actually happens.
export default function RaceLayout() {
  const { raceId } = useLocalSearchParams<{ raceId: string }>();
  const club = useClub();
  const { session } = useAuth();
  const router = useRouter();
  const [race, setRace] = useState<RaceContextValue | null>(null);
  const [denied, setDenied] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadFailed(false);

    async function load() {
      try {
        const isClubAdmin = club.role === "admin";

        // Check membership *before* fetchRace, not alongside it — fetchRace
        // reads the race's channel, which RLS blocks for a non-member/non-
        // admin (is_channel_member fails), throwing rather than returning
        // an empty result. Calling it in parallel with the membership check
        // meant that throw happened before this function ever got to the
        // "not authorized, redirect" branch, so an unauthorized visitor just
        // saw a permanent spinner instead of being bounced to the races list.
        if (!isClubAdmin) {
          const membership = await supabase
            .from("race_members")
            .select("user_id")
            .eq("race_id", raceId)
            .eq("user_id", session!.user.id)
            .maybeSingle();

          if (cancelled) return;

          if (membership.error) {
            setLoadFailed(true);
            return;
          }

          if (!membership.data) {
            setDenied(true);
            return;
          }
        }

        const raceDetail = await fetchRace(raceId);
        if (cancelled) return;

        setRace({
          raceId,
          clubId: raceDetail.clubId,
          name: raceDetail.name,
          eventDate: raceDetail.eventDate,
          channelId: raceDetail.channelId,
          isAdmin: isClubAdmin,
        });
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [raceId, club.role, session, retryToken]);

  useEffect(() => {
    if (!denied) return;
    router.replace(`/clubs/${club.clubId}/races`);
  }, [denied, club.clubId, router]);

  if (loadFailed) {
    return <LoadError message="Couldn't load this race." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (!race) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Styling mirrors [clubId]/_layout.tsx's clubScreenOptions exactly
  // (Anton headline + Energetic Orange) — this nested Stack has its own
  // headerShown:false entry in the parent layout, so it never inherited
  // that styling for free and had drifted to the plain default.
  const raceScreenOptions = {
    headerShown: true,
    headerStyle: { backgroundColor: colors.surfaceContainerLow },
    headerTitle: () => (
      <TouchableOpacity onPress={() => router.push(`/clubs/${club.clubId}/race/${race.raceId}/profile`)}>
        <Text style={{ ...typography.headlineLgMobile, fontSize: 17, color: colors.primary }}>{race.name}</Text>
      </TouchableOpacity>
    ),
  };

  return (
    <RaceContext.Provider value={race}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            ...raceScreenOptions,
            title: race.name,
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/races`),
          }}
        />
        <Stack.Screen
          name="chat"
          options={{
            ...raceScreenOptions,
            title: "Chat",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}`),
          }}
        />
        <Stack.Screen
          name="highlights"
          options={{
            title: "Highlights",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}/chat`),
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            ...raceScreenOptions,
            title: race.name,
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}`),
          }}
        />
        <Stack.Screen
          name="roster"
          options={{
            title: "Members",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}/profile`),
          }}
        />
        <Stack.Screen
          name="location"
          options={{
            ...raceScreenOptions,
            title: "Meet Information",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}`),
          }}
        />
        <Stack.Screen
          name="polls/index"
          options={{
            ...raceScreenOptions,
            title: "Polls",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}`),
          }}
        />
        <Stack.Screen
          name="polls/create"
          options={{
            title: "New poll",
            presentation: "modal",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}/polls`),
          }}
        />
        <Stack.Screen
          name="polls/[pollId]"
          options={{
            title: "Poll",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}/polls`),
          }}
        />
        <Stack.Screen
          name="carpool"
          options={{
            ...raceScreenOptions,
            title: "Car Assignments & Groups",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}`),
          }}
        />
        <Stack.Screen
          name="gallery"
          options={{
            title: "Gallery",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}/profile`),
          }}
        />
      </Stack>
    </RaceContext.Provider>
  );
}
