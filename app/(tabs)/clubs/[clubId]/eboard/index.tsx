import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { requestJoinEboardChannel } from "../../../../../lib/eboard";
import { useEboard } from "./_layout";

// No more member-only grid here — Chat/Meetings/Polls all now live behind
// the chat screen itself (Meetings/Polls via its header quick-nav grid,
// Chat being the screen itself), so a member is bounced straight there.
// This screen's remaining job is the two states that still need a real
// landing page: no channel created yet, and "not a member" (request-to-
// join UI, or "Manage roster" for a manager who hasn't joined).
export default function EboardHubScreen() {
  const eboard = useEboard();
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (eboard.channel?.isMember) {
      router.replace(`/clubs/${eboard.clubId}/eboard/chat`);
    }
  }, [eboard.channel, eboard.clubId, router]);

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

  // A member never actually sees this — the effect above replaces to
  // /chat before this would render anything meaningful.
  return (
    <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.marginMobile },
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
