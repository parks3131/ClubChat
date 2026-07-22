import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import ChatScreen from "../../../../../components/ChatScreen";
import { fetchEboardMembers } from "../../../../../lib/eboard";
import { useEboard } from "./_layout";

// Only a member can be here — index.tsx never links to /chat otherwise,
// but a direct URL hit needs its own guard.
export default function EboardChatScreen() {
  const eboard = useEboard();
  const router = useRouter();

  const eboardChannelId = eboard.channel?.id;
  const fetchMentionCandidates = useCallback(
    () =>
      eboardChannelId
        ? fetchEboardMembers(eboardChannelId).then((rows) => rows.map((r) => ({ id: r.userId, fullName: r.fullName })))
        : Promise.resolve([]),
    [eboardChannelId]
  );

  useEffect(() => {
    if (!eboard.channel?.isMember) {
      router.replace(`/clubs/${eboard.clubId}/eboard`);
    }
  }, [eboard.channel, eboard.clubId, router]);

  if (!eboard.channel?.isMember) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ChatScreen
      channelId={eboard.channel.channelId}
      // Every eboard_channel_member is guaranteed to already be a club
      // admin (enforced in the insert policy, migration 0017_eboard.sql)
      // — no separate "eboard admin" role needed for pin/announce rights,
      // and the same boolean now also gates the "+" Poll/Meeting
      // create-actions below (always true here, so effectively "any
      // Eboard member can create", matching lib/polls.ts's canCreate rule).
      isAdmin
      placeholderName={eboard.channel.name}
      avatarUrl={eboard.channel.avatarUrl}
      memberPath={(userId) => `/clubs/${eboard.clubId}/member/${userId}`}
      highlightsPath={`/clubs/${eboard.clubId}/eboard/highlights`}
      // Not eboard/index (the hub) — that screen now auto-redirects a
      // member straight back here, which would bounce forever if this is
      // ever hit as a "no back history" fallback (e.g. direct URL entry).
      backFallback={`/clubs/${eboard.clubId}`}
      titlePath={`/clubs/${eboard.clubId}/eboard/profile`}
      fetchMentionCandidates={fetchMentionCandidates}
      attachMenu={{
        createPollPath: `/clubs/${eboard.clubId}/eboard/polls/create`,
        createMeetingPath: `/clubs/${eboard.clubId}/eboard/meeting/create`,
      }}
      headerMenu={[
        { label: "Meetings", path: `/clubs/${eboard.clubId}/eboard/meetings`, icon: "groups" },
        { label: "Polls", path: `/clubs/${eboard.clubId}/eboard/polls`, icon: "how-to-vote" },
      ]}
      resolveMeetingPath={(meetingId) => `/clubs/${eboard.clubId}/eboard/meeting/${meetingId}`}
    />
  );
}
