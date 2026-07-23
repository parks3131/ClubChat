import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radii, spacing, typography } from "../../../constants/theme";
import { joinClubByCode, joinOrRequestClub, searchClubs, type SearchedClub } from "../../../lib/clubs";

export default function JoinClubScreen() {
  const router = useRouter();
  const { code: linkCode } = useLocalSearchParams<{ code?: string }>();

  // Invite code state
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchedClub[]>([]);
  const [searching, setSearching] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      searchClubs(trimmed)
        .then(setResults)
        .catch((err) => setSearchError(err instanceof Error ? err.message : "Search failed"))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const attemptJoinByCode = async (rawCode: string) => {
    setCodeError(null);
    setCodeLoading(true);
    try {
      const club = await joinClubByCode(rawCode);
      router.replace(`/clubs/${club.id}/chat`);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Invalid invite code");
    } finally {
      setCodeLoading(false);
    }
  };

  const handleJoinByCode = () => attemptJoinByCode(code.trim());

  // Set inside this effect (not a useState initializer) so a shared link
  // tapped again with a different `code` while this screen instance is
  // reused still picks it up — a useRef/useState seeded once at mount
  // would go stale (see SPEC.md section 6's scrollToIndex writeup for the
  // same "route param captured at declaration time" gotcha).
  useEffect(() => {
    if (!linkCode) return;
    setCode(linkCode);
    attemptJoinByCode(linkCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkCode]);

  const handleJoinFromSearch = async (club: SearchedClub) => {
    setSearchError(null);
    setJoiningId(club.id);
    try {
      const outcome = await joinOrRequestClub(club.id);
      if (outcome === "joined") {
        router.replace(`/clubs/${club.id}/chat`);
      } else {
        setResults((prev) => prev.map((c) => (c.id === club.id ? { ...c, requestStatus: "pending" } : c)));
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>FIND YOUR SQUAD</Text>
      <Text style={styles.subtitle}>Join an existing team or discover new athletic communities.</Text>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="confirmation-number" size={20} color={colors.primary} />
          <Text style={styles.cardTitle}>HAVE AN INVITE?</Text>
        </View>
        <View style={styles.codeRow}>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="Enter invite code"
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="none"
            value={code}
            onChangeText={setCode}
          />
          <TouchableOpacity
            style={[styles.joinCodeButton, (!code || codeLoading) && styles.buttonDisabled]}
            onPress={handleJoinByCode}
            disabled={!code || codeLoading}
          >
            {codeLoading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.joinCodeButtonText}>Join</Text>}
          </TouchableOpacity>
        </View>
        {codeError && <Text style={styles.error}>{codeError}</Text>}
        <Text style={styles.hint}>Codes are provided by club admins.</Text>
      </View>

      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={20} color={colors.onSurfaceVariant} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by club name or sport..."
          placeholderTextColor={colors.onSurfaceVariant}
          autoCapitalize="none"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {searchError && <Text style={styles.error}>{searchError}</Text>}
      {searching && <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        style={styles.resultsList}
        contentContainerStyle={{ gap: spacing.stackSm }}
        renderItem={({ item }) => {
          const alreadyRequested = item.requestStatus === "pending";
          return (
            <View style={styles.resultRow}>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{item.name}</Text>
                <Text style={styles.resultMeta}>
                  {item.sport ? `${item.sport} · ` : ""}
                  {item.memberCount} member{item.memberCount === 1 ? "" : "s"}
                  {item.joinPolicy === "request" ? " · Requires approval" : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.joinButton, alreadyRequested && styles.joinButtonDisabled]}
                onPress={() => handleJoinFromSearch(item)}
                disabled={joiningId === item.id || alreadyRequested}
              >
                {joiningId === item.id ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <Text style={styles.joinButtonText}>
                    {alreadyRequested ? "Requested" : item.joinPolicy === "open" ? "Join" : "Request"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          query.trim().length >= 2 && !searching ? <Text style={styles.empty}>No clubs found.</Text> : null
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.marginMobile, gap: spacing.gutter, backgroundColor: colors.surface },
  title: { ...typography.displayXl, fontSize: 30, lineHeight: 34, color: colors.onBackground, textAlign: "center" },
  subtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: "center", marginTop: -spacing.stackSm },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
    gap: spacing.stackSm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  cardTitle: { ...typography.statValue, fontSize: 16, color: colors.onSurface, textTransform: "uppercase" },
  codeRow: { flexDirection: "row", gap: spacing.stackSm },
  input: {
    ...typography.bodyMd,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 4,
    color: colors.onSurface,
  },
  codeInput: { flex: 1, textTransform: "uppercase" },
  joinCodeButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: spacing.gutter + 4,
    alignItems: "center",
    justifyContent: "center",
  },
  joinCodeButtonText: { ...typography.statValue, fontSize: 15, color: colors.onPrimary, textTransform: "uppercase" },
  buttonDisabled: { opacity: 0.5 },
  hint: { ...typography.labelSm, color: colors.onSecondaryContainer, textTransform: "none" },
  searchWrap: { position: "relative", justifyContent: "center" },
  searchIcon: { position: "absolute", left: spacing.gutter, zIndex: 1 },
  searchInput: {
    ...typography.bodyMd,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderRadius: radii.full,
    paddingLeft: 44,
    paddingRight: spacing.gutter,
    paddingVertical: spacing.stackSm + 6,
    color: colors.onSurface,
  },
  resultsList: { flex: 1 },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  resultInfo: { flex: 1, marginRight: spacing.stackSm },
  resultName: { ...typography.statValue, fontSize: 16, color: colors.onSurface },
  resultMeta: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 2, textTransform: "none" },
  joinButton: { backgroundColor: colors.primary, borderRadius: radii.full, paddingVertical: spacing.stackSm, paddingHorizontal: spacing.gutter },
  joinButtonDisabled: { backgroundColor: colors.secondary },
  joinButtonText: { ...typography.labelSm, color: colors.onPrimary, textTransform: "uppercase" },
  empty: { textAlign: "center", marginTop: 24, color: colors.onSurfaceVariant },
  error: { color: colors.error, textAlign: "center" },
});
