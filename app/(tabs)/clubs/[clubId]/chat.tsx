import { Text } from "react-native";
import ChatScreen from "../../../../components/ChatScreen";
import { useClub } from "./_layout";

export default function ClubChatScreen() {
  const club = useClub();

  return (
    <ChatScreen
      channelId={club.channelId}
      isAdmin={club.role === "admin"}
      placeholderName={club.name}
      memberPath={(userId) => `/clubs/${club.clubId}/member/${userId}`}
      highlightsPath={`/clubs/${club.clubId}/highlights`}
      extraHeaderRight={
        club.role === "admin" ? <Text style={{ color: "#2563eb", fontWeight: "600" }}>Invite: {club.inviteCode}</Text> : null
      }
    />
  );
}
