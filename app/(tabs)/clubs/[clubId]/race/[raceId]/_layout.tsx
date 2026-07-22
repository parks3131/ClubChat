import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
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
  // null until isMember — see lib/races.ts's fetchRace.
  channelId: string | null;
  // Club Admin/Owner: race-management authority (approve/deny requests,
  // add/remove members, edit meet info, pin/announce) — creator + any
  // Admin/Owner, per the race-channel rework. No longer implies chat
  // access on its own.
  isManager: boolean;
  // A real race_members row — required for chat/hub access. A manager
  // who wasn't added still needs this to be true, same as anyone else.
  isMember: boolean;
  avatarUrl: string | null;
}

const RaceContext = createContext<RaceContextValue | undefined>(undefined);

export function useRace() {
  const ctx = useContext(RaceContext);
  if (!ctx) throw new Error("useRace must be used within a race route");
  return ctx;
}

// Mirrors [clubId]/_layout.tsx's shape: fetch race + this user's access
// once, expose via context. Race-channel rework: a club Admin/Owner
// (isManager) can always reach this Stack — to manage the roster, approve
// requests, add people — but no longer gets chat/hub access for free; that
// still requires a real race_members row (isMember), exactly like a plain
// Member. Anyone with neither is bounced back to the races list, mirroring
// eboard/_layout.tsx's "visible to managers, membership is separate" gate.
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
        const isManager = club.isAdmin;

        // Always check the real roster row now, even for a manager — it
        // no longer implies chat access. fetchRace's channel read is safe
        // to call regardless (maybeSingle, resolves to a null channelId
        // when RLS can't see it) rather than needing to be skipped/ordered
        // around like the old admin-implies-access version required.
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

        const isMember = !!membership.data;

        if (!isManager && !isMember) {
          setDenied(true);
          return;
        }

        const raceDetail = await fetchRace(raceId);
        if (cancelled) return;

        setRace({
          raceId,
          clubId: raceDetail.clubId,
          name: raceDetail.name,
          eventDate: raceDetail.eventDate,
          channelId: raceDetail.channelId,
          isManager,
          isMember,
          avatarUrl: raceDetail.avatarUrl,
        });
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [raceId, club.isAdmin, session, retryToken]);

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
      <TouchableOpacity
        onPress={() => router.push(`/clubs/${club.clubId}/race/${race.raceId}/profile`)}
        style={{ flexDirection: "row" as const, alignItems: "center", gap: 8 }}
      >
        {race.avatarUrl ? (
          <Image source={{ uri: race.avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.surfaceContainerHigh,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...typography.labelSm, fontSize: 16, color: colors.primary }}>
              {race.name.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
        )}
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
            // ChatScreen hides this native header entirely (headerShown:
            // false) and uses its own `backFallback` prop instead — this
            // never actually renders, but points at the races list (not
            // the race hub, which now auto-forwards back here) for
            // consistency with that prop.
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/races`),
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
          name="edit"
          options={{
            title: "Edit Race",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}/profile`),
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
            // Reached via chat's header quick-nav grid now, not the old
            // hub grid — back goes straight there, not through the hub
            // (which would just auto-forward back to chat anyway).
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}/chat`),
          }}
        />
        <Stack.Screen
          name="polls/index"
          options={{
            ...raceScreenOptions,
            title: "Polls",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}/chat`),
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
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/race/${race.raceId}/chat`),
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
