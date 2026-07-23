import * as Linking from "expo-linking";
import { supabase } from "./supabase";
import { readUploadBody } from "./uploadBody";
import type { ClubJoinPolicy, ClubRole, JoinRequestStatus } from "../types/database";

export interface ClubWithRole {
  id: string;
  name: string;
  description: string | null;
  sport: string | null;
  invite_code: string;
  avatarUrl: string | null;
  role: ClubRole;
}

export interface SearchedClub {
  id: string;
  name: string;
  description: string | null;
  sport: string | null;
  joinPolicy: ClubJoinPolicy;
  memberCount: number;
  requestStatus: JoinRequestStatus | null;
}

export interface ClubProfile {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  createdBy: string;
  joinPolicy: ClubJoinPolicy;
}

export async function fetchMyClubs(userId: string): Promise<ClubWithRole[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("club_members")
    .select("club_id, role")
    .eq("user_id", userId);

  if (membershipError) throw membershipError;
  if (!memberships || memberships.length === 0) return [];

  const clubIds = memberships.map((m) => m.club_id);
  const { data: clubs, error: clubsError } = await supabase.from("clubs").select("*").in("id", clubIds);

  if (clubsError) throw clubsError;

  const roleByClubId = new Map(memberships.map((m) => [m.club_id, m.role]));
  return (clubs ?? []).map((club) => ({
    id: club.id,
    name: club.name,
    description: club.description,
    sport: club.sport,
    invite_code: club.invite_code,
    avatarUrl: club.avatar_url,
    role: roleByClubId.get(club.id)!,
  }));
}

export async function createClub(params: {
  name: string;
  description: string;
  sport: string;
  createdBy: string;
  joinPolicy: ClubJoinPolicy;
}) {
  const { data, error } = await supabase
    .from("clubs")
    .insert({
      name: params.name,
      description: params.description || null,
      sport: params.sport || null,
      created_by: params.createdBy,
      join_policy: params.joinPolicy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function joinClubByCode(code: string) {
  const { data, error } = await supabase.rpc("join_club_by_code", { code: code.trim().toLowerCase() });
  if (error) throw error;
  return data;
}

// Wraps the club's existing invite_code (see 0006_join_requests.sql's
// comment: this was always meant to be "the intended base for a future
// shareable join-link") in a tappable deep link — /clubs/join reads the
// `code` param and auto-joins, same RPC as pasting the code by hand.
export function buildClubJoinLink(inviteCode: string): string {
  return Linking.createURL("/clubs/join", { queryParams: { code: inviteCode } });
}

export async function searchClubs(query: string): Promise<SearchedClub[]> {
  const { data, error } = await supabase.rpc("search_clubs", { query });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    sport: c.sport,
    joinPolicy: c.join_policy,
    memberCount: Number(c.member_count),
    requestStatus: c.request_status,
  }));
}

export async function joinOrRequestClub(clubId: string): Promise<"joined" | "requested"> {
  const { data, error } = await supabase.rpc("join_or_request_club", { target_club_id: clubId });
  if (error) throw error;
  return data as "joined" | "requested";
}

export async function fetchClubProfile(clubId: string): Promise<ClubProfile> {
  const { data, error } = await supabase
    .from("clubs")
    .select("id, name, description, avatar_url, created_by, join_policy")
    .eq("id", clubId)
    .single();

  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    avatarUrl: data.avatar_url,
    createdBy: data.created_by,
    joinPolicy: data.join_policy,
  };
}

// RLS: "creator can delete their club" (0040_club_eboard_delete.sql) —
// only the original creator, not every admin, given the blast radius
// (wipes chat history, members, races, Eboard, polls — everything, for
// everyone, permanently, via existing on-delete-cascade FKs).
export async function deleteClub(clubId: string) {
  const { error } = await supabase.from("clubs").delete().eq("id", clubId);
  if (error) throw error;
}

// Enforced by the existing "admins can update their club" RLS policy —
// a non-admin's call fails at the database, this doesn't add a new gate.
// Flipping join_policy to "open" also triggers handle_club_join_policy_opened
// (0053_club_join_policy_auto_approve.sql), which auto-approves every
// pending club_join_requests row instead of leaving them stuck pending.
export async function updateClubProfile(
  clubId: string,
  params: { name: string; description: string; joinPolicy: ClubJoinPolicy }
) {
  const { error } = await supabase
    .from("clubs")
    .update({ name: params.name, description: params.description || null, join_policy: params.joinPolicy })
    .eq("id", clubId);
  if (error) throw error;
}

export async function uploadClubAvatar(clubId: string, fileUri: string, contentType: string): Promise<string> {
  const body = await readUploadBody(fileUri);
  const path = `${clubId}/avatar`;

  const { error: uploadError } = await supabase.storage
    .from("club-avatars")
    .upload(path, body, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("club-avatars").getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase.from("clubs").update({ avatar_url: publicUrl }).eq("id", clubId);
  if (updateError) throw updateError;

  return publicUrl;
}
