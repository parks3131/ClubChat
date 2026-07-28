import { signStorageUrls } from "./signedUrlCache";
import { supabase } from "./supabase";
import { readUploadBody } from "./uploadBody";
import { randomUUID } from "./uuid";

export interface ClubPost {
  id: string;
  clubId: string;
  createdBy: string;
  createdByName: string;
  createdByAvatarUrl: string | null;
  body: string | null;
  photoUrl: string | null;
  createdAt: string;
  reactions: { emoji: string; userId: string }[];
}

// club-post-photos is a private bucket (0062_club_post_photos_storage.sql)
// gated the same way message-photos is, and signed through the same
// memoizing helper so the URL stays stable enough to cache (ADR-0004).
const signPhotoUrls = (paths: string[]) => signStorageUrls("club-post-photos", paths);

export async function fetchClubPosts(clubId: string): Promise<ClubPost[]> {
  const { data: posts, error } = await supabase
    .from("club_posts")
    .select("id, club_id, created_by, body, media_url, created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!posts || posts.length === 0) return [];

  const creatorIds = [...new Set(posts.map((p) => p.created_by))];
  const postIds = posts.map((p) => p.id);
  const photoPaths = posts.filter((p) => p.media_url).map((p) => p.media_url as string);

  const [{ data: profiles }, { data: reactions }, signedUrlByPath] = await Promise.all([
    supabase.from("profiles").select("id, full_name, avatar_url").in("id", creatorIds),
    supabase.from("club_post_reactions").select("post_id, user_id, emoji").in("post_id", postIds),
    signPhotoUrls(photoPaths),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const reactionsByPost = new Map<string, { emoji: string; userId: string }[]>();
  for (const r of reactions ?? []) {
    const list = reactionsByPost.get(r.post_id) ?? [];
    list.push({ emoji: r.emoji, userId: r.user_id });
    reactionsByPost.set(r.post_id, list);
  }

  return posts.map((p) => ({
    id: p.id,
    clubId: p.club_id,
    createdBy: p.created_by,
    createdByName: profileById.get(p.created_by)?.full_name ?? "Unknown",
    createdByAvatarUrl: profileById.get(p.created_by)?.avatar_url ?? null,
    body: p.body,
    photoUrl: p.media_url ? (signedUrlByPath.get(p.media_url) ?? null) : null,
    createdAt: p.created_at,
    reactions: reactionsByPost.get(p.id) ?? [],
  }));
}

export async function uploadClubPostPhoto(
  clubId: string,
  photo: { uri: string; contentType: string }
): Promise<string> {
  const body = await readUploadBody(photo.uri);
  const ext = photo.contentType.split("/")[1] ?? "jpg";
  const path = `${clubId}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("club-post-photos")
    .upload(path, body, { contentType: photo.contentType });
  if (error) throw error;
  return path;
}

export async function createClubPost(params: {
  clubId: string;
  createdBy: string;
  body: string | null;
  mediaUrl: string | null;
}) {
  const { error } = await supabase.from("club_posts").insert({
    club_id: params.clubId,
    created_by: params.createdBy,
    body: params.body,
    media_url: params.mediaUrl,
  });
  if (error) throw error;
}

export async function fetchClubPost(postId: string): Promise<ClubPost | null> {
  const { data, error } = await supabase
    .from("club_posts")
    .select("id, club_id, created_by, body, media_url, created_at")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [{ data: profile }, signedUrlByPath] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", data.created_by).maybeSingle(),
    data.media_url ? signPhotoUrls([data.media_url]) : Promise.resolve(new Map<string, string>()),
  ]);

  return {
    id: data.id,
    clubId: data.club_id,
    createdBy: data.created_by,
    createdByName: profile?.full_name ?? "Unknown",
    createdByAvatarUrl: profile?.avatar_url ?? null,
    body: data.body,
    photoUrl: data.media_url ? (signedUrlByPath.get(data.media_url) ?? null) : null,
    createdAt: data.created_at,
    reactions: [],
  };
}

// mediaUrl omitted entirely leaves the existing photo untouched (a plain
// partial .update() only ever touches the keys present in the object);
// pass null to remove the current photo, or a freshly uploaded path to
// replace it.
export async function updateClubPost(postId: string, params: { body: string | null; mediaUrl?: string | null }) {
  const update: { body: string | null; media_url?: string | null } = { body: params.body };
  if (params.mediaUrl !== undefined) update.media_url = params.mediaUrl;
  const { error } = await supabase.from("club_posts").update(update).eq("id", postId);
  if (error) throw error;
}

export async function deleteClubPost(postId: string) {
  const { error } = await supabase.from("club_posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function toggleClubPostReaction(postId: string, userId: string, emoji: string) {
  const { data: existing } = await supabase
    .from("club_post_reactions")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("club_post_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId)
      .eq("emoji", emoji);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("club_post_reactions").insert({ post_id: postId, user_id: userId, emoji });
    if (error) throw error;
  }
}
