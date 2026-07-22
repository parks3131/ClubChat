import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import { makeBackHeaderLeft } from "../../../../components/BackHeaderButton";
import { LoadError } from "../../../../components/LoadError";
import { colors, typography } from "../../../../constants/theme";
import { useAuth } from "../../../../contexts/AuthProvider";
import { useCurrentClub } from "../../../../contexts/CurrentClubProvider";
import { supabase } from "../../../../lib/supabase";
import type { ClubRole } from "../../../../types/database";

interface ClubContextValue {
  clubId: string;
  channelId: string;
  name: string;
  avatarUrl: string | null;
  inviteCode: string;
  role: ClubRole;
  isCreator: boolean;
  // Derived from role: "owner" | "admin" all count as admin-tier for the
  // ~20 call sites across this app that used to compare role === "admin"
  // directly — Owner is a strict superset of Admin for every permission
  // except remove_admin/transfer_ownership, which check isOwner instead.
  isAdmin: boolean;
  isOwner: boolean;
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
  const { setCurrentClub } = useCurrentClub();
  const [club, setClub] = useState<ClubContextValue | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  // Makes "which club is the user in" readable from the bottom-tab Calendar
  // screen, which sits outside this Stack entirely. Cleared on unmount —
  // leaving this club's stack (from anywhere nested under it, not just the
  // hub screen) clears it back to null, same as walking out of any room.
  useEffect(() => {
    if (!club) return;
    setCurrentClub({ clubId: club.clubId, name: club.name, isAdmin: club.isAdmin });
    return () => setCurrentClub(null);
  }, [club, setCurrentClub]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadFailed(false);

    async function load() {
      try {
        const [
          { data: membership, error: membershipError },
          { data: clubRow, error: clubError },
          { data: channelRow, error: channelError },
        ] = await Promise.all([
          supabase
            .from("club_members")
            .select("role")
            .eq("club_id", clubId)
            .eq("user_id", session!.user.id)
            .single(),
          supabase.from("clubs").select("name, invite_code, created_by, avatar_url").eq("id", clubId).single(),
          supabase
            .from("channels")
            .select("id")
            .eq("club_id", clubId)
            .is("race_id", null)
            .is("eboard_channel_id", null)
            .single(),
        ]);

        if (cancelled) return;

        if (membershipError || clubError || channelError || !membership || !clubRow || !channelRow) {
          setLoadFailed(true);
          return;
        }

        setClub({
          clubId,
          channelId: channelRow.id,
          name: clubRow.name,
          avatarUrl: clubRow.avatar_url,
          inviteCode: clubRow.invite_code,
          role: membership.role,
          isCreator: clubRow.created_by === session!.user.id,
          isAdmin: membership.role === "admin" || membership.role === "owner",
          isOwner: membership.role === "owner",
        });
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clubId, session, retryToken]);

  if (loadFailed) {
    return <LoadError message="Couldn't load this club." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (!club) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const clubScreenOptions = {
    headerShown: true,
    headerStyle: { backgroundColor: colors.surfaceContainerLow },
    headerTitle: () => (
      <TouchableOpacity
        onPress={() => router.push(`/clubs/${club.clubId}/club-profile`)}
        style={{ flexDirection: "row" as const, alignItems: "center", gap: 8 }}
      >
        {club.avatarUrl ? (
          <Image source={{ uri: club.avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
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
              {club.name.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
        )}
        <Text style={{ ...typography.headlineLgMobile, fontSize: 17, color: colors.primary }}>{club.name}</Text>
      </TouchableOpacity>
    ),
    headerRight: () =>
      club.isAdmin ? (
        <Text style={{ ...typography.labelSm, marginRight: 16, color: colors.primary, textTransform: "uppercase" as const }}>
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
        <Stack.Screen
          name="events"
          options={{
            ...clubScreenOptions,
            title: "Events",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`),
          }}
        />
        <Stack.Screen name="news" options={{ headerShown: false }} />
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
