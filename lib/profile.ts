import { supabase } from "./supabase";

export interface Profile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string;
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, bio")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return { id: data.id, fullName: data.full_name, avatarUrl: data.avatar_url, bio: data.bio };
}

export async function updateProfile(userId: string, params: { fullName: string; bio: string }) {
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: params.fullName, bio: params.bio })
    .eq("id", userId);
  if (error) throw error;
}

// Path has no extension — Supabase Storage serves the stored content-type
// regardless, and always overwriting the same path keeps "one avatar per
// user" simple (upsert instead of tracking/deleting old files).
export async function uploadAvatar(userId: string, fileUri: string, contentType: string): Promise<string> {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const path = `${userId}/avatar`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-bust so re-uploading the same path shows immediately instead of
  // a stale cached image at the same URL.
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", userId);
  if (updateError) throw updateError;

  return publicUrl;
}
