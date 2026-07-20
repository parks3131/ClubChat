import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../../../constants/theme";
import { useAuth } from "../../../contexts/AuthProvider";
import { fetchMyClubs, type ClubWithRole } from "../../../lib/clubs";

export default function ClubsListScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoading(true);

      fetchMyClubs(session.user.id)
        .then((data) => {
          if (!cancelled) setClubs(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load clubs");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>My Clubs</Text>
          <Text style={styles.subtitle}>Manage your teams and athletic communities</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/clubs/create")}>
          <MaterialIcons name="add-circle" size={18} color={colors.onPrimary} />
          <Text style={styles.primaryButtonText}>Create a Club</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/clubs/join")}>
          <MaterialIcons name="explore" size={18} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Join a Club</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.clubRow} onPress={() => router.push(`/clubs/${item.id}`)}>
              <View style={styles.clubRowLeft}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.clubAvatar} />
                ) : (
                  <View style={[styles.clubAvatar, styles.clubAvatarPlaceholder]}>
                    <Text style={styles.clubAvatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.clubName}>{item.name}</Text>
                  {item.sport && <Text style={styles.clubSport}>{item.sport}</Text>}
                </View>
              </View>
              <View style={styles.clubRowRight}>
                <Text style={[styles.roleBadge, item.role !== "member" ? styles.adminBadge : styles.memberBadge]}>
                  {item.role === "owner" ? "Owner" : item.role === "admin" ? "Admin" : "Member"}
                </Text>
                <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="groups" size={48} color={colors.outline} />
              <Text style={styles.emptyTitle}>No clubs yet?</Text>
              <Text style={styles.emptyBody}>
                Every champion needs a team. Join an existing club or lead your own squad to victory.
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/clubs/create")}>
                <Text style={styles.primaryButtonText}>Create your first club</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.marginMobile },
  headerRow: { marginBottom: spacing.gutter },
  title: { ...typography.headlineLgMobile, color: colors.onSurface },
  subtitle: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: spacing.unit, textTransform: "none" },
  actions: { flexDirection: "row", gap: spacing.stackSm, marginBottom: spacing.gutter },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.unit,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 4,
  },
  primaryButtonText: { ...typography.labelSm, color: colors.onPrimary, textTransform: "uppercase" },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.unit,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 4,
  },
  secondaryButtonText: { ...typography.labelSm, color: colors.primary, textTransform: "uppercase" },
  list: { gap: spacing.stackSm, paddingBottom: 24 },
  clubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  clubRowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.gutter, flex: 1 },
  clubAvatar: { width: 56, height: 56, borderRadius: 28 },
  clubAvatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  clubAvatarInitial: { ...typography.headlineLgMobile, fontSize: 20, color: colors.primary },
  clubName: { ...typography.bodyMd, fontWeight: "700", color: colors.onSurface, fontSize: 17 },
  clubSport: { ...typography.labelSm, color: colors.onSecondaryContainer, marginTop: 2, textTransform: "none" },
  clubRowRight: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  roleBadge: { ...typography.labelSm, borderRadius: radii.full, paddingHorizontal: spacing.stackSm, paddingVertical: 4, overflow: "hidden" },
  adminBadge: { backgroundColor: colors.primaryFixed, color: colors.onPrimaryFixedVariant },
  memberBadge: { backgroundColor: colors.surfaceVariant, color: colors.onSurfaceVariant },
  emptyState: { alignItems: "center", marginTop: 60, gap: spacing.stackSm, paddingHorizontal: spacing.gutter },
  emptyTitle: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onSurface },
  emptyBody: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: "center", maxWidth: 280 },
  error: { color: colors.error, textAlign: "center", marginTop: 40 },
});
