import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { deleteClubPost, fetchClubPosts, toggleClubPostReaction, type ClubPost } from "../../../../../lib/clubPosts";
import { timeAgo } from "../../../../../lib/dates";
import { useClub } from "../_layout";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "🔥", "🎉", "😮"];

export default function NewsFeedScreen() {
  const club = useClub();
  const { session } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [pickerPostId, setPickerPostId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchClubPosts(club.clubId)
      .then((data) => {
        setPosts(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [club.clubId]);

  useFocusEffect(load);

  const handleReact = async (postId: string, emoji: string) => {
    if (!session) return;
    setPickerPostId(null);
    await toggleClubPostReaction(postId, session.user.id, emoji);
    load();
  };

  const handleDelete = (postId: string) => {
    const doDelete = () => deleteClubPost(postId).then(load);
    if (Platform.OS === "web") {
      if (window.confirm("Delete this post? This can't be undone.")) doDelete();
      return;
    }
    Alert.alert("Delete post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load News & Highlights." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {club.isAdmin ? "No posts yet — share your first update." : "No posts yet."}
          </Text>
        }
        renderItem={({ item }) => {
          const grouped = new Map<string, number>();
          const myEmojis = new Set<string>();
          for (const r of item.reactions) {
            grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1);
            if (r.userId === session?.user.id) myEmojis.add(r.emoji);
          }

          return (
            <View style={styles.card}>
              {item.photoUrl && <Image source={{ uri: item.photoUrl }} style={styles.photo} resizeMode="cover" />}
              <View style={styles.cardBody}>
                <View style={styles.headerRow}>
                  {item.createdByAvatarUrl ? (
                    <Image source={{ uri: item.createdByAvatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>{item.createdByName.charAt(0).toUpperCase() || "?"}</Text>
                    </View>
                  )}
                  <View style={styles.headerText}>
                    <Text style={styles.creatorName}>{item.createdByName}</Text>
                    <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                  </View>
                </View>

                {item.body && <Text style={styles.body}>{item.body}</Text>}

                <View style={styles.actionsFooter}>
                  {[...grouped.entries()].map(([emoji, count]) => (
                    <TouchableOpacity key={emoji} onPress={() => handleReact(item.id, emoji)}>
                      <Text style={[styles.reaction, myEmojis.has(emoji) && styles.reactionActive]}>
                        {emoji} {count}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity onPress={() => setPickerPostId(pickerPostId === item.id ? null : item.id)}>
                    <Text style={styles.reaction}>+</Text>
                  </TouchableOpacity>
                  {club.isAdmin && (
                    <>
                      <TouchableOpacity onPress={() => router.push(`/clubs/${club.clubId}/news/create?postId=${item.id}`)}>
                        <Text style={styles.editAction}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(item.id)}>
                        <Text style={styles.deleteAction}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                {pickerPostId === item.id && (
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
      />

      {club.isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push(`/clubs/${club.clubId}/news/create`)}>
          <MaterialIcons name="add" size={22} color={colors.onPrimaryContainer} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.marginMobile, paddingBottom: 80 },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    marginBottom: spacing.gutter,
    overflow: "hidden",
  },
  photo: { width: "100%", height: 220, backgroundColor: colors.surfaceContainerHigh },
  cardBody: { padding: spacing.gutter, gap: spacing.stackSm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  avatarInitial: { ...typography.labelSm, fontSize: 14, color: colors.primary },
  headerText: { flex: 1 },
  creatorName: { ...typography.headlineLgMobile, fontSize: 15, color: colors.onSurface },
  time: { ...typography.labelSm, fontSize: 11, color: colors.onSurfaceVariant },
  body: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
  actionsFooter: { flexDirection: "row", alignItems: "center", gap: spacing.gutter, flexWrap: "wrap" },
  reaction: { fontSize: 13, color: colors.onSurfaceVariant },
  reactionActive: { color: colors.primary, fontWeight: "700" },
  editAction: { ...typography.labelSm, fontSize: 12, color: colors.secondary },
  deleteAction: { ...typography.labelSm, fontSize: 12, color: colors.error },
  pickerRow: { flexDirection: "row", gap: spacing.stackSm },
  pickerEmoji: { fontSize: 22 },
  fab: {
    position: "absolute",
    right: spacing.marginMobile,
    bottom: spacing.marginMobile,
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
