import { useRouter } from "expo-router";
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
import { joinClubByCode, joinOrRequestClub, searchClubs, type SearchedClub } from "../../../lib/clubs";

type Mode = "code" | "search";

export default function JoinClubScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("search");

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
    if (mode !== "search") return;
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
  }, [query, mode]);

  const handleJoinByCode = async () => {
    setCodeError(null);
    setCodeLoading(true);
    try {
      const club = await joinClubByCode(code.trim());
      router.replace(`/clubs/${club.id}/chat`);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Invalid invite code");
    } finally {
      setCodeLoading(false);
    }
  };

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
      <Text style={styles.title}>Join a club</Text>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeOption, mode === "search" && styles.modeOptionActive]}
          onPress={() => setMode("search")}
        >
          <Text style={[styles.modeText, mode === "search" && styles.modeTextActive]}>Find a club</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeOption, mode === "code" && styles.modeOptionActive]}
          onPress={() => setMode("code")}
        >
          <Text style={[styles.modeText, mode === "code" && styles.modeTextActive]}>Invite code</Text>
        </TouchableOpacity>
      </View>

      {mode === "code" ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Invite code"
            autoCapitalize="none"
            value={code}
            onChangeText={setCode}
          />

          {codeError && <Text style={styles.error}>{codeError}</Text>}

          <TouchableOpacity
            style={[styles.button, (!code || codeLoading) && styles.buttonDisabled]}
            onPress={handleJoinByCode}
            disabled={!code || codeLoading}
          >
            {codeLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Search clubs by name"
            autoCapitalize="none"
            value={query}
            onChangeText={setQuery}
          />

          {searchError && <Text style={styles.error}>{searchError}</Text>}

          {searching && <ActivityIndicator style={{ marginTop: 8 }} />}

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            style={styles.resultsList}
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
                      <ActivityIndicator color="#fff" size="small" />
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
              query.trim().length >= 2 && !searching ? (
                <Text style={styles.empty}>No clubs found.</Text>
              ) : null
            }
          />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  modeOption: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, alignItems: "center" },
  modeOptionActive: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  modeText: { fontWeight: "600", color: "#334155" },
  modeTextActive: { color: "#2563eb" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 14, fontSize: 16 },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626", textAlign: "center" },
  resultsList: { flexGrow: 0 },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  resultInfo: { flex: 1, marginRight: 8 },
  resultName: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  resultMeta: { fontSize: 12, color: "#64748b", marginTop: 2 },
  joinButton: { backgroundColor: "#2563eb", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  joinButtonDisabled: { backgroundColor: "#94a3b8" },
  joinButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  empty: { textAlign: "center", marginTop: 24, color: "#888" },
});
