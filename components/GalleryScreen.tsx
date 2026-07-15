import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";
import { fetchChannelPhotos, type GalleryPhoto } from "../lib/messages";
import { LoadError } from "./LoadError";

const GUTTER = 2;
const NUM_COLUMNS = 3;

// Every photo ever sent in a channel — club/race/Eboard chat all mount
// this unchanged, parametrized by channelId (same thin-wrapper pattern as
// ChatScreen/HighlightsScreen, task #16). Native Stack header (this is a
// content-grid screen like races/index.tsx, not a chat screen, so it
// doesn't need ChatScreen's custom glass header).
export default function GalleryScreen({ channelId }: { channelId: string }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewerPhotoUrl, setViewerPhotoUrl] = useState<string | null>(null);

  const reload = useCallback(() => fetchChannelPhotos(channelId).then(setPhotos), [channelId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      reload()
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
    }, [reload])
  );

  if (loadError) {
    return <LoadError message="Couldn't load the gallery." onRetry={reload} />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        key={NUM_COLUMNS}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.thumbWrap} onPress={() => setViewerPhotoUrl(item.photoUrl)}>
            <Image source={{ uri: item.photoUrl }} style={styles.thumb} resizeMode="cover" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No photos yet.</Text>}
      />

      <Modal visible={viewerPhotoUrl !== null} transparent animationType="fade" onRequestClose={() => setViewerPhotoUrl(null)}>
        <TouchableOpacity style={styles.viewerBackdrop} activeOpacity={1} onPress={() => setViewerPhotoUrl(null)}>
          {viewerPhotoUrl && <Image source={{ uri: viewerPhotoUrl }} style={styles.viewerImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  grid: { padding: GUTTER },
  thumbWrap: { flex: 1 / NUM_COLUMNS, aspectRatio: 1, padding: GUTTER },
  thumb: { flex: 1, backgroundColor: colors.surfaceContainerHigh },
  empty: { ...typography.bodyMd, textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant, padding: spacing.marginMobile },
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
});
