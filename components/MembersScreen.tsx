import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radii, spacing, typography } from "../constants/theme";

export interface MembersScreenRow {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  isSelf: boolean;
  // false => no "..." menu at all: either it's the caller's own row (shows
  // a lock icon instead) or an implicit-access row with nothing backing
  // it to remove (a race's club-admin rows).
  removable: boolean;
  // club-only — never set for race/Eboard rows (there's no promotion
  // concept once role comes from club membership).
  canPromote?: boolean;
  // club-only — demote_admin_to_member is a distinct action from
  // removable (which covers both remove_member and remove_admin outright).
  canDemote?: boolean;
  // Owner-only, club-only — hands the Owner role to this row's member.
  canTransferOwnership?: boolean;
  // Purely for the inline "Owner" badge next to their name — race/Eboard
  // rows never set this, so they render no badge at all.
  role?: "owner" | "admin" | "member";
}

export interface MembersScreenRequest {
  id: string;
  userId: string;
  fullName: string;
}

interface MembersScreenProps {
  // Optional — only the main club Members screen passes this, splitting
  // the Owner out into their own section instead of lumping them into
  // Admins (which is what happens when this is left unset, e.g. race/
  // Eboard rosters).
  ownerRows?: MembersScreenRow[];
  adminRows: MembersScreenRow[];
  memberRows: MembersScreenRow[];
  requests?: MembersScreenRequest[];
  canManage: boolean;
  busyUserId: string | null;
  onDecideRequest?: (requestId: string, approve: boolean) => void;
  onPromote?: (userId: string) => void;
  onDemote?: (userId: string) => void;
  onTransferOwnership?: (userId: string) => void;
  onRemove: (userId: string) => void;
  onSearch: (query: string) => Promise<{ id: string; fullName: string }[]>;
  onAdd: (userId: string) => void;
  // Race-only: stages multiple search picks as removable chips before a
  // single batch confirm, instead of adding one at a time and closing the
  // search each tap. Club/Eboard rosters leave this unset and keep the
  // original tap-to-add-immediately flow via onAdd above.
  multiSelectAdd?: boolean;
  onAddMultiple?: (userIds: string[]) => void;
  memberPath: (userId: string) => string;
  addPlaceholder: string;
  footer?: React.ReactNode;
}

function matchesQuery(row: MembersScreenRow, query: string) {
  return row.fullName.toLowerCase().includes(query.toLowerCase());
}

export default function MembersScreen({
  ownerRows = [],
  adminRows,
  memberRows,
  requests = [],
  canManage,
  busyUserId,
  onDecideRequest,
  onPromote,
  onDemote,
  onTransferOwnership,
  onRemove,
  onSearch,
  onAdd,
  multiSelectAdd = false,
  onAddMultiple,
  memberPath,
  addPlaceholder,
  footer,
}: MembersScreenProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuRow, setMenuRow] = useState<MembersScreenRow | null>(null);

  const [showAddSearch, setShowAddSearch] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<{ id: string; fullName: string }[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  // multiSelectAdd only — people picked but not yet confirmed.
  const [stagedAdds, setStagedAdds] = useState<{ id: string; fullName: string }[]>([]);

  useEffect(() => {
    if (!showAddSearch) return;
    const trimmed = addQuery.trim();
    if (trimmed.length < 2) {
      setAddResults([]);
      return;
    }
    setAddSearching(true);
    const timeout = setTimeout(() => {
      onSearch(trimmed)
        .then((results) => {
          // Exclude anyone already staged — onSearch's own excludeIds
          // (baked in by the caller) doesn't know about picks staged
          // here that haven't been added yet.
          const stagedIds = new Set(stagedAdds.map((s) => s.id));
          setAddResults(results.filter((r) => !stagedIds.has(r.id)));
        })
        .finally(() => setAddSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [addQuery, showAddSearch, onSearch, stagedAdds]);

  const filteredOwners = useMemo(
    () => (query.trim() ? ownerRows.filter((r) => matchesQuery(r, query)) : ownerRows),
    [ownerRows, query]
  );
  const filteredAdmins = useMemo(
    () => (query.trim() ? adminRows.filter((r) => matchesQuery(r, query)) : adminRows),
    [adminRows, query]
  );
  const filteredMembers = useMemo(
    () => (query.trim() ? memberRows.filter((r) => matchesQuery(r, query)) : memberRows),
    [memberRows, query]
  );

  const sections = [
    ...(canManage && requests.length > 0 ? [{ title: "Pending requests", data: [], requests }] : []),
    ...(filteredOwners.length > 0 ? [{ title: "Owner", data: filteredOwners }] : []),
    ...(filteredAdmins.length > 0 ? [{ title: "Admins", data: filteredAdmins }] : []),
    ...(filteredMembers.length > 0 ? [{ title: "Members", data: filteredMembers }] : []),
  ] as { title: string; data: MembersScreenRow[]; requests?: MembersScreenRequest[] }[];

  const handleAdd = (user: { id: string; fullName: string }) => {
    if (multiSelectAdd) {
      setStagedAdds((prev) => [...prev, user]);
      setAddQuery("");
      setAddResults([]);
      return;
    }
    onAdd(user.id);
    setAddQuery("");
    setAddResults([]);
    setShowAddSearch(false);
  };

  const handleRemoveStaged = (userId: string) => {
    setStagedAdds((prev) => prev.filter((s) => s.id !== userId));
  };

  const handleConfirmMultiAdd = () => {
    if (stagedAdds.length === 0) return;
    onAddMultiple?.(stagedAdds.map((s) => s.id));
    setStagedAdds([]);
    setAddQuery("");
    setAddResults([]);
    setShowAddSearch(false);
  };

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.userId}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.searchWrap}>
            <MaterialIcons name="search" size={18} color={colors.onSurfaceVariant} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search members"
              placeholderTextColor={colors.onSurfaceVariant}
              value={query}
              onChangeText={setQuery}
            />
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item, section }) => {
          if (section.title === "Pending requests") return null;
          return (
            <View style={styles.row}>
              <TouchableOpacity style={styles.rowInfo} onPress={() => router.push(memberPath(item.userId))}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarInitial}>{item.fullName.charAt(0).toUpperCase() || "?"}</Text>
                  </View>
                )}
                <Text style={styles.rowName}>
                  {item.fullName}
                  {/* Redundant once there's a dedicated "Owner" section header for this row */}
                  {item.role === "owner" && section.title !== "Owner" ? (
                    <Text style={styles.ownerTag}>  Owner</Text>
                  ) : null}
                  {item.isSelf ? <Text style={styles.youTag}>  You</Text> : null}
                </Text>
              </TouchableOpacity>
              {item.isSelf ? (
                <MaterialIcons name="lock" size={18} color={colors.onSurfaceVariant + "60"} />
              ) : item.removable || item.canPromote || item.canDemote || item.canTransferOwnership ? (
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => setMenuRow(item)}
                  disabled={busyUserId === item.userId}
                >
                  {busyUserId === item.userId ? (
                    <ActivityIndicator size="small" color={colors.onSurfaceVariant} />
                  ) : (
                    <MaterialIcons name="more-vert" size={20} color={colors.onSurfaceVariant} />
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
        renderSectionFooter={({ section }) =>
          section.title === "Pending requests" ? (
            <View>
              {(section.requests ?? []).map((r) => (
                <View key={r.id} style={styles.requestRow}>
                  <Text style={styles.rowName}>{r.fullName}</Text>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={[styles.iconActionButton, styles.denyIconButton]}
                      onPress={() => onDecideRequest?.(r.id, false)}
                      disabled={busyUserId === r.userId}
                    >
                      <MaterialIcons name="close" size={18} color={colors.onErrorContainer} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconActionButton, styles.approveIconButton]}
                      onPress={() => onDecideRequest?.(r.id, true)}
                      disabled={busyUserId === r.userId}
                    >
                      <MaterialIcons name="check" size={18} color={colors.onPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>No members yet.</Text>}
        ListFooterComponent={
          <View>
            {canManage && showAddSearch && (
              <View style={styles.addSection}>
                {multiSelectAdd && stagedAdds.length > 0 && (
                  <View style={styles.stagedChipRow}>
                    {stagedAdds.map((person) => (
                      <Pressable
                        key={person.id}
                        style={styles.stagedChip}
                        onPress={() => handleRemoveStaged(person.id)}
                      >
                        <Text style={styles.stagedChipText}>{person.fullName} ✕</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <TextInput
                  style={styles.input}
                  placeholder={addPlaceholder}
                  placeholderTextColor={colors.onSurfaceVariant}
                  autoCapitalize="none"
                  autoFocus
                  value={addQuery}
                  onChangeText={setAddQuery}
                />
                {addSearching && <ActivityIndicator style={{ marginTop: spacing.stackSm }} color={colors.primary} />}
                {addResults.map((user) => (
                  <Pressable
                    key={user.id}
                    style={(state) => [styles.addResultRow, (state as { hovered?: boolean }).hovered && styles.addResultRowHovered]}
                    onPress={() => handleAdd(user)}
                  >
                    <Text style={styles.rowName}>{user.fullName}</Text>
                  </Pressable>
                ))}
                {multiSelectAdd && stagedAdds.length > 0 && (
                  <TouchableOpacity style={styles.confirmAddButton} onPress={handleConfirmMultiAdd}>
                    <Text style={styles.confirmAddButtonText}>
                      Add {stagedAdds.length} {stagedAdds.length === 1 ? "member" : "members"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {footer}
          </View>
        }
      />

      {canManage && (
        <TouchableOpacity
          style={styles.addMembersButton}
          onPress={() => {
            setShowAddSearch((v) => !v);
            setStagedAdds([]);
            setAddQuery("");
            setAddResults([]);
          }}
        >
          <MaterialIcons name="person-add" size={18} color={colors.onPrimary} />
          <Text style={styles.addMembersButtonText}>{showAddSearch ? "Close" : "Add members"}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={menuRow !== null} transparent animationType="fade" onRequestClose={() => setMenuRow(null)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuRow(null)}>
          <View style={styles.menuSheet}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuRow) router.push(memberPath(menuRow.userId));
                setMenuRow(null);
              }}
            >
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>
            {menuRow?.canPromote && onPromote && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onPromote(menuRow.userId);
                  setMenuRow(null);
                }}
              >
                <Text style={styles.menuItemText}>Make Admin</Text>
              </TouchableOpacity>
            )}
            {menuRow?.canDemote && onDemote && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onDemote(menuRow.userId);
                  setMenuRow(null);
                }}
              >
                <Text style={styles.menuItemText}>Demote to Member</Text>
              </TouchableOpacity>
            )}
            {menuRow?.canTransferOwnership && onTransferOwnership && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onTransferOwnership(menuRow.userId);
                  setMenuRow(null);
                }}
              >
                <Text style={styles.menuItemText}>Make Owner</Text>
              </TouchableOpacity>
            )}
            {menuRow?.removable && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onRemove(menuRow.userId);
                  setMenuRow(null);
                }}
              >
                <Text style={[styles.menuItemText, styles.menuItemDestructive]}>Remove</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuRow(null)}>
              <Text style={styles.menuItemText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.marginMobile, paddingBottom: 88, gap: spacing.stackSm },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.gutter,
    marginBottom: spacing.stackMd,
  },
  searchInput: { ...typography.bodyMd, flex: 1, paddingVertical: spacing.stackSm + 4, color: colors.onSurface },
  sectionTitle: {
    ...typography.statValue,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: spacing.stackMd,
    marginBottom: spacing.stackSm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackSm + 4,
    marginBottom: spacing.unit,
  },
  rowInfo: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm + 2, flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { backgroundColor: colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center" },
  avatarInitial: { ...typography.labelSm, fontSize: 15, color: colors.primary },
  rowName: { ...typography.bodyMd, fontWeight: "700", fontSize: 15, color: colors.onSurface },
  youTag: { ...typography.labelSm, fontSize: 12, color: colors.onSurfaceVariant, textTransform: "none" },
  ownerTag: { ...typography.labelSm, fontSize: 12, color: colors.primary, textTransform: "none" },
  menuButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  requestRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackSm + 4,
    marginBottom: spacing.unit,
  },
  requestActions: { flexDirection: "row", gap: spacing.stackSm },
  iconActionButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  denyIconButton: { backgroundColor: colors.errorContainer },
  approveIconButton: { backgroundColor: colors.primary },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
  addSection: { marginTop: spacing.stackMd, gap: spacing.stackSm },
  input: {
    ...typography.bodyMd,
    borderWidth: 2,
    borderColor: colors.surfaceContainerHigh,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
    color: colors.onSurface,
  },
  addResultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  addResultRowHovered: { backgroundColor: colors.primaryFixed, borderColor: colors.primary },
  stagedChipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.stackSm },
  stagedChip: {
    backgroundColor: colors.primaryFixed,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm + 4,
    paddingVertical: spacing.unit + 2,
  },
  stagedChipText: { ...typography.labelSm, fontSize: 13, color: colors.primary, textTransform: "none" },
  confirmAddButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 4,
    alignItems: "center",
    marginTop: spacing.stackSm,
  },
  confirmAddButtonText: { ...typography.labelSm, fontSize: 14, color: colors.onPrimary, textTransform: "none" },
  addMembersButton: {
    position: "absolute",
    left: spacing.marginMobile,
    right: spacing.marginMobile,
    bottom: spacing.gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.stackSm,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 6,
  },
  addMembersButtonText: { ...typography.labelSm, fontSize: 14, color: colors.onPrimary, textTransform: "none" },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  menuSheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingVertical: spacing.stackSm,
    paddingBottom: spacing.stackLg,
  },
  menuItem: { paddingVertical: spacing.stackSm + 6, paddingHorizontal: spacing.gutter },
  menuItemText: { ...typography.bodyMd, fontSize: 16, color: colors.onSurface, textAlign: "center" },
  menuItemDestructive: { color: colors.error },
});
