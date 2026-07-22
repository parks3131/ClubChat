import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as DocumentPicker from "expo-document-picker";
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
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import { colors, radii, spacing, typography, type MaterialIconName } from "../constants/theme";
import { useAuth } from "../contexts/AuthProvider";
import { useNotifications } from "../contexts/NotificationsProvider";
import { fetchEvent, type DisplayCalendarEvent } from "../lib/calendar";
import { fetchMeeting, type EboardMeeting } from "../lib/eboard";
import {
  deleteMessage,
  fetchMessages,
  reportMessage,
  sendDocumentMessage,
  sendMessage,
  sendPhotoMessage,
  subscribeToNewMessages,
  toggleReaction,
  togglePinned,
  type DisplayMessage,
} from "../lib/messages";
import {
  filterMentionCandidates,
  highlightMentions,
  insertMentionIntoDraft,
  matchTrailingMentionQuery,
  type MentionCandidate,
} from "../lib/mentions";
import { markChannelRead } from "../lib/notifications";
import { pickDocumentOnWeb } from "../lib/pickDocumentOnWeb";
import { pickImageOnWeb } from "../lib/pickImageOnWeb";
import { castVote, deletePoll, fetchPoll, setPollClosed, type PollDetail } from "../lib/polls";
import { reportError } from "../lib/reportError";
import { PollCard } from "./PollCard";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "🔥", "🎉", "😮"];

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  // Powers @mention autocomplete — the pool of members eligible to be
  // tagged in this channel (club members / race roster / Eboard roster,
  // per call site). Fetched once per channel mount and cached; not
  // re-fetched on every keystroke.
  fetchMentionCandidates: () => Promise<MentionCandidate[]>;
  // Founder wireframe: a WhatsApp-style expandable "+" grid (Photos /
  // Camera / Document, plus admin-gated create-actions) replacing the old
  // single photo-picker icon. Club chat passes createPollPath +
  // createEventPath; race chat passes createPollPath only (no Event/
  // Meeting concept there); Eboard chat passes createPollPath +
  // createMeetingPath (no Event concept there). Each create-action posts
  // an inline card into this same chat the instant it's created,
  // regardless of scope (see 0071/0077's triggers).
  attachMenu?: {
    createPollPath?: string;
    createEventPath?: string;
    createMeetingPath?: string;
  };
  // The chat header's grid icon (next to Highlights) — opens a small
  // dropdown of quick-nav links. Club chat points at Polls/Routines/
  // Calendar; race chat at Meet Information/Polls/Car Assignments &
  // Groups; Eboard chat at Meetings/Polls — the same screens each hub's
  // own row-per-feature grid used to hold, now reached from chat instead.
  headerMenu?: { label: string; path: string; icon: MaterialIconName }[];
  // A created club event auto-posts into chat as its own message
  // (0071_poll_event_chat_messages.sql) — resolves where "View Event"
  // should navigate. Only club chat passes this, since only club-scoped
  // events post to chat (calendar_events has no race/Eboard scope to
  // begin with). Polls no longer need an equivalent — the inline poll
  // card renders the full PollCard UI directly (see PollMessageCard
  // below) rather than linking out to a separate screen.
  resolveEventPath?: (eventId: string) => string;
  // Same idea for a created Eboard meeting (0077) — only Eboard chat
  // passes this.
  resolveMeetingPath?: (meetingId: string) => string;
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
  fetchMentionCandidates,
  attachMenu,
  headerMenu,
  resolveEventPath,
  resolveMeetingPath,
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
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [pendingDocument, setPendingDocument] = useState<{ uri: string; name: string; mimeType: string; size: number } | null>(
    null
  );
  const [sendingDocument, setSendingDocument] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const [pollDataByMessageId, setPollDataByMessageId] = useState<Map<string, PollDetail>>(new Map());
  const [eventDataByMessageId, setEventDataByMessageId] = useState<Map<string, DisplayCalendarEvent>>(new Map());
  const [meetingDataByMessageId, setMeetingDataByMessageId] = useState<Map<string, EboardMeeting>>(new Map());
  const [votingPollOptionId, setVotingPollOptionId] = useState<string | null>(null);
  // The message currently showing the ⋮ actions popup (reaction row +
  // Pin/Delete/Report) — replaces what used to be an always-visible text
  // row under every message (founder request: too cluttered, wanted a
  // WhatsApp-style press-to-reveal menu; long-press is a native-only
  // gesture so a corner ⋮ is the interim trigger that also works on web).
  const [actionsMessage, setActionsMessage] = useState<DisplayMessage | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; contentType: string } | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [viewerPhotoUrl, setViewerPhotoUrl] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [dismissedPinnedIds, setDismissedPinnedIds] = useState<Set<string>>(new Set());
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  // Users tagged in the current draft (via the autocomplete below), sent
  // alongside the message as structured ids rather than embedded in the
  // body text itself — see lib/mentions.ts's module comment for why.
  const [pendingMentions, setPendingMentions] = useState<MentionCandidate[]>([]);
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

  // Chat is meant to feel full-screen — hide the bottom tab bar while it's
  // open. Club/race/eboard chat all mount this component at different
  // nesting depths (race chat has one extra Stack layer over club/eboard
  // chat), so walk up parents until we find the tab navigator itself
  // rather than assuming a fixed number of getParent() hops.
  useLayoutEffect(() => {
    let tabsNavigation = navigation;
    while (tabsNavigation && tabsNavigation.getState()?.type !== "tab") {
      const parent = tabsNavigation.getParent();
      if (!parent) break;
      tabsNavigation = parent;
    }
    if (tabsNavigation?.getState()?.type !== "tab") return;
    tabsNavigation.setOptions({ tabBarStyle: { display: "none" } });
    return () => {
      tabsNavigation.setOptions({ tabBarStyle: { backgroundColor: colors.surfaceContainerLow } });
    };
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

  useEffect(() => {
    let cancelled = false;
    fetchMentionCandidates()
      .then((candidates) => {
        if (!cancelled) setMentionCandidates(candidates);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channelId, fetchMentionCandidates]);

  // Hydrates poll/event chat-card messages with the real poll/event data
  // they reference (0071_poll_event_chat_messages.sql) — re-runs whenever
  // the message list changes (send/react/pin/delete/realtime), same as
  // reactions/mentions are already fully re-derived from `messages`
  // rather than diffed incrementally.
  useEffect(() => {
    if (!session) return;
    const pollMessages = messages.filter((m) => m.messageType === "poll" && m.pollId);
    const eventMessages = messages.filter((m) => m.messageType === "event" && m.eventId);
    const meetingMessages = messages.filter((m) => m.messageType === "meeting" && m.meetingId);
    if (pollMessages.length === 0 && eventMessages.length === 0 && meetingMessages.length === 0) return;

    let cancelled = false;
    Promise.all([
      Promise.all(pollMessages.map((m) => fetchPoll(m.pollId!, session.user.id).then((data) => [m.id, data] as const))),
      Promise.all(eventMessages.map((m) => fetchEvent(m.eventId!).then((data) => [m.id, data] as const))),
      Promise.all(meetingMessages.map((m) => fetchMeeting(m.meetingId!).then((data) => [m.id, data] as const))),
    ])
      .then(([pollEntries, eventEntries, meetingEntries]) => {
        if (cancelled) return;
        setPollDataByMessageId(new Map(pollEntries));
        setEventDataByMessageId(
          new Map(eventEntries.filter((entry): entry is [string, DisplayCalendarEvent] => entry[1] !== null))
        );
        setMeetingDataByMessageId(
          new Map(meetingEntries.filter((entry): entry is [string, EboardMeeting] => entry[1] !== null))
        );
      })
      .catch(reportError);
    return () => {
      cancelled = true;
    };
  }, [messages, session]);

  const handleVotePollOption = async (messageId: string, pollId: string, optionId: string) => {
    if (!session) return;
    setVotingPollOptionId(optionId);
    try {
      await castVote(optionId);
      const updated = await fetchPoll(pollId, session.user.id);
      setPollDataByMessageId((prev) => new Map(prev).set(messageId, updated));
    } catch (err) {
      reportError(err);
    } finally {
      setVotingPollOptionId(null);
    }
  };

  // Creator-only actions surfaced by the inline PollCard (see
  // PollMessageCard below). Deleting cascades to remove the poll's own
  // chat message too (messages.poll_id on delete cascade, 0071) — the
  // existing messages-table realtime subscription already refetches on
  // that change, so the card just disappears on its own; no local removal
  // needed here.
  const handleTogglePollClosed = async (messageId: string, pollId: string) => {
    if (!session) return;
    const current = pollDataByMessageId.get(messageId);
    if (!current) return;
    try {
      await setPollClosed(pollId, !current.isClosed);
      const updated = await fetchPoll(pollId, session.user.id);
      setPollDataByMessageId((prev) => new Map(prev).set(messageId, updated));
    } catch (err) {
      reportError(err);
    }
  };

  const handleDeletePoll = async (pollId: string) => {
    try {
      await deletePoll(pollId);
    } catch (err) {
      reportError(err);
    }
  };

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
    setMentionQuery(null);
    // Final safety net: only tag a pending mention if its "@Name" text is
    // still actually present in what's being sent — catches the case
    // where the user deleted or edited the mention after inserting it.
    const mentionedUserIds = pendingMentions.filter((c) => body.includes(`@${c.fullName}`)).map((c) => c.id);
    setPendingMentions([]);
    await sendMessage({
      channelId,
      senderId: session.user.id,
      body,
      messageType: asAnnouncement ? "announcement" : "text",
      mentionedUserIds,
    });
    setAsAnnouncement(false);
    reload();
  };

  const handleDraftChange = (text: string) => {
    setDraft(text);
    setMentionQuery(matchTrailingMentionQuery(text));
    setPendingMentions((prev) => prev.filter((c) => text.includes(`@${c.fullName}`)));
  };

  const handleSelectMention = (candidate: MentionCandidate) => {
    if (mentionQuery === null) return;
    setDraft((prev) => insertMentionIntoDraft(prev, mentionQuery, candidate));
    setMentionQuery(null);
    setPendingMentions((prev) => (prev.some((c) => c.id === candidate.id) ? prev : [...prev, candidate]));
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

  // Distinct from handlePickPhoto (library) — WhatsApp-style attach grid
  // splits "Photos" and "Camera" into separate options.
  const handlePickCamera = async () => {
    if (!session) return;
    setAttachMenuOpen(false);

    try {
      let asset: { uri: string; mimeType: string } | null;
      if (Platform.OS === "web") {
        asset = await pickImageOnWeb({ captureCamera: true });
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          reportError(new Error("Camera access is required to take a photo."));
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        asset =
          result.canceled || !result.assets?.[0]
            ? null
            : { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType ?? "image/jpeg" };
      }
      if (!asset) return;

      setPendingPhoto({ uri: asset.uri, contentType: asset.mimeType });
      setPhotoCaption("");
    } catch (err) {
      reportError(err);
    }
  };

  const handlePickDocument = async () => {
    setAttachMenuOpen(false);

    try {
      let asset: { uri: string; name: string; mimeType: string; size: number } | null;
      if (Platform.OS === "web") {
        asset = await pickDocumentOnWeb();
      } else {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        asset =
          result.canceled || !result.assets?.[0]
            ? null
            : {
                uri: result.assets[0].uri,
                name: result.assets[0].name,
                mimeType: result.assets[0].mimeType ?? "application/octet-stream",
                size: result.assets[0].size ?? 0,
              };
      }
      if (!asset) return;
      setPendingDocument(asset);
    } catch (err) {
      reportError(err);
    }
  };

  const handleSendDocument = async () => {
    if (!session || !pendingDocument) return;
    setSendingDocument(true);
    try {
      await sendDocumentMessage({
        channelId,
        senderId: session.user.id,
        fileUri: pendingDocument.uri,
        contentType: pendingDocument.mimeType,
        fileName: pendingDocument.name,
        fileSizeBytes: pendingDocument.size,
      });
      setPendingDocument(null);
      reload();
    } catch (err) {
      reportError(err);
    } finally {
      setSendingDocument(false);
    }
  };

  // Toggling closed also refocuses the composer — "tap the + again to go
  // back to the keyboard," matching the founder's WhatsApp reference.
  const handleToggleAttachMenu = () => {
    if (attachMenuOpen) {
      setAttachMenuOpen(false);
      inputRef.current?.focus();
    } else {
      setAttachMenuOpen(true);
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!session) return;
    setActionsMessage(null);
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
  const mentionSuggestions =
    mentionQuery !== null ? filterMentionCandidates(mentionCandidates, mentionQuery) : [];
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
                      <Text style={styles.announcementHeadline}>
                        {renderBodyWithMentions(item.body ?? "", item.mentions, styles.mentionText)}
                      </Text>
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
                        {renderBodyWithMentions(item.body, item.mentions, isMine ? styles.mentionTextMine : styles.mentionText)}
                      </Text>
                    ) : null}
                  </View>
                ) : item.messageType === "document" && item.documentUrl ? (
                  <TouchableOpacity
                    style={styles.documentBubble}
                    onPress={() => item.documentUrl && Linking.openURL(item.documentUrl)}
                  >
                    <MaterialIcons name="insert-drive-file" size={28} color={isMine ? colors.onPrimary : colors.primary} />
                    <View style={styles.documentBubbleText}>
                      <Text
                        style={[styles.documentName, isMine && styles.bodyMine]}
                        numberOfLines={1}
                      >
                        {item.documentName ?? "Document"}
                      </Text>
                      {item.documentSizeBytes ? (
                        <Text style={[styles.documentSize, isMine && styles.documentSizeMine]}>
                          {formatFileSize(item.documentSizeBytes)}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ) : item.messageType === "poll" && item.pollId ? (
                  <PollMessageCard
                    poll={pollDataByMessageId.get(item.id) ?? null}
                    isMine={isMine}
                    currentUserId={session?.user.id ?? ""}
                    votingOptionId={votingPollOptionId}
                    onVote={(optionId) => handleVotePollOption(item.id, item.pollId!, optionId)}
                    onToggleClosed={() => handleTogglePollClosed(item.id, item.pollId!)}
                    onDelete={() => handleDeletePoll(item.pollId!)}
                  />
                ) : item.messageType === "event" && item.eventId ? (
                  <EventMessageCard
                    event={eventDataByMessageId.get(item.id) ?? null}
                    isMine={isMine}
                    onViewEvent={() => resolveEventPath && router.push(resolveEventPath(item.eventId!))}
                  />
                ) : item.messageType === "meeting" && item.meetingId ? (
                  <MeetingMessageCard
                    meeting={meetingDataByMessageId.get(item.id) ?? null}
                    isMine={isMine}
                    onViewMeeting={() => resolveMeetingPath && router.push(resolveMeetingPath(item.meetingId!))}
                  />
                ) : (
                  <Text style={[styles.body, isMine && styles.bodyMine]}>
                    {renderBodyWithMentions(item.body ?? "", item.mentions, isMine ? styles.mentionTextMine : styles.mentionText)}
                  </Text>
                )}
                <View style={styles.bubbleFooter}>
                  <Text style={[styles.timestampInline, isMine && styles.timestampInlineMine]}>{formatTime(item.createdAt)}</Text>
                  {isMine && <MaterialIcons name="check-circle" size={13} color={colors.primary} />}
                  {!item.deletedAt && (
                    <TouchableOpacity
                      style={styles.kebabButton}
                      hitSlop={8}
                      onPress={() => setActionsMessage(item)}
                    >
                      <MaterialIcons name="more-vert" size={16} color={isMine ? colors.onPrimary : colors.onSurfaceVariant} />
                    </TouchableOpacity>
                  )}
                </View>
                {!item.deletedAt && grouped.size > 0 && (
                  <View style={styles.reactionsRow}>
                    {[...grouped.entries()].map(([emoji, count]) => (
                      <TouchableOpacity key={emoji} onPress={() => handleReact(item.id, emoji)}>
                        <Text style={[styles.reaction, myEmojis.has(emoji) && styles.reactionActive]}>
                          {emoji} {count}
                        </Text>
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
            {headerMenu && (
              <TouchableOpacity style={styles.gridMenuButton} onPress={() => setHeaderMenuOpen((v) => !v)}>
                <MaterialIcons name="grid-view" size={18} color={colors.onSurface} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </BlurView>

      {headerMenuOpen && headerMenu && (
        <View style={[styles.headerMenuDropdown, { top: HEADER_HEIGHT + insets.top }]}>
          {headerMenu.map((item) => (
            <TouchableOpacity
              key={item.path}
              style={styles.headerMenuRow}
              onPress={() => {
                setHeaderMenuOpen(false);
                router.push(item.path);
              }}
            >
              <MaterialIcons name={item.icon} size={18} color={colors.primary} />
              <Text style={styles.headerMenuLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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
                    {m.deletedAt
                      ? "This message was deleted"
                      : m.messageType === "photo"
                        ? "📷 Photo"
                        : m.messageType === "document"
                          ? `📄 ${m.documentName ?? "Document"}`
                          : m.messageType === "poll"
                            ? `📊 ${pollDataByMessageId.get(m.id)?.question ?? "Poll"}`
                            : m.messageType === "event"
                              ? `📅 ${eventDataByMessageId.get(m.id)?.title ?? "Event"}`
                              : m.messageType === "meeting"
                                ? `🗓️ ${meetingDataByMessageId.get(m.id)?.title ?? "Meeting"}`
                                : m.body}
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

      {pendingDocument && (
        <View style={styles.photoPreviewRow}>
          <MaterialIcons name="insert-drive-file" size={28} color={colors.primary} />
          <Text style={styles.documentPreviewName} numberOfLines={1}>
            {pendingDocument.name}
          </Text>
          <TouchableOpacity style={styles.photoPreviewCancel} onPress={() => setPendingDocument(null)} disabled={sendingDocument}>
            <MaterialIcons name="close" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoPreviewSend} onPress={handleSendDocument} disabled={sendingDocument}>
            {sendingDocument ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <MaterialIcons name="send" size={18} color={colors.onPrimary} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {attachMenuOpen && attachMenu && (
        <View style={styles.attachGrid}>
          <TouchableOpacity style={styles.attachGridItem} onPress={handlePickPhoto}>
            <View style={styles.attachGridIconBadge}>
              <MaterialIcons name="photo-library" size={24} color={colors.onPrimary} />
            </View>
            <Text style={styles.attachGridLabel}>Photos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachGridItem} onPress={handlePickCamera}>
            <View style={[styles.attachGridIconBadge, styles.attachGridIconBadgeAlt]}>
              <MaterialIcons name="photo-camera" size={24} color={colors.onPrimary} />
            </View>
            <Text style={styles.attachGridLabel}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachGridItem} onPress={handlePickDocument}>
            <View style={[styles.attachGridIconBadge, styles.attachGridIconBadgeAlt2]}>
              <MaterialIcons name="insert-drive-file" size={24} color={colors.onPrimary} />
            </View>
            <Text style={styles.attachGridLabel}>Document</Text>
          </TouchableOpacity>
          {isAdmin && attachMenu.createPollPath && (
            <TouchableOpacity
              style={styles.attachGridItem}
              onPress={() => {
                setAttachMenuOpen(false);
                router.push(`${attachMenu.createPollPath}?from=chat`);
              }}
            >
              <View style={[styles.attachGridIconBadge, styles.attachGridIconBadgeAlt3]}>
                <MaterialIcons name="how-to-vote" size={24} color={colors.onPrimary} />
              </View>
              <Text style={styles.attachGridLabel}>Poll</Text>
            </TouchableOpacity>
          )}
          {isAdmin && attachMenu.createEventPath && (
            <TouchableOpacity
              style={styles.attachGridItem}
              onPress={() => {
                setAttachMenuOpen(false);
                router.push(`${attachMenu.createEventPath}?from=chat`);
              }}
            >
              <View style={[styles.attachGridIconBadge, styles.attachGridIconBadgeAlt4]}>
                <MaterialIcons name="event" size={24} color={colors.onPrimary} />
              </View>
              <Text style={styles.attachGridLabel}>Event</Text>
            </TouchableOpacity>
          )}
          {isAdmin && attachMenu.createMeetingPath && (
            <TouchableOpacity
              style={styles.attachGridItem}
              onPress={() => {
                setAttachMenuOpen(false);
                router.push(`${attachMenu.createMeetingPath}?from=chat`);
              }}
            >
              <View style={[styles.attachGridIconBadge, styles.attachGridIconBadgeAlt4]}>
                <MaterialIcons name="groups" size={24} color={colors.onPrimary} />
              </View>
              <Text style={styles.attachGridLabel}>Meeting</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {mentionSuggestions.length > 0 && (
        <View style={styles.mentionSuggestions}>
          {mentionSuggestions.map((candidate) => (
            <TouchableOpacity
              key={candidate.id}
              style={styles.mentionSuggestionRow}
              onPress={() => handleSelectMention(candidate)}
            >
              <View style={styles.mentionSuggestionAvatar}>
                <Text style={styles.mentionSuggestionAvatarInitial}>
                  {candidate.fullName.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
              <Text style={styles.mentionSuggestionName}>{candidate.fullName}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        {attachMenu ? (
          <TouchableOpacity
            style={styles.photoButton}
            onPress={handleToggleAttachMenu}
            disabled={sendingPhoto || !!pendingPhoto || sendingDocument || !!pendingDocument}
          >
            <MaterialIcons name={attachMenuOpen ? "keyboard" : "add"} size={22} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.photoButton} onPress={handlePickPhoto} disabled={sendingPhoto || !!pendingPhoto}>
            <MaterialIcons name="add" size={22} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}
        <View style={styles.inputPill}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={`Message ${placeholderName}`}
            placeholderTextColor={colors.onSurfaceVariant}
            value={draft}
            onChangeText={handleDraftChange}
            onFocus={() => setAttachMenuOpen(false)}
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

      {/* The ⋮ actions popup — reaction row + Pin/Delete/Report, replacing
          what used to be an always-visible text row under every message.
          Long-press is the native-idiomatic trigger for this same menu
          (WhatsApp-style) but isn't a discoverable gesture on web, so the
          corner ⋮ is the trigger on every platform for now; onLongPress
          can be added as an additional native-only trigger for the same
          menu later without changing this modal at all. */}
      <Modal visible={actionsMessage !== null} transparent animationType="fade" onRequestClose={() => setActionsMessage(null)}>
        <TouchableOpacity style={styles.actionsBackdrop} activeOpacity={1} onPress={() => setActionsMessage(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.actionsCard} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.actionsEmojiRow}>
              {REACTION_OPTIONS.map((emoji) => (
                <TouchableOpacity key={emoji} onPress={() => actionsMessage && handleReact(actionsMessage.id, emoji)}>
                  <Text style={styles.actionsEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionsDivider} />
            {isAdmin && (
              <TouchableOpacity
                style={styles.actionsMenuItem}
                onPress={() => {
                  if (actionsMessage) handleTogglePin(actionsMessage);
                  setActionsMessage(null);
                }}
              >
                <MaterialIcons name="push-pin" size={18} color={colors.onSurface} />
                <Text style={styles.actionsMenuItemText}>{actionsMessage?.pinned ? "Unpin" : "Pin"}</Text>
              </TouchableOpacity>
            )}
            {actionsMessage && (isAdmin || actionsMessage.senderId === session?.user.id) && (
              <TouchableOpacity
                style={styles.actionsMenuItem}
                onPress={() => {
                  handleDelete(actionsMessage);
                  setActionsMessage(null);
                }}
              >
                <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                <Text style={[styles.actionsMenuItemText, styles.actionsMenuItemTextDanger]}>Delete</Text>
              </TouchableOpacity>
            )}
            {actionsMessage && actionsMessage.senderId !== session?.user.id && (
              <TouchableOpacity
                style={styles.actionsMenuItem}
                disabled={reportedIds.has(actionsMessage.id)}
                onPress={() => {
                  handleReport(actionsMessage);
                  setActionsMessage(null);
                }}
              >
                <MaterialIcons name="flag" size={18} color={colors.onSurfaceVariant} />
                <Text style={styles.actionsMenuItemText}>
                  {reportedIds.has(actionsMessage.id) ? "Reported" : "Report"}
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// Renders a message body with any @mentions (resolved against this
// message's own message_mentions rows — see lib/mentions.ts) swapped for
// a visually distinct inline Text span — shared by the plain body, photo
// caption, and announcement headline, all of which render item.body the
// same way.
function renderBodyWithMentions(body: string, mentions: MentionCandidate[], mentionStyle: TextStyle) {
  return highlightMentions(body, mentions).map((segment, index) =>
    segment.type === "mention" ? (
      <Text key={index} style={mentionStyle}>
        @{segment.name}
      </Text>
    ) : (
      segment.value
    )
  );
}

// The inline poll card a "poll" chat message renders as
// (0071_poll_event_chat_messages.sql) — renders the same PollCard the full
// Poll detail screen uses (status badge, creator/scope line, per-option
// voter eye icon, creator-only Close/Delete), per a founder request that
// chat's poll bubble shouldn't need a "View Poll" link-out for anything.
// Reuses the exact same castVote/fetchPoll/setPollClosed/deletePoll
// lib/polls.ts calls PollDetailScreen does, so behavior can't drift
// between the two surfaces.
function PollMessageCard({
  poll,
  isMine,
  currentUserId,
  votingOptionId,
  onVote,
  onToggleClosed,
  onDelete,
}: {
  poll: PollDetail | null;
  isMine: boolean;
  currentUserId: string;
  votingOptionId: string | null;
  onVote: (optionId: string) => void;
  onToggleClosed: () => void;
  onDelete: () => void;
}) {
  if (!poll) {
    return <ActivityIndicator size="small" color={isMine ? colors.onPrimary : colors.primary} />;
  }
  return (
    <View style={styles.pollCard}>
      <PollCard
        poll={poll}
        currentUserId={currentUserId}
        votingOptionId={votingOptionId}
        onVote={onVote}
        onToggleClosed={onToggleClosed}
        onDelete={onDelete}
      />
    </View>
  );
}

// The linkable event card an "event" chat message renders as — no inline
// interactivity (this app has no RSVP concept), just enough to recognize
// it and jump straight to the real event detail screen.
function EventMessageCard({
  event,
  isMine,
  onViewEvent,
}: {
  event: DisplayCalendarEvent | null;
  isMine: boolean;
  onViewEvent: () => void;
}) {
  if (!event) {
    return <ActivityIndicator size="small" color={isMine ? colors.onPrimary : colors.primary} />;
  }
  return (
    <View style={styles.eventCard}>
      <View style={styles.eventCardHeader}>
        <MaterialIcons name="event" size={18} color={isMine ? colors.onPrimary : colors.primary} />
        <Text style={[styles.eventCardTitle, isMine && styles.bodyMine]} numberOfLines={1}>
          {event.title}
        </Text>
      </View>
      <Text style={[styles.eventCardDate, isMine && styles.eventCardMetaMine]}>
        {new Date(event.startAt).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </Text>
      {event.location && (
        <Text style={[styles.eventCardLocation, isMine && styles.eventCardMetaMine]} numberOfLines={1}>
          📍 {event.location}
        </Text>
      )}
      <TouchableOpacity style={styles.eventCardButton} onPress={onViewEvent}>
        <Text style={styles.eventCardButtonText}>View Event</Text>
      </TouchableOpacity>
    </View>
  );
}

// Same shape as EventMessageCard — an Eboard meeting has no RSVP concept
// either, just a title/date/link card linking out to the real meeting
// detail screen (which shows the description/"Added by" and Edit/Delete
// for the creator).
function MeetingMessageCard({
  meeting,
  isMine,
  onViewMeeting,
}: {
  meeting: EboardMeeting | null;
  isMine: boolean;
  onViewMeeting: () => void;
}) {
  if (!meeting) {
    return <ActivityIndicator size="small" color={isMine ? colors.onPrimary : colors.primary} />;
  }
  return (
    <View style={styles.eventCard}>
      <View style={styles.eventCardHeader}>
        <MaterialIcons name="groups" size={18} color={isMine ? colors.onPrimary : colors.primary} />
        <Text style={[styles.eventCardTitle, isMine && styles.bodyMine]} numberOfLines={1}>
          {meeting.title}
        </Text>
      </View>
      <Text style={[styles.eventCardDate, isMine && styles.eventCardMetaMine]}>
        {new Date(meeting.meetingAt).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </Text>
      <TouchableOpacity style={styles.eventCardButton} onPress={onViewMeeting}>
        <Text style={styles.eventCardButtonText}>View Meeting</Text>
      </TouchableOpacity>
    </View>
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
  gridMenuButton: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  headerMenuDropdown: {
    position: "absolute",
    right: spacing.gutter,
    zIndex: 45,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingVertical: spacing.stackSm,
    minWidth: 160,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  headerMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
  },
  headerMenuLabel: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
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
  mentionText: { fontWeight: "700", color: colors.primary },
  mentionTextMine: { fontWeight: "700", color: colors.onPrimary, textDecorationLine: "underline" },
  deletedText: { ...typography.bodyMd, fontSize: 15, color: colors.onSurfaceVariant, fontStyle: "italic" },
  photoBubbleImage: { width: 220, height: 220, borderRadius: radii.DEFAULT, backgroundColor: colors.surfaceVariant },
  documentBubble: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm, minWidth: 180 },
  documentBubbleText: { flex: 1 },
  documentName: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
  documentSize: { ...typography.labelSm, fontSize: 11, color: colors.onSurfaceVariant },
  documentSizeMine: { color: colors.onPrimary, opacity: 0.8 },
  // PollCard's own text is always dark-on-light (colors.onSurface etc,
  // same as the full detail screen) — needs its own light backdrop here
  // since it can land inside the orange gradient "mine" bubble
  // (bubbleMine), not just the already-near-white "theirs" one.
  pollCard: {
    minWidth: 240,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    padding: spacing.gutter,
  },
  eventCard: { gap: spacing.stackSm, minWidth: 200 },
  eventCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  eventCardTitle: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.onSurface, flexShrink: 1 },
  eventCardDate: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant },
  eventCardLocation: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant },
  eventCardMetaMine: { color: colors.onPrimary, opacity: 0.85 },
  eventCardButton: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.md,
    paddingVertical: spacing.stackSm,
    alignItems: "center",
  },
  eventCardButtonText: { ...typography.labelSm, fontSize: 12, color: colors.onPrimaryContainer },
  timestampInline: { ...typography.labelSm, fontSize: 9, color: colors.onSurfaceVariant, textTransform: "none" },
  timestampInlineMine: { color: colors.onPrimary, opacity: 0.8 },
  bubbleFooter: { flexDirection: "row", alignItems: "center", gap: spacing.unit, marginTop: spacing.unit, justifyContent: "flex-end" },
  kebabButton: { marginLeft: 2, padding: 2 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.stackSm, marginTop: spacing.stackSm },
  reaction: { fontSize: 13, color: colors.onSurfaceVariant },
  reactionActive: { color: colors.primary, fontWeight: "700" },
  pinAction: { fontSize: 13, color: colors.primary },
  actionsBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: spacing.marginMobile },
  actionsCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    padding: spacing.gutter,
  },
  actionsEmojiRow: { flexDirection: "row", justifyContent: "space-between", paddingBottom: spacing.gutter },
  actionsEmoji: { fontSize: 26 },
  actionsDivider: { height: 1, backgroundColor: colors.outlineVariant, marginBottom: spacing.stackSm },
  actionsMenuItem: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm + 4, paddingVertical: spacing.stackSm + 4 },
  actionsMenuItemText: { ...typography.bodyMd, fontSize: 15, color: colors.onSurface },
  actionsMenuItemTextDanger: { color: colors.error },
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
  mentionSuggestions: {
    marginHorizontal: spacing.stackSm,
    marginBottom: spacing.unit,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.DEFAULT,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: "hidden",
  },
  mentionSuggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
  },
  mentionSuggestionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  mentionSuggestionAvatarInitial: { ...typography.labelSm, fontSize: 12, color: colors.primary },
  mentionSuggestionName: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
  documentPreviewName: { flex: 1, ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
  photoPreviewCancel: { padding: spacing.unit + 2 },
  photoPreviewSend: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  attachGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.gutter,
    padding: spacing.gutter,
    backgroundColor: colors.surfaceContainerLow,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  attachGridItem: { alignItems: "center", gap: spacing.unit, width: 72 },
  attachGridIconBadge: {
    width: 52,
    height: 52,
    borderRadius: radii.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  attachGridIconBadgeAlt: { backgroundColor: colors.secondary },
  attachGridIconBadgeAlt2: { backgroundColor: colors.tertiary },
  attachGridIconBadgeAlt3: { backgroundColor: colors.inverseSurface },
  attachGridIconBadgeAlt4: { backgroundColor: colors.error },
  attachGridLabel: { ...typography.labelSm, fontSize: 11, color: colors.onSurface, textTransform: "none" },
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
