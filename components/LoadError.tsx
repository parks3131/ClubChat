import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message ?? "Something went wrong loading this."}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  message: { color: "#dc2626", fontSize: 15, textAlign: "center" },
  retryButton: { backgroundColor: "#2563eb", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryButtonText: { color: "#fff", fontWeight: "600" },
});
