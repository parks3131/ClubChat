import { Stack, useLocalSearchParams } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
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
        supabase.from("channels").select("id").eq("club_id", clubId).single(),
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

  return (
    <ClubContext.Provider value={club}>
      <Stack>
        <Stack.Screen name="(club-tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="race/[raceId]" options={{ headerShown: false }} />
      </Stack>
    </ClubContext.Provider>
  );
}
