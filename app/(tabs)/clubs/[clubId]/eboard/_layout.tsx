import { Stack, useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { makeBackHeaderLeft } from "../../../../../components/BackHeaderButton";
import { LoadError } from "../../../../../components/LoadError";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { fetchEboardChannel, type EboardChannel } from "../../../../../lib/eboard";
import { useClub } from "../_layout";

interface EboardContextValue {
  clubId: string;
  userId: string;
  channel: EboardChannel | null;
  reload: () => Promise<void>;
}

const EboardContext = createContext<EboardContextValue | undefined>(undefined);

export function useEboard() {
  const ctx = useContext(EboardContext);
  if (!ctx) throw new Error("useEboard must be used within an eboard route");
  return ctx;
}

// Eboard & Council's hub row only renders for admins ([clubId]/index.tsx),
// but this layout re-checks club.role too, since a non-admin could still
// hit the URL directly. Unlike race/[raceId]/_layout, being a club admin
// does NOT imply membership here (see migration 0017_eboard.sql) — this
// layout only gates "is the caller even allowed to know this exists";
// index.tsx (and chat/roster/meetings) branch on channel/isMember
// themselves to decide what to show once past that gate.
export default function EboardLayout() {
  const club = useClub();
  const { session } = useAuth();
  const router = useRouter();
  const [channel, setChannel] = useState<EboardChannel | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const result = await fetchEboardChannel(club.clubId, session.user.id);
      setChannel(result);
      setLoaded(true);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [club.clubId, session]);

  useEffect(() => {
    if (club.role === "admin") {
      load();
    }
  }, [club.role, load]);

  useEffect(() => {
    if (club.role !== "admin") {
      router.replace(`/clubs/${club.clubId}`);
    }
  }, [club.role, club.clubId, router]);

  if (club.role === "admin" && loadFailed) {
    return <LoadError message="Couldn't load Eboard & Council." onRetry={load} />;
  }

  if (club.role !== "admin" || !loaded || !session) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  const title = channel?.name ?? "Eboard & Council";
  const headerOptions = {
    headerShown: true,
    headerTitle: () =>
      channel ? (
        <TouchableOpacity onPress={() => router.push(`/clubs/${club.clubId}/eboard/roster`)}>
          <Text style={{ fontSize: 17, fontWeight: "600" as const }}>{title}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ fontSize: 17, fontWeight: "600" as const }}>{title}</Text>
      ),
  };

  return (
    <EboardContext.Provider value={{ clubId: club.clubId, userId: session.user.id, channel, reload: load }}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{ ...headerOptions, title, headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}`) }}
        />
        <Stack.Screen
          name="create"
          options={{
            title: "New Eboard & Council",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/eboard`),
          }}
        />
        <Stack.Screen
          name="chat"
          options={{
            ...headerOptions,
            title: "Chat",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/eboard`),
          }}
        />
        <Stack.Screen
          name="highlights"
          options={{ title: "Highlights", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/eboard/chat`) }}
        />
        <Stack.Screen
          name="meetings"
          options={{
            ...headerOptions,
            title: "Meetings",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/eboard`),
          }}
        />
        <Stack.Screen
          name="meeting/[meetingId]"
          options={{ title: "Meeting", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/eboard/meetings`) }}
        />
        <Stack.Screen
          name="meeting/create"
          options={{
            title: "New meeting",
            presentation: "modal",
            headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/eboard/meetings`),
          }}
        />
        <Stack.Screen
          name="roster"
          options={{ title: "Members", headerLeft: makeBackHeaderLeft(router, `/clubs/${club.clubId}/eboard`) }}
        />
      </Stack>
    </EboardContext.Provider>
  );
}
