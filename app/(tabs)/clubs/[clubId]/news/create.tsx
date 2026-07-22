import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { useAuth } from "../../../../../contexts/AuthProvider";
import { createClubPost, fetchClubPost, updateClubPost, uploadClubPostPhoto } from "../../../../../lib/clubPosts";
import { pickImageOnWeb } from "../../../../../lib/pickImageOnWeb";
import { reportError } from "../../../../../lib/reportError";
import { useClub } from "../_layout";

// Same Kinetic-styled input as event/create.tsx.
function KineticInput({ style, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      style={[styles.input, focused && styles.inputFocused, style]}
      placeholderTextColor={colors.outline + "80"}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
    />
  );
}

export default function CreateOrEditPostScreen() {
  const { clubId, postId } = useLocalSearchParams<{ clubId: string; postId?: string }>();
  const club = useClub();
  const { session } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const isEditing = !!postId;

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? "Edit post" : "New post" });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!club.isAdmin) {
      if (router.canGoBack()) router.back();
      else router.replace(`/clubs/${clubId}/news`);
    }
  }, [club.isAdmin, router, clubId]);

  const [body, setBody] = useState("");
  const [pickedPhoto, setPickedPhoto] = useState<{ uri: string; contentType: string } | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    setLoading(true);
    fetchClubPost(postId!)
      .then((existing) => {
        if (!existing) return;
        setBody(existing.body ?? "");
        setExistingPhotoUrl(existing.photoUrl);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [isEditing, postId, retryToken]);

  const handlePickPhoto = async () => {
    try {
      let asset: { uri: string; mimeType: string } | null;
      if (Platform.OS === "web") {
        asset = await pickImageOnWeb();
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          reportError(new Error("Photo library access is required to add a photo."));
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
        asset =
          result.canceled || !result.assets?.[0]
            ? null
            : { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType ?? "image/jpeg" };
      }
      if (!asset) return;
      setPickedPhoto({ uri: asset.uri, contentType: asset.mimeType });
      setRemoveExistingPhoto(false);
    } catch (err) {
      reportError(err);
    }
  };

  const handleRemovePhoto = () => {
    setPickedPhoto(null);
    setRemoveExistingPhoto(true);
  };

  const previewUri = pickedPhoto?.uri ?? (removeExistingPhoto ? null : existingPhotoUrl);
  const hasPhoto = !!previewUri;

  const handleSave = async () => {
    if (!session) return;
    setError(null);

    if (!body.trim() && !hasPhoto) {
      setError("Add a photo or write an update.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        let mediaUrl: string | null | undefined;
        if (pickedPhoto) mediaUrl = await uploadClubPostPhoto(clubId, pickedPhoto);
        else if (removeExistingPhoto) mediaUrl = null;
        await updateClubPost(postId!, { body: body.trim() || null, mediaUrl });
        router.replace(`/clubs/${clubId}/news`);
      } else {
        const mediaUrl = pickedPhoto ? await uploadClubPostPhoto(clubId, pickedPhoto) : null;
        await createClubPost({ clubId, createdBy: session.user.id, body: body.trim() || null, mediaUrl });
        router.replace(`/clubs/${clubId}/news`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <LoadError message="Couldn't load this post." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{isEditing ? "EDIT POST" : "NEW POST"}</Text>
          <View style={styles.titleUnderline} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Photo (optional)</Text>
          {previewUri ? (
            <View>
              <Image source={{ uri: previewUri }} style={styles.photoPreview} resizeMode="cover" />
              <TouchableOpacity style={styles.removePhotoButton} onPress={handleRemovePhoto}>
                <MaterialIcons name="close" size={16} color={colors.error} />
                <Text style={styles.removePhotoText}>Remove photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addPhotoButton} onPress={handlePickPhoto}>
              <MaterialIcons name="add-a-photo" size={22} color={colors.primary} />
              <Text style={styles.addPhotoText}>Add a photo</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Update</Text>
          <KineticInput
            style={styles.multiline}
            placeholder="Share a club update, race recap, or shoutout..."
            value={body}
            onChangeText={setBody}
            multiline
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Text style={styles.buttonText}>{isEditing ? "SAVE POST" : "POST"}</Text>
              <MaterialIcons name="send" size={20} color={colors.onPrimary} />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.marginMobile, gap: spacing.stackMd },
  titleWrap: { gap: spacing.stackSm, marginBottom: spacing.unit },
  title: { ...typography.displayXl, fontSize: 34, color: colors.onSurface, letterSpacing: 0 },
  titleUnderline: { height: 4, width: 96, backgroundColor: colors.primary, borderRadius: radii.full },
  field: { gap: spacing.unit },
  label: { ...typography.labelSm, color: colors.primary, letterSpacing: 1 },
  input: {
    ...typography.bodyMd,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.gutter,
    color: colors.onSurface,
  },
  inputFocused: { borderColor: colors.primary },
  multiline: { height: 140, textAlignVertical: "top" },
  addPhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.stackSm,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderStyle: "dashed",
    borderRadius: radii.lg,
    paddingVertical: spacing.gutter + 8,
    backgroundColor: colors.surfaceContainerLowest,
  },
  addPhotoText: { ...typography.bodyMd, color: colors.primary },
  photoPreview: { width: "100%", height: 200, borderRadius: radii.lg, backgroundColor: colors.surfaceContainerHigh },
  removePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: spacing.stackSm,
  },
  removePhotoText: { ...typography.labelSm, color: colors.error },
  error: { ...typography.bodyMd, color: colors.error, textAlign: "center" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.stackSm,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.gutter,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.statValue, color: colors.onPrimary, letterSpacing: 1 },
});
