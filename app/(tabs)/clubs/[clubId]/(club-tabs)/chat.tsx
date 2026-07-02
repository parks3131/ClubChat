import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../../../../contexts/AuthProvider";
import {
  fetchMessages,
  sendMessage,
  subscribeToNewMessages,
  toggleReaction,
  togglePinned,
  type DisplayMessage,
} from "../../../../../lib/messages";
import { useClub } from "../_layout";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "🔥", "🎉", "😮"];

export default function ClubChatScreen() {
  const club = useClub();
  const { session } = useAuth();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [asAnnouncement, setAsAnnouncement] = useState(false);
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetchMessages(club.channelId)
      .then(setMessages)
      .catch(() => {});
  }, [club.channelId]);

  useEffect(() => {
    setLoading(true);
    fetchMessages(club.channelId)
      .then(setMessages)
      .finally(() => setLoading(false));

    const unsubscribe = subscribeToNewMessages(club.channelId, reload);
    return unsubscribe;
  }, [club.channelId, reload]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !session) return;
    setDraft("");
    await sendMessage({
      channelId: club.channelId,
      senderId: session.user.id,
      body,
      messageType: asAnnouncement ? "announcement" : "text",
    });
    setAsAnnouncement(false);
    reload();
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!session) return;
    setPickerMessageId(null);
    await toggleReaction(messageId, session.user.id, emoji);
    reload();
  };

  const handleTogglePin = async (message: DisplayMessage) => {
    await togglePinned(message.id, !message.pinned);
    reload();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.messageType === "system") {
            return (
              <View style={styles.systemRow}>
                <Text style={styles.systemText}>{item.body}</Text>
              </View>
            );
          }

          const grouped = new Map<string, number>();
          const myEmojis = new Set<string>();
          for (const r of item.reactions) {
            grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1);
            if (r.userId === session?.user.id) myEmojis.add(r.emoji);
          }

          return (
            <View style={styles.messageRow}>
              {item.senderAvatarUrl ? (
                <Image source={{ uri: item.senderAvatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{item.senderName.charAt(0).toUpperCase() || "?"}</Text>
                </View>
              )}
              <View style={[styles.bubble, item.messageType === "announcement" && styles.announcementBubble]}>
                <View style={styles.bubbleHeader}>
                  <Text style={styles.senderName}>{item.senderName}</Text>
                  {item.pinned && <Text style={styles.pinnedBadge}>📌 Pinned</Text>}
                </View>
                <Text style={styles.body}>{item.body}</Text>
                <View style={styles.bubbleFooter}>
                  {[...grouped.entries()].map(([emoji, count]) => (
                    <TouchableOpacity key={emoji} onPress={() => handleReact(item.id, emoji)}>
                      <Text style={[styles.reaction, myEmojis.has(emoji) && styles.reactionActive]}>
                        {emoji} {count}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => setPickerMessageId(pickerMessageId === item.id ? null : item.id)}
                  >
                    <Text style={styles.reaction}>+</Text>
                  </TouchableOpacity>
                  {club.role === "admin" && (
                    <TouchableOpacity onPress={() => handleTogglePin(item)}>
                      <Text style={styles.pinAction}>{item.pinned ? "Unpin" : "Pin"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {pickerMessageId === item.id && (
                  <View style={styles.pickerRow}>
                    {REACTION_OPTIONS.map((emoji) => (
                      <TouchableOpacity key={emoji} onPress={() => handleReact(item.id, emoji)}>
                        <Text style={styles.pickerEmoji}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hi.</Text>}
      />

      {club.role === "admin" && (
        <View style={styles.announceRow}>
          <Text style={styles.announceLabel}>Send as announcement</Text>
          <Switch value={asAnnouncement} onValueChange={setAsAnnouncement} />
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={`Message ${club.name}`}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !draft.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!draft.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 12, gap: 8 },
  messageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { backgroundColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 13, fontWeight: "700", color: "#475569" },
  bubble: { flex: 1, backgroundColor: "#f1f5f9", borderRadius: 10, padding: 10 },
  announcementBubble: { backgroundColor: "#fef3c7" },
  bubbleHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  senderName: { fontWeight: "700", fontSize: 13, color: "#334155" },
  pinnedBadge: { fontSize: 12, color: "#92400e" },
  body: { fontSize: 15, color: "#0f172a" },
  bubbleFooter: { flexDirection: "row", gap: 16, marginTop: 6 },
  reaction: { fontSize: 13, color: "#64748b" },
  reactionActive: { color: "#2563eb", fontWeight: "700" },
  pickerRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignSelf: "flex-start",
  },
  pickerEmoji: { fontSize: 20 },
  pinAction: { fontSize: 13, color: "#2563eb" },
  empty: { textAlign: "center", marginTop: 40, color: "#888" },
  systemRow: { alignItems: "center", marginVertical: 4 },
  systemText: { fontSize: 12, color: "#94a3b8", fontStyle: "italic" },
  announceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#fffbeb",
  },
  announceLabel: { fontSize: 13, color: "#92400e" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendButton: { backgroundColor: "#2563eb", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: "#fff", fontWeight: "600" },
});
