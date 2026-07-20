import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import { colors, radii, spacing, typography } from "../constants/theme";
import { useAuth } from "../contexts/AuthProvider";
import { useNotifications } from "../contexts/NotificationsProvider";
import {
  deleteMessage,
  fetchMessages,
  reportMessage,
  sendMessage,
  sendPhotoMessage,
  subscribeToNewMessages,
  toggleReaction,
  togglePinned,
  type DisplayMessage,
} from "../lib/messages";
import { markChannelRead } from "../lib/notifications";
import { pickImageOnWeb } from "../lib/pickImageOnWeb";
import { reportError } from "../lib/reportError";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "🔥", "🎉", "😮"];

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PAGE_SIZE = 50;
const HEADER_HEIGHT = 92;
const PINNED_NOTICE_HEIGHT = 72;

// createdAt is a Postgres timestamptz rendered as ISO 8601 with a
// consistent offset, so lexicographic comparison sorts it correctly —
// same assumption already implicit in fetchMessages' own
// order("created_at") in lib/messages.ts.
function mergeMessages(existing: DisplayMessage[], incoming: DisplayMessage[]): DisplayMessage[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Shared by club chat (app/(tabs)/clubs/[clubId]/chat.tsx), race chat
// (app/(tabs)/clubs/[clubId]/race/[raceId]/chat.tsx), and Eboard chat
// (app/(tabs)/clubs/[clubId]/eboard/chat.tsx) — all three are just
// messages in a channel (club/race/eboard-scoped), and the RLS/schema
// already generalizes that (see migration 0016_races.sql), so the UI only
// needs the channel id plus a few call-site-specific bits (who can
// pin/announce, where an avatar tap and the Highlights button should go).
export interface ChatScreenProps {
  channelId: string;
  isAdmin: boolean;
  placeholderName: string;
  // Round picture shown before the name in the header, matching the
  // Clubs list row's existing avatar treatment — null/omitted falls back
  // to a letter placeholder, same convention as every other avatar in
  // this app.
  avatarUrl?: string | null;
  memberPath: (userId: string) => string;
  highlightsPath: string;
  // Custom glass header replaces the native Stack header (see the Stitch
  // chat redesign) — the native header's per-screen headerLeft fallback
  // route (components/BackHeaderButton.tsx's makeBackHeaderLeft pattern)
  // has to be reimplemented here instead of coming from the parent
  // layout's Stack.Screen options.
  backFallback: string;
  // Tapping the club/race/eboard name jumps to its member-management
  // screen (club-profile / race roster / eboard roster) — the same
  // "tap the name to manage membership" pattern used everywhere else in
  // the app, which the custom header initially dropped.
  titlePath: string;
}

export default function ChatScreen({
  channelId,
  isAdmin,
  placeholderName,
  avatarUrl,
  memberPath,
  highlightsPath,
  backFallback,
  titlePath,
}: ChatScreenProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { refetch: refetchNotifications } = useNotifications();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [asAnnouncement, setAsAnnouncement] = useState(false);
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; contentType: string } | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [viewerPhotoUrl, setViewerPhotoUrl] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [dismissedPinnedIds, setDismissedPinnedIds] = useState<Set<string>>(new Set());
  const flatListRef = useRef<FlatList<DisplayMessage>>(null);
  // Set right before an older page is prepended, so onContentSizeChange
  // can jump back to the message the user was reading instead of
  // scrolling to the bottom (its default behavior on every other change).
  const olderPagePrependedCountRef = useRef<number | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // The header is fully custom (glass-blur, matching the Stitch chat
  // redesign) rather than the native Stack header — hide the native one
  // entirely instead of just overriding headerRight.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const reload = useCallback(() => {
    // Merge, don't replace: replacing would drop any older page the user
    // has already loaded via scrolling up every time unrelated realtime
    // activity (someone else's message/reaction/pin) fires. A "deleted"
    // message never disappears from this fetch — see deleteMessage in
    // lib/messages.ts — it comes back with deletedAt set, so a plain
    // upsert-by-id merge picks up the tombstone correctly.
    fetchMessages(channelId, { limit: PAGE_SIZE })
      .then((latest) => setMessages((prev) => mergeMessages(prev, latest)))
      .catch(() => {});
  }, [channelId]);

  useEffect(() => {
    setLoading(true);
    fetchMessages(channelId, { limit: PAGE_SIZE })
      .then((initial) => {
        setMessages(initial);
        setHasMoreOlder(initial.length === PAGE_SIZE);
      })
      .finally(() => setLoading(false));

    const unsubscribe = subscribeToNewMessages(channelId, reload);
    return unsubscribe;
  }, [channelId, reload]);

  // Opening a chat is what actually clears its "N unread" row in the
  // Notifications feed (see lib/notifications.ts) — merely viewing the
  // Notifications tab deliberately does not.
  useEffect(() => {
    if (!session) return;
    markChannelRead(channelId, session.user.id)
      .then(refetchNotifications)
      .catch(() => {});
  }, [channelId, session, refetchNotifications]);

  const handleLoadEarlier = async () => {
    if (!hasMoreOlder || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const older = await fetchMessages(channelId, {
        limit: PAGE_SIZE,
        before: messages[0].createdAt,
      });
      if (older.length > 0) {
        // Content size won't change (and onContentSizeChange won't fire to
        // clear this) if older comes back empty, so only arm it when
        // there's actually something being prepended.
        olderPagePrependedCountRef.current = older.length;
        setMessages((prev) => mergeMessages(prev, older));
      }
      setHasMoreOlder(older.length === PAGE_SIZE);
    } catch {
      // no-op: leave hasMoreOlder as-is so the user can just retry the tap
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !session) return;
    setDraft("");
    await sendMessage({
      channelId,
      senderId: session.user.id,
      body,
      messageType: asAnnouncement ? "announcement" : "text",
    });
    setAsAnnouncement(false);
    reload();
  };

  const handlePickPhoto = async () => {
    if (!session) return;

    try {
      let asset: { uri: string; mimeType: string } | null;
      if (Platform.OS === "web") {
        asset = await pickImageOnWeb();
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          reportError(new Error("Photo library access is required to send a photo."));
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.8,
        });
        asset =
          result.canceled || !result.assets?.[0]
            ? null
            : { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType ?? "image/jpeg" };
      }
      if (!asset) return;

      // Hold the picked photo for an optional caption instead of sending
      // immediately — the send/cancel action below confirms it.
      setPendingPhoto({ uri: asset.uri, contentType: asset.mimeType });
      setPhotoCaption("");
    } catch (err) {
      reportError(err);
    }
  };

  const handleSendPhoto = async () => {
    if (!session || !pendingPhoto) return;
    setSendingPhoto(true);
    try {
      await sendPhotoMessage({
        channelId,
        senderId: session.user.id,
        fileUri: pendingPhoto.uri,
        contentType: pendingPhoto.contentType,
        caption: photoCaption,
      });
      setPendingPhoto(null);
      setPhotoCaption("");
      reload();
    } catch (err) {
      reportError(err);
    } finally {
      setSendingPhoto(false);
    }
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

  const handleDelete = (message: DisplayMessage) => {
    const doDelete = () => deleteMessage(message.id).then(reload).catch(reportError);

    // react-native-web's Alert.alert is a no-op, so confirm via window.confirm there.
    if (Platform.OS === "web") {
      if (window.confirm("Delete this message? This can't be undone.")) doDelete();
      return;
    }

    Alert.alert("Delete message?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  const handleReport = async (message: DisplayMessage) => {
    if (!session) return;
    try {
      await reportMessage({ messageId: message.id, channelId, reporterId: session.user.id });
      setReportedIds((prev) => new Set(prev).add(message.id));
    } catch (err) {
      reportError(err);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(backFallback);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const pinnedMessages = [...messages].filter((m) => m.pinned && !dismissedPinnedIds.has(m.id)).reverse();
  const headerPaddingTop = insets.top + 12;
  const listPaddingTop = HEADER_HEIGHT + insets.top + (pinnedMessages.length > 0 ? PINNED_NOTICE_HEIGHT : spacing.stackSm);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingTop: listPaddingTop }]}
        onContentSizeChange={() => {
          // After prepending an older page, jump back to the message the
          // user was reading (now sitting right below the new page)
          // instead of the default scroll-to-bottom every other change
          // triggers here (initial load, send, react, pin, realtime reload).
          const prependedCount = olderPagePrependedCountRef.current;
          if (prependedCount !== null) {
            olderPagePrependedCountRef.current = null;
            requestAnimationFrame(() => {
              flatListRef.current?.scrollToIndex({ index: prependedCount, animated: false });
            });
            return;
          }
          // Same rAF-wrapped pattern as the prepend branch above: calling
          // scrollToEnd synchronously inside this callback can land short
          // of the true bottom by roughly one row — the DOM/layout for the
          // just-added content hasn't fully committed yet at this point.
          requestAnimationFrame(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          });
        }}
        onScrollToIndexFailed={(info) => {
          // FlatList can fail to scroll to an index it hasn't measured yet
          // when row heights vary — standard workaround is a short retry.
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 50);
        }}
        onStartReached={handleLoadEarlier}
        onStartReachedThreshold={0.5}
        ListHeaderComponent={
          loadingOlder ? (
            <View style={styles.loadEarlierRow}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
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

          const isMine = item.senderId === session?.user.id;

          if (item.messageType === "announcement" && !item.deletedAt) {
            return (
              <View style={styles.announcementWrap}>
                <View style={styles.announcementCard}>
                  <Text style={styles.announcementWatermark}>INFO</Text>
                  <View style={styles.announcementContent}>
                    <View style={styles.announcementHeadlineRow}>
                      <View style={styles.announcementAccentBar} />
                      <Text style={styles.announcementHeadline}>{item.body}</Text>
                    </View>
                    <Text style={styles.announcementSender}>— {item.senderName}</Text>
                    <View style={styles.bubbleFooter}>
                      <Text style={styles.timestampInline}>{formatTime(item.createdAt)}</Text>
                      {isAdmin && (
                        <TouchableOpacity onPress={() => handleTogglePin(item)}>
                          <Text style={styles.pinAction}>{item.pinned ? "Unpin" : "Pin"}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          }

          return (
            <View style={[styles.messageRow, isMine && styles.messageRowMine]}>
              <TouchableOpacity onPress={() => router.push(memberPath(item.senderId))}>
                {item.senderAvatarUrl ? (
                  <Image source={{ uri: item.senderAvatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarInitial}>{item.senderName.charAt(0).toUpperCase() || "?"}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <BubbleContainer isMine={isMine}>
                <View style={styles.bubbleHeader}>
                  <Text style={[styles.senderName, isMine && styles.senderNameMine]}>{item.senderName}</Text>
                  {item.pinned && (
                    <MaterialIcons name="push-pin" size={12} color={isMine ? colors.onPrimary : colors.primary} />
                  )}
                </View>
                {item.deletedAt ? (
                  <Text style={styles.deletedText}>This message was deleted</Text>
                ) : item.messageType === "photo" && item.photoUrl ? (
                  <View>
                    <TouchableOpacity onPress={() => setViewerPhotoUrl(item.photoUrl)}>
                      <Image source={{ uri: item.photoUrl }} style={styles.photoBubbleImage} resizeMode="cover" />
                    </TouchableOpacity>
                    {item.body ? (
                      <Text style={[styles.photoCaption, isMine && styles.bodyMine, { marginTop: spacing.unit }]}>
                        {item.body}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={[styles.body, isMine && styles.bodyMine]}>{item.body}</Text>
                )}
                <View style={styles.bubbleFooter}>
                  <Text style={[styles.timestampInline, isMine && styles.timestampInlineMine]}>{formatTime(item.createdAt)}</Text>
                  {isMine && <MaterialIcons name="check-circle" size={13} color={colors.primary} />}
                </View>
                {!item.deletedAt && (
                  <View style={styles.actionsFooter}>
                    {[...grouped.entries()].map(([emoji, count]) => (
                      <TouchableOpacity key={emoji} onPress={() => handleReact(item.id, emoji)}>
                        <Text style={[styles.reaction, myEmojis.has(emoji) && styles.reactionActive]}>
                          {emoji} {count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={() => setPickerMessageId(pickerMessageId === item.id ? null : item.id)}>
                      <Text style={[styles.reaction, isMine && styles.reactionOnMine]}>+</Text>
                    </TouchableOpacity>
                    {isAdmin && (
                      <TouchableOpacity onPress={() => handleTogglePin(item)}>
                        <Text style={[styles.pinAction, isMine && styles.pinActionOnMine]}>{item.pinned ? "Unpin" : "Pin"}</Text>
                      </TouchableOpacity>
                    )}
                    {(isAdmin || isMine) && (
                      <TouchableOpacity onPress={() => handleDelete(item)}>
                        <Text style={[styles.deleteAction, isMine && styles.deleteActionOnMine]}>Delete</Text>
                      </TouchableOpacity>
                    )}
                    {!isMine && (
                      <TouchableOpacity onPress={() => handleReport(item)} disabled={reportedIds.has(item.id)}>
                        <Text style={styles.reportAction}>{reportedIds.has(item.id) ? "Reported" : "Report"}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {pickerMessageId === item.id && (
                  <View style={styles.pickerRow}>
                    {REACTION_OPTIONS.map((emoji) => (
                      <TouchableOpacity key={emoji} onPress={() => handleReact(item.id, emoji)}>
                        <Text style={styles.pickerEmoji}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </BubbleContainer>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hi.</Text>}
      />

      {/* Glass header — floats over the message list, matching the Stitch
          chat redesign; replaces the native Stack header entirely. */}
      <BlurView intensity={80} tint="light" style={[styles.header, { paddingTop: headerPaddingTop, height: HEADER_HEIGHT + insets.top }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeftRow}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <MaterialIcons name="arrow-back" size={20} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push(titlePath)} style={[styles.titleTextWrap, styles.titleTextRow]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
              ) : (
                <View style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}>
                  <Text style={styles.headerAvatarInitial}>{placeholderName.charAt(0).toUpperCase() || "?"}</Text>
                </View>
              )}
              <View style={styles.titleTextColumn}>
                <Text style={styles.logoText} numberOfLines={1}>
                  {placeholderName}
                </Text>
                <View style={styles.subtitleRow}>
                  <Animated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
                  <Text style={styles.subtitleText}>ClubChat</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.headerRightRow}>
            <TouchableOpacity style={styles.highlightsButton} onPress={() => router.push(highlightsPath)}>
              <MaterialIcons name="bolt" size={16} color={colors.onPrimary} />
              <Text style={styles.highlightsButtonText}>Highlights</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>

      {/* Floating pinned notice — overlaps the top of the message list. */}
      {pinnedMessages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.pinnedStrip, { top: HEADER_HEIGHT + insets.top }]}
          contentContainerStyle={styles.pinnedStripContent}
        >
          {pinnedMessages.map((m) => (
            <BlurView key={m.id} intensity={60} tint="light" style={styles.pinnedCard}>
              <TouchableOpacity style={styles.pinnedCardTouchable} onPress={() => router.push(`${highlightsPath}?tab=pinned`)}>
                <View style={styles.pinnedIconBadge}>
                  <MaterialIcons name="push-pin" size={16} color={colors.primary} />
                </View>
                <View style={styles.pinnedTextCol}>
                  <Text style={styles.pinnedLabel}>Notice</Text>
                  <Text style={styles.pinnedText} numberOfLines={1}>
                    {m.deletedAt ? "This message was deleted" : m.messageType === "photo" ? "📷 Photo" : m.body}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pinnedDismiss}
                onPress={() => setDismissedPinnedIds((prev) => new Set(prev).add(m.id))}
              >
                <MaterialIcons name="close" size={16} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </BlurView>
          ))}
        </ScrollView>
      )}

      {pendingPhoto && (
        <View style={styles.photoPreviewRow}>
          <Image source={{ uri: pendingPhoto.uri }} style={styles.photoPreviewThumb} />
          <TextInput
            style={styles.captionInput}
            placeholder="Add a caption (optional)"
            placeholderTextColor={colors.onSurfaceVariant}
            value={photoCaption}
            onChangeText={setPhotoCaption}
          />
          <TouchableOpacity
            style={styles.photoPreviewCancel}
            onPress={() => {
              setPendingPhoto(null);
              setPhotoCaption("");
            }}
            disabled={sendingPhoto}
          >
            <MaterialIcons name="close" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoPreviewSend} onPress={handleSendPhoto} disabled={sendingPhoto}>
            {sendingPhoto ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <MaterialIcons name="send" size={18} color={colors.onPrimary} />}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.photoButton} onPress={handlePickPhoto} disabled={sendingPhoto || !!pendingPhoto}>
          <MaterialIcons name="add" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <View style={styles.inputPill}>
          <TextInput
            style={styles.input}
            placeholder={`Message ${placeholderName}`}
            placeholderTextColor={colors.onSurfaceVariant}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
        </View>
        {isAdmin && (
          // Compact toggle replaces the old full-width "Send as
          // announcement" banner, which sat permanently between the
          // message list and the input and ate into the chat's visible
          // area — a founder complaint after the redesign. Highlighted
          // fill communicates the armed state instead of a persistent bar.
          <TouchableOpacity
            style={[styles.announceToggle, asAnnouncement && styles.announceToggleActive]}
            onPress={() => setAsAnnouncement((v) => !v)}
          >
            <MaterialIcons name="campaign" size={20} color={asAnnouncement ? colors.onPrimary : colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.sendButton, !draft.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!draft.trim()}
        >
          <MaterialIcons name="send" size={20} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>

      <Modal visible={viewerPhotoUrl !== null} transparent animationType="fade" onRequestClose={() => setViewerPhotoUrl(null)}>
        <TouchableOpacity style={styles.viewerBackdrop} activeOpacity={1} onPress={() => setViewerPhotoUrl(null)}>
          {viewerPhotoUrl && <Image source={{ uri: viewerPhotoUrl }} style={styles.viewerImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// The sent-message ("mine") bubble uses the Energetic Orange → rust
// diagonal gradient from the Stitch export; every other bubble is a plain
// tinted View. Isolated into its own component so renderItem doesn't need
// a runtime branch between View and LinearGradient element types.
function BubbleContainer({ isMine, children }: { isMine: boolean; children: React.ReactNode }) {
  if (isMine) {
    return (
      <LinearGradient
        colors={[colors.primary, "#aa3000"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.bubble, styles.bubbleMine]}
      >
        {children}
      </LinearGradient>
    );
  }
  return <View style={[styles.bubble, styles.bubbleTheirs]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.stackSm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  headerRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeftRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.stackSm, marginRight: spacing.stackSm },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  titleTextWrap: { flex: 1, minWidth: 0 },
  titleTextRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  titleTextColumn: { flex: 1, minWidth: 0 },
  headerAvatar: { width: 44, height: 44, borderRadius: 22 },
  headerAvatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  headerAvatarInitial: { ...typography.labelSm, fontSize: 18, color: colors.primary },
  logoText: {
    ...typography.headlineLgMobile,
    fontSize: 22,
    color: colors.primary,
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  subtitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.unit, marginTop: 2 },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  subtitleText: { ...typography.labelSm, fontSize: 9, color: colors.onSurfaceVariant, maxWidth: 160 },
  headerRightRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  highlightsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.unit,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm + 2,
    paddingVertical: spacing.unit + 2,
  },
  highlightsButtonText: { ...typography.labelSm, fontSize: 10, color: colors.onPrimary },
  pinnedStrip: {
    position: "absolute",
    left: spacing.gutter,
    right: spacing.gutter,
    zIndex: 40,
    maxHeight: PINNED_NOTICE_HEIGHT,
  },
  pinnedStripContent: { gap: spacing.stackSm, alignItems: "center" },
  pinnedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    width: 300,
    borderRadius: radii.lg,
    padding: spacing.stackSm + 4,
    borderWidth: 1,
    borderColor: "rgba(255,77,0,0.15)",
    overflow: "hidden",
  },
  pinnedCardTouchable: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  pinnedIconBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.DEFAULT,
    backgroundColor: "rgba(255,77,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  pinnedTextCol: { flex: 1 },
  pinnedLabel: { ...typography.labelSm, fontSize: 9, color: colors.primary },
  pinnedText: { ...typography.bodyMd, fontSize: 12, color: colors.onSurface },
  pinnedDismiss: { padding: spacing.unit },
  list: { paddingHorizontal: spacing.stackSm, paddingBottom: spacing.stackSm, gap: spacing.stackMd },
  loadEarlierRow: { alignItems: "center", paddingVertical: spacing.stackSm },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.stackSm, marginBottom: spacing.unit },
  messageRowMine: { justifyContent: "flex-end" },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  avatarInitial: { ...typography.labelSm, fontSize: 13, color: colors.primary },
  bubble: { maxWidth: "82%", padding: spacing.stackSm + 4 },
  bubbleTheirs: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  bubbleMine: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderBottomLeftRadius: radii.sm,
    borderBottomRightRadius: radii.lg,
  },
  bubbleHeader: { flexDirection: "row", alignItems: "center", gap: spacing.unit, marginBottom: spacing.unit },
  senderName: { ...typography.labelSm, fontSize: 10, color: colors.primary },
  senderNameMine: { color: colors.onPrimary, opacity: 0.85 },
  body: { ...typography.bodyMd, fontSize: 15, color: colors.onSurface },
  bodyMine: { color: colors.onPrimary },
  photoCaption: { ...typography.bodyMd, fontSize: 14, fontStyle: "italic", color: colors.onSurface },
  deletedText: { ...typography.bodyMd, fontSize: 15, color: colors.onSurfaceVariant, fontStyle: "italic" },
  photoBubbleImage: { width: 220, height: 220, borderRadius: radii.DEFAULT, backgroundColor: colors.surfaceVariant },
  timestampInline: { ...typography.labelSm, fontSize: 9, color: colors.onSurfaceVariant, textTransform: "none" },
  timestampInlineMine: { color: colors.onPrimary, opacity: 0.8 },
  bubbleFooter: { flexDirection: "row", alignItems: "center", gap: spacing.unit, marginTop: spacing.unit, justifyContent: "flex-end" },
  actionsFooter: { flexDirection: "row", flexWrap: "wrap", gap: spacing.stackSm, marginTop: spacing.stackSm },
  reaction: { fontSize: 13, color: colors.onSurfaceVariant },
  reactionOnMine: { color: colors.onPrimary },
  reactionActive: { color: colors.primary, fontWeight: "700" },
  pickerRow: {
    flexDirection: "row",
    gap: spacing.stackSm,
    marginTop: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.DEFAULT,
    padding: spacing.stackSm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignSelf: "flex-start",
  },
  pickerEmoji: { fontSize: 20 },
  pinAction: { fontSize: 13, color: colors.primary },
  pinActionOnMine: { color: colors.onPrimary },
  deleteAction: { fontSize: 13, color: colors.error },
  deleteActionOnMine: { color: colors.onPrimary, textDecorationLine: "underline" },
  reportAction: { fontSize: 13, color: colors.onSurfaceVariant },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
  systemRow: { alignItems: "center", marginVertical: spacing.unit },
  systemText: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "none", fontStyle: "italic" },
  announcementWrap: { alignItems: "center", paddingHorizontal: spacing.stackSm },
  announcementCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surfaceContainerLowest,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.gutter,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  announcementWatermark: {
    position: "absolute",
    right: -10,
    bottom: -20,
    fontFamily: "Anton_400Regular",
    fontSize: 80,
    color: "rgba(255,77,0,0.05)",
  },
  announcementContent: { position: "relative" },
  announcementHeadlineRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm, marginBottom: spacing.stackSm },
  announcementAccentBar: { width: 4, height: 28, backgroundColor: colors.primary },
  announcementHeadline: {
    ...typography.headlineLgMobile,
    fontSize: 18,
    color: colors.onSurface,
    textTransform: "uppercase",
    fontStyle: "italic",
    flexShrink: 1,
  },
  announcementSender: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginBottom: spacing.stackSm },
  announceToggle: {
    width: 48,
    height: 48,
    borderRadius: radii.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  announceToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  photoPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    padding: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLow,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  photoPreviewThumb: { width: 44, height: 44, borderRadius: radii.DEFAULT },
  captionInput: {
    flex: 1,
    ...typography.bodyMd,
    fontSize: 14,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.full,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
  },
  photoPreviewCancel: { padding: spacing.unit + 2 },
  photoPreviewSend: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.stackSm,
    paddingTop: spacing.stackSm,
    paddingBottom: spacing.gutter,
    gap: spacing.stackSm,
  },
  inputPill: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: radii.xl,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  input: {
    ...typography.bodyMd,
    color: colors.onSurface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 2,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sendButtonDisabled: { opacity: 0.4 },
  photoButton: {
    width: 48,
    height: 48,
    borderRadius: radii.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
});
