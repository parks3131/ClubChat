import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { requestJoinEboardChannel } from "../../../../../lib/eboard";
import { useEboard } from "./_layout";

const SECTIONS: { key: string; label: string }[] = [
  { key: "chat", label: "Chat" },
  { key: "meetings", label: "Meetings" },
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
        <Text style={styles.emptyTitle}>No Eboard & Council channel yet</Text>
        <Text style={styles.emptyBody}>
          A private space for club admins, separate from the main club chat.
        </Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/create`)}
        >
          <Text style={styles.actionButtonText}>+ Create Eboard & Council</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!eboard.channel.isMember) {
    const status = eboard.channel.requestStatus;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{eboard.channel.name}</Text>
        {eboard.channel.description ? <Text style={styles.description}>{eboard.channel.description}</Text> : null}
        {status === "pending" ? (
          <Text style={styles.requested}>Requested — waiting on an existing member to approve.</Text>
        ) : (
          <TouchableOpacity style={styles.actionButton} disabled={requesting} onPress={handleRequest}>
            <Text style={styles.actionButtonText}>{requesting ? "Requesting…" : "Request to join"}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {eboard.channel.description ? <Text style={styles.description}>{eboard.channel.description}</Text> : null}
      {SECTIONS.map((section) => (
        <TouchableOpacity
          key={section.key}
          style={styles.row}
          onPress={() => router.push(`/clubs/${eboard.clubId}/eboard/${section.key}`)}
        >
          <Text style={styles.rowLabel}>{section.label}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  description: { fontSize: 14, color: "#64748b", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginTop: 24 },
  emptyBody: { fontSize: 14, color: "#64748b" },
  requested: { fontSize: 14, color: "#94a3b8", fontStyle: "italic", marginTop: 8 },
  actionButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 8,
  },
  actionButtonText: { color: "#fff", fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowLabel: { fontSize: 17, fontWeight: "600", color: "#0f172a" },
  chevron: { fontSize: 20, color: "#94a3b8" },
});
