import { MaterialIcons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";

// Renders briefly at "/" while the auth-guard effect in _layout.tsx
// redirects to (auth) or (tabs) based on session state.
export default function RootIndex() {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <MaterialIcons name="groups" size={56} color={colors.onPrimary} />
      </View>
      <Text style={styles.title}>ClubChat</Text>
      <Text style={styles.subtitle}>THE ATHLETIC CORE</Text>
      <ActivityIndicator style={styles.spinner} color={colors.onPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    gap: spacing.stackSm,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.stackSm,
  },
  title: { ...typography.displayXl, color: colors.onPrimary, fontStyle: "italic" },
  subtitle: {
    ...typography.labelSm,
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
    marginTop: spacing.unit,
  },
  spinner: { marginTop: spacing.stackLg },
});
