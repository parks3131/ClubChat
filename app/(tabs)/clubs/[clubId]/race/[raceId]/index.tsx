import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography, type MaterialIconName } from "../../../../../../constants/theme";
import { useRace } from "./_layout";

const SECTIONS: { key: string; label: string; subtitle: string; icon: MaterialIconName; tint: string }[] = [
  { key: "chat", label: "Chat", subtitle: "Jump into the conversation", icon: "forum", tint: colors.primary },
  { key: "location", label: "Meet Information", subtitle: "Location, hotel, photos & results", icon: "info", tint: colors.secondary },
  { key: "carpool", label: "Car Assignments & Groups", subtitle: "Who's riding with who", icon: "directions-car", tint: colors.tertiary },
];

function formatEventDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function RaceHubScreen() {
  const race = useRace();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.raceName}>{race.name.toUpperCase()}</Text>
        <Text style={styles.date}>{formatEventDate(race.eventDate)}</Text>
      </View>

      <View style={styles.grid}>
        {SECTIONS.map((section) => (
          <TouchableOpacity
            key={section.key}
            style={styles.card}
            onPress={() => router.push(`/clubs/${race.clubId}/race/${race.raceId}/${section.key}`)}
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
  date: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.unit },
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
});
