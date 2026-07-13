import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography, type MaterialIconName } from "../../../../../constants/theme";
import { requestJoinEboardChannel } from "../../../../../lib/eboard";
import { useEboard } from "./_layout";

const SECTIONS: { key: string; label: string; subtitle: string; icon: MaterialIconName; tint: string }[] = [
  { key: "chat", label: "Chat", subtitle: "Jump into the conversation", icon: "forum", tint: colors.primary },
  { key: "meetings", label: "Meetings", subtitle: "Upcoming & past meetings", icon: "groups", tint: colors.secondary },
  { key: "polls", label: "Polls", subtitle: "Vote on what's next", icon: "how-to-vote", tint: colors.secondary },
];

export default function EboardHubScreen() {
  const eboard = useEboard();
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);

  const handleRequest = async () => {
    if (!eboard.channel) return;
    setRequesting(true);
    try {
      await requestJoinEboardChannel(eboard.channel.id);
      await eboard.reload();
    } finally {
      setRequesting(false);
    }
  };

  if (!eboard.channel) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBadge}>
            <MaterialIcons name="shield" size={28} color={colors.onPrimary} />
          </View>
          <Text style={styles.emptyTitle}>No Eboard & Council channel yet</Text>
          <Text style={styles.emptyBody}>A private space for club admins, separate from the main club chat.</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/create`)}
          >
            <Text style={styles.actionButtonText}>+ Create Eboard & Council</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!eboard.channel.isMember) {
    const status = eboard.channel.requestStatus;
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBadge}>
            <MaterialIcons name="shield" size={28} color={colors.onPrimary} />
          </View>
          <Text style={styles.title}>{eboard.channel.name}</Text>
          {eboard.channel.description ? <Text style={styles.description}>{eboard.channel.description}</Text> : null}
          {status === "pending" ? (
            <Text style={styles.requested}>Requested — waiting on an existing member to approve.</Text>
          ) : (
            <TouchableOpacity style={styles.actionButton} disabled={requesting} onPress={handleRequest}>
              {requesting ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.actionButtonText}>Request to join</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.raceName}>{eboard.channel.name.toUpperCase()}</Text>
        {eboard.channel.description ? <Text style={styles.date}>{eboard.channel.description}</Text> : null}
      </View>

      <View style={styles.grid}>
        {SECTIONS.map((section) => (
          <TouchableOpacity
            key={section.key}
            style={styles.card}
            onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/${section.key}`)}
          >
            <View style={[styles.iconBadge, { backgroundColor: section.tint }]}>
              <MaterialIcons name={section.icon} size={22} color={colors.onPrimary} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardLabel}>{section.label.toUpperCase()}</Text>
              <Text style={styles.cardSubtitle}>{section.subtitle}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.marginMobile },
  identity: { alignItems: "center", marginBottom: spacing.gutter },
  raceName: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5, textAlign: "center" },
  date: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.unit, textAlign: "center" },
  grid: { gap: spacing.stackSm },
  card: {
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
  cardTextWrap: { flex: 1 },
  cardLabel: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  cardSubtitle: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 },
  emptyState: { alignItems: "center", marginTop: spacing.stackLg, gap: spacing.stackSm, paddingHorizontal: spacing.gutter },
  emptyIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radii.xl,
    backgroundColor: colors.inverseSurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.stackSm,
  },
  title: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onSurface, textAlign: "center" },
  emptyTitle: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onSurface, textAlign: "center" },
  description: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, textAlign: "center" },
  emptyBody: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, textAlign: "center" },
  requested: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: spacing.unit },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 4,
    paddingHorizontal: spacing.gutter + 4,
    alignItems: "center",
    marginTop: spacing.stackSm,
  },
  actionButtonText: { ...typography.labelSm, fontSize: 13, color: colors.onPrimary, textTransform: "none" },
});
