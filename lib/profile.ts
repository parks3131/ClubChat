import { supabase } from "./supabase";

export interface Profile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string;
  city: string;
  dateOfBirth: string | null;
  school: string;
}

// Works for any user, not just the caller — profiles are readable by any
// authenticated user (see 0003_rls.sql), which is what lets a member view
// another member's profile card from the roster.
export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, bio, city, date_of_birth, school")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return {
    id: data.id,
    fullName: data.full_name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    city: data.city,
    dateOfBirth: data.date_of_birth,
    school: data.school,
  };
}

// Avoid `new Date(iso)`, which parses "YYYY-MM-DD" as UTC midnight and
// then shifts a day earlier once rendered in a timezone behind UTC.
// Building the Date from local y/m/d components sidesteps that entirely.
export function formatDateOfBirth(iso: string | null): string {
  if (!iso) return "Not set";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function updateProfile(
  userId: string,
  params: { fullName: string; bio: string; city: string; dateOfBirth: string | null; school: string }
) {
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: params.fullName,
      bio: params.bio,
      city: params.city,
      date_of_birth: params.dateOfBirth,
      school: params.school,
    })
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

// Anonymizes the caller's profile and disables their login (see
// 0028_account_deletion.sql for why this is anonymize-not-hard-delete).
// Does not sign the caller out — the RPC only blocks *future*
// sign-in/token-refresh, so the caller must still call
// supabase.auth.signOut() right after this resolves.
export async function deleteAccount() {
  const { error } = await supabase.rpc("delete_account");
  if (error) throw error;
}
