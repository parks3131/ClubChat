import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../constants/theme";
import { formatCountdown } from "../lib/dates";
import { fetchPollVoters, isPollEffectivelyClosed, type PollDetail, type PollVoter } from "../lib/polls";
import { reportError } from "../lib/reportError";

// The full poll UI — status badge, creator/scope line, votable options with
// a per-option voter-list eye icon, creator-only Close/Delete — extracted
// out of what used to be PollDetailScreen's own render so the exact same
// view can be reused as the inline chat poll card (founder request: chat's
// poll bubble should look and behave like the full detail screen instead
// of a condensed "View Poll" link-out). Voters are fetched lazily per
// option on first tap of its eye icon, not prefetched for every option up
// front the way PollDetailScreen used to — chat can render many poll cards
// in one screen at once, so eager-fetching every option's voters for all
// of them would be wasteful.
interface Props {
  poll: PollDetail;
  currentUserId: string;
  votingOptionId: string | null;
  onVote: (optionId: string) => void;
  onToggleClosed: () => void;
  onDelete: () => void;
}

export function PollCard({ poll, currentUserId, votingOptionId, onVote, onToggleClosed, onDelete }: Props) {
  const [voters, setVoters] = useState<Record<string, PollVoter[]>>({});
  const [votersLoading, setVotersLoading] = useState(false);
  const [votersModalOptionId, setVotersModalOptionId] = useState<string | null>(null);
  const [optionDropdownOpen, setOptionDropdownOpen] = useState(false);

  const isCreator = poll.createdBy === currentUserId;
  const canSeeVoters = !poll.isPrivate || isCreator;
  const closed = isPollEffectivelyClosed(poll);

  const openVoters = (optionId: string) => {
    setVotersModalOptionId(optionId);
    setOptionDropdownOpen(false);
    if (voters[optionId]) return;
    setVotersLoading(true);
    fetchPollVoters(poll.id)
      .then(setVoters)
      .catch(reportError)
      .finally(() => setVotersLoading(false));
  };

  const handleDelete = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Delete this poll? This can't be undone.")) {
        onDelete();
      }
      return;
    }

    Alert.alert("Delete poll?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  };

  return (
    <View>
      <View style={styles.statusRow}>
        {closed ? (
          <View style={styles.closedBadge}>
            <MaterialIcons name="lock" size={12} color={colors.onSurface} />
            <Text style={styles.closedBadgeText}>{poll.isClosed ? "CLOSED" : "ENDED"}</Text>
          </View>
        ) : (
          <View style={styles.activeTag}>
            <Text style={styles.activeTagText}>ACTIVE</Text>
          </View>
        )}
        {!closed && poll.closesAt && (
          <View style={styles.countdownBadge}>
            <MaterialIcons name="timer" size={12} color={colors.inverseOnSurface} />
            <Text style={styles.countdownText}>{formatCountdown(poll.closesAt)}</Text>
          </View>
        )}
      </View>

      <Text style={styles.question}>{poll.question}</Text>
      <Text style={styles.meta}>
        Created by {poll.createdByName} · {poll.allowMultiple ? "Multiple choice" : "Single choice"}
        {poll.isPrivate ? " · Private vote" : ""}
      </Text>

      <View style={styles.optionsBlock}>
        {poll.options.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[styles.optionRow, option.votedByMe && styles.optionRowSelected]}
            disabled={closed || votingOptionId === option.id}
            onPress={() => onVote(option.id)}
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionText}>
                {option.votedByMe ? "✓ " : ""}
                {option.text}
              </Text>
              <View style={styles.optionHeaderRight}>
                <Text style={styles.optionCount}>{option.voteCount}</Text>
                {canSeeVoters && option.voteCount > 0 && (
                  <TouchableOpacity
                    style={styles.viewVotersButton}
                    hitSlop={8}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      openVoters(option.id);
                    }}
                  >
                    <MaterialIcons name="visibility" size={18} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {poll.isPrivate && !isCreator && (
        <Text style={styles.privateNote}>This is a private vote — only {poll.createdByName} can see who voted for what.</Text>
      )}

      {isCreator && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.closeButton} onPress={onToggleClosed}>
            <Text style={styles.closeButtonText}>{poll.isClosed ? "Reopen Poll" : "Close Poll"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={votersModalOptionId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setVotersModalOptionId(null);
          setOptionDropdownOpen(false);
        }}
      >
        <View style={styles.votersBackdrop}>
          <View style={styles.votersCard}>
            <View style={styles.votersHeader}>
              <Text style={styles.votersTitle}>Voters</Text>
              <TouchableOpacity
                onPress={() => {
                  setVotersModalOptionId(null);
                  setOptionDropdownOpen(false);
                }}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={22} color={colors.onSurface} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.dropdownHeader} onPress={() => setOptionDropdownOpen((v) => !v)}>
              <Text style={styles.dropdownHeaderText}>
                {poll.options.find((o) => o.id === votersModalOptionId)?.text ?? ""}
              </Text>
              <MaterialIcons name={optionDropdownOpen ? "arrow-drop-up" : "arrow-drop-down"} size={22} color={colors.onSurface} />
            </TouchableOpacity>
            {optionDropdownOpen && (
              <View style={styles.dropdownList}>
                {poll.options.map((option) => (
                  <TouchableOpacity key={option.id} style={styles.dropdownItem} onPress={() => openVoters(option.id)}>
                    <Text style={styles.dropdownItemText}>{option.text}</Text>
                    <Text style={styles.dropdownItemCount}>{option.voteCount}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {votersLoading ? (
              <ActivityIndicator style={styles.votersLoading} color={colors.primary} />
            ) : (
              <ScrollView style={styles.votersList}>
                {(votersModalOptionId ? voters[votersModalOptionId] ?? [] : []).length === 0 ? (
                  <Text style={styles.noVotersText}>No votes yet.</Text>
                ) : (
                  (votersModalOptionId ? voters[votersModalOptionId] ?? [] : []).map((voter) => (
                    <View key={voter.userId} style={styles.voterRow}>
                      {voter.avatarUrl ? (
                        <Image source={{ uri: voter.avatarUrl }} style={styles.voterAvatar} />
                      ) : (
                        <View style={[styles.voterAvatar, styles.voterAvatarPlaceholder]}>
                          <Text style={styles.voterAvatarInitial}>{voter.fullName.charAt(0).toUpperCase() || "?"}</Text>
                        </View>
                      )}
                      <Text style={styles.voterName}>{voter.fullName}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: "row", gap: spacing.stackSm, marginBottom: spacing.stackSm },
  activeTag: { backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: spacing.stackSm, paddingVertical: 2, alignSelf: "flex-start" },
  activeTagText: { ...typography.labelSm, fontSize: 10, color: colors.onPrimary },
  closedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  closedBadgeText: { ...typography.labelSm, fontSize: 10, color: colors.onSurface },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.inverseSurface,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  countdownText: { ...typography.labelSm, fontSize: 10, color: colors.inverseOnSurface },
  question: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onSurface },
  meta: { ...typography.bodyMd, fontSize: 12, color: colors.onSurfaceVariant, marginTop: spacing.stackSm, marginBottom: spacing.stackMd },
  optionsBlock: { gap: spacing.stackSm },
  optionRow: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  optionRowSelected: { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
  optionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  optionText: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.onSurface, flexShrink: 1 },
  optionHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  optionCount: { ...typography.statValue, fontSize: 15, color: colors.primaryContainer },
  viewVotersButton: { padding: 2 },
  privateNote: { ...typography.bodyMd, fontSize: 11, color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: spacing.stackMd },
  actions: { flexDirection: "row", gap: spacing.gutter, marginTop: spacing.stackMd },
  closeButton: { flex: 1, backgroundColor: colors.primaryContainer, borderRadius: radii.md, padding: spacing.stackSm + 4, alignItems: "center" },
  closeButtonText: { ...typography.labelSm, fontSize: 12, color: colors.onPrimaryContainer },
  deleteButton: { flex: 1, backgroundColor: colors.errorContainer, borderRadius: radii.md, padding: spacing.stackSm + 4, alignItems: "center" },
  deleteButtonText: { ...typography.labelSm, fontSize: 12, color: colors.onErrorContainer },
  votersBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: spacing.marginMobile },
  votersCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    padding: spacing.gutter,
  },
  votersHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.stackMd },
  votersTitle: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onSurface },
  dropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 2,
  },
  dropdownHeaderText: { ...typography.bodyMd, fontSize: 15, fontWeight: "700", color: colors.onSurface, flexShrink: 1 },
  dropdownList: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.md,
    marginTop: spacing.stackSm,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  dropdownItemText: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface, flexShrink: 1 },
  dropdownItemCount: { ...typography.statValue, fontSize: 14, color: colors.primaryContainer },
  votersLoading: { marginTop: spacing.stackMd },
  votersList: { marginTop: spacing.stackMd },
  noVotersText: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, fontStyle: "italic", paddingVertical: spacing.stackMd },
  voterRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm + 4, paddingVertical: spacing.stackSm + 2 },
  voterAvatar: { width: 32, height: 32, borderRadius: 16 },
  voterAvatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  voterAvatarInitial: { ...typography.labelSm, fontSize: 13, color: colors.primary },
  voterName: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
});
