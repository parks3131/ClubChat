import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../constants/theme";

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
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.gutter, gap: spacing.gutter, backgroundColor: colors.surface },
  message: { color: colors.error, ...typography.bodyMd, textAlign: "center" },
  retryButton: { backgroundColor: colors.primary, borderRadius: radii.full, paddingHorizontal: spacing.gutter + 4, paddingVertical: spacing.stackSm + 2 },
  retryButtonText: { color: colors.onPrimary, fontWeight: "600" },
});
