import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import {
  fetchRaceAccess,
  fetchRaceLocationInfo,
  fetchRaceProfile,
  requestJoinRace,
  type RaceAccess,
  type RaceLocationInfo,
  type RaceProfile,
} from "../../../../../lib/races";
import { useClub } from "../_layout";

function formatEventDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const EMPTY_INFO: RaceLocationInfo = {
  description: null,
  locationLink: null,
  hotelLink: null,
  photosLink: null,
  resultsLink: null,
};

// Reachable by any club member (races' own "club members can read races"
// RLS policy already covers races + their Meet Information columns) who
// isn't yet a race_members participant — previously that tap did nothing
// at all, since races/index.tsx only offered a small inline "Request"
// button and the full race/[raceId] Stack turns away anyone who isn't a
// manager or member (see race/[raceId]/_layout.tsx). Deliberately its own
// standalone screen rather than widening that Stack's gate: carpool/
// roster/polls are all intentionally member-only as of tasks #44/#46/#50,
// so this only exposes name/date/Meet Information (already publicly
// readable to the whole club) plus the same request action.
export default function RacePreviewScreen() {
  const club = useClub();
  const router = useRouter();
  const { session } = useAuth();
  const { raceId } = useLocalSearchParams<{ raceId: string }>();

  const [profile, setProfile] = useState<RaceProfile | null>(null);
  const [info, setInfo] = useState<RaceLocationInfo>(EMPTY_INFO);
  const [access, setAccess] = useState<RaceAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [p, i, a] = await Promise.all([
      fetchRaceProfile(raceId),
      fetchRaceLocationInfo(raceId),
      fetchRaceAccess(raceId, session.user.id),
    ]);
    setProfile(p);
    setInfo(i);
    setAccess(a);
  }, [raceId, session]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      load()
        .then(() => {
          if (!cancelled) setLoadError(false);
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  // Direct-URL safety net: an admin or an already-approved member has
  // full access to the real hub, so this preview isn't meant for them —
  // send them there instead of showing the stripped-down request view.
  useEffect(() => {
    if (!loading && (club.isAdmin || access?.isMember)) {
      router.replace(`/clubs/${club.clubId}/race/${raceId}`);
    }
  }, [loading, club.isAdmin, access?.isMember, club.clubId, raceId, router]);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await requestJoinRace(raceId);
      await load();
    } finally {
      setRequesting(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this race." onRetry={load} />;
  }

  if (loading || !profile || !access || club.isAdmin || access.isMember) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.date}>{formatEventDate(profile.eventDate)}</Text>
      </View>

      {info.description && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Info</Text>
          <Text style={styles.description}>{info.description}</Text>
        </View>
      )}

      {info.locationLink && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Race/Event Location</Text>
          <TouchableOpacity onPress={() => Linking.openURL(info.locationLink!)}>
            <Text style={styles.link}>{info.locationLink}</Text>
          </TouchableOpacity>
        </View>
      )}

      {info.hotelLink && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Hotel</Text>
          <TouchableOpacity onPress={() => Linking.openURL(info.hotelLink!)}>
            <Text style={styles.link}>{info.hotelLink}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Photos</Text>
        {info.photosLink ? (
          <TouchableOpacity onPress={() => Linking.openURL(info.photosLink!)}>
            <Text style={styles.link}>{info.photosLink}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.placeholder}>No photos link added yet — stay tuned!</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Result Link</Text>
        {info.resultsLink ? (
          <TouchableOpacity onPress={() => Linking.openURL(info.resultsLink!)}>
            <Text style={styles.link}>{info.resultsLink}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.placeholder}>No result link added yet — stay tuned!</Text>
        )}
      </View>

      {access.requestStatus === "pending" ? (
        <Text style={styles.requested}>Requested — waiting on an admin to approve.</Text>
      ) : (
        <TouchableOpacity style={styles.requestButton} disabled={requesting} onPress={handleRequest}>
          {requesting ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={styles.requestButtonText}>Request to join</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.marginMobile, gap: spacing.stackSm },
  identity: { alignItems: "center", marginBottom: spacing.gutter },
  name: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface, textAlign: "center" },
  date: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.unit },
  section: { marginBottom: spacing.gutter },
  sectionLabel: { ...typography.labelSm, color: colors.onSurfaceVariant },
  description: { ...typography.bodyMd, fontSize: 15, color: colors.onSurface, marginTop: spacing.unit, lineHeight: 21 },
  link: { ...typography.bodyMd, fontSize: 15, color: colors.primary, marginTop: spacing.unit, textDecorationLine: "underline" },
  placeholder: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: spacing.unit },
  requested: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, fontStyle: "italic", textAlign: "center", marginTop: spacing.gutter },
  requestButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 4,
    alignItems: "center",
    marginTop: spacing.gutter,
  },
  requestButtonText: { ...typography.headlineLgMobile, fontSize: 16, color: colors.onPrimary },
});
