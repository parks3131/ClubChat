import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { deleteEboardChannel, fetchEboardMembers, type EboardMemberRow } from "../../../../../lib/eboard";
import { reportError } from "../../../../../lib/reportError";
import { useEboard } from "./_layout";

const AVATAR_STACK_SIZE = 4;

// Mirrors club-profile/index.tsx's confirmAction — Alert.alert is a no-op
// on web (SPEC.md section 6), so a destructive action needs an explicit
// web branch through window.confirm instead.
function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "OK", onPress: () => resolve(true) },
    ]);
  });
}

// Slim identity + menu screen for Eboard & Council, mirroring
// club-profile/index.tsx exactly — reached by tapping the channel name
// anywhere in its header. Only reachable once already a member (the
// header title itself only renders once `channel` exists and is tapped
// from within chat, which already gates on isMember).
export default function EboardProfileScreen() {
  const eboard = useEboard();
  const router = useRouter();

  const [members, setMembers] = useState<EboardMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(() => {
    if (!eboard.channel) return Promise.resolve();
    return fetchEboardMembers(eboard.channel.id).then(setMembers);
  }, [eboard.channel]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      reload()
        .then(() => {
          if (!cancelled) setLoadError(false);
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [reload])
  );

  const handleDelete = async () => {
    if (!eboard.channel) return;
    const proceed = await confirmAction(
      "Delete Eboard & Council?",
      `Delete ${eboard.channel.name}? This permanently deletes its chat history, membership, meetings, and polls. This can't be undone.`
    );
    if (!proceed) return;
    setDeleting(true);
    try {
      await deleteEboardChannel(eboard.channel.id);
      router.replace(`/clubs/${eboard.clubId}`);
    } catch (err) {
      reportError(err);
      setDeleting(false);
    }
  };

  if (!eboard.channel) return null;

  if (loadError) {
    return <LoadError message="Couldn't load Eboard & Council." onRetry={reload} />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const preview = members.slice(0, AVATAR_STACK_SIZE);

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.name}>{eboard.channel.name.toUpperCase()}</Text>
        {eboard.channel.description ? <Text style={styles.description}>{eboard.channel.description}</Text> : null}
      </View>

      <View style={styles.grid}>
        <TouchableOpacity style={styles.row} onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/roster`)}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="group" size={22} color={colors.onPrimary} />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>Members</Text>
            <Text style={styles.rowSubtitle}>{members.length}</Text>
          </View>
          <View style={styles.avatarStack}>
            {preview.map((m, i) => (
              <View key={m.userId} style={[styles.stackAvatarWrap, { marginLeft: i === 0 ? 0 : -10 }]}>
                {m.avatarUrl ? (
                  <Image source={{ uri: m.avatarUrl }} style={styles.stackAvatar} />
                ) : (
                  <View style={[styles.stackAvatar, styles.avatarPlaceholder]}>
                    <Text style={styles.stackAvatarInitial}>{m.fullName.charAt(0).toUpperCase() || "?"}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/gallery`)}>
          <View style={[styles.iconBadge, { backgroundColor: colors.tertiary }]}>
            <MaterialIcons name="photo-library" size={22} color={colors.onPrimary} />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>Gallery</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      {eboard.channel.isMember && (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} disabled={deleting}>
          {deleting ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Text style={styles.deleteButtonText}>Delete Eboard & Council</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.marginMobile },
  identity: { alignItems: "center", marginBottom: spacing.stackLg },
  name: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5, textAlign: "center" },
  description: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.unit, textAlign: "center" },
  grid: { gap: spacing.stackSm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  iconBadge: { width: 44, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  rowTextWrap: { flex: 1 },
  rowLabel: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  rowSubtitle: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 },
  avatarStack: { flexDirection: "row", alignItems: "center", marginRight: spacing.stackSm },
  stackAvatarWrap: { borderRadius: 16, borderWidth: 2, borderColor: colors.surfaceContainerLowest },
  stackAvatar: { width: 28, height: 28, borderRadius: 14 },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  stackAvatarInitial: { ...typography.labelSm, fontSize: 11, color: colors.primary },
  deleteButton: {
    marginTop: spacing.stackLg,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radii.lg,
    paddingVertical: spacing.stackSm + 4,
    alignItems: "center",
  },
  deleteButtonText: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.error },
});
