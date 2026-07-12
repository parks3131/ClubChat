import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LEGAL_LAST_UPDATED, type LegalSection } from "../lib/legalContent";

export function LegalDocument({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.updated}>Last updated: {LEGAL_LAST_UPDATED}</Text>
      {sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading}>{section.heading}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48, maxWidth: 640, alignSelf: "center", width: "100%" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  updated: { fontSize: 13, color: "#94a3b8", marginBottom: 24 },
  section: { marginBottom: 20 },
  heading: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 6 },
  body: { fontSize: 15, color: "#334155", lineHeight: 22 },
});
