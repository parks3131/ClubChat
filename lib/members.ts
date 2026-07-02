import { supabase } from "./supabase";
import type { ClubRole } from "../types/database";

export interface ClubMemberRow {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  role: ClubRole;
  joinedAt: string;
}

export async function fetchClubMembers(clubId: string): Promise<ClubMemberRow[]> {
  const { data: members, error } = await supabase
    .from("club_members")
    .select("user_id, role, joined_at")
    .eq("club_id", clubId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  if (!members || members.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", members.map((m) => m.user_id));

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return members.map((m) => ({
    userId: m.user_id,
    fullName: profileById.get(m.user_id)?.full_name ?? "Unknown",
    avatarUrl: profileById.get(m.user_id)?.avatar_url ?? null,
    role: m.role,
    joinedAt: m.joined_at,
  }));
}

export async function promoteToAdmin(clubId: string, userId: string) {
  const { error } = await supabase
    .from("club_members")
    .update({ role: "admin" })
    .eq("club_id", clubId)
    .eq("user_id", userId);
  if (error) throw error;
}

export interface JoinRequestRow {
  id: string;
  userId: string;
  fullName: string;
  createdAt: string;
}

export async function fetchPendingRequests(clubId: string): Promise<JoinRequestRow[]> {
  const { data: requests, error } = await supabase
    .from("club_join_requests")
    .select("id, user_id, created_at")
    .eq("club_id", clubId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!requests || requests.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", requests.map((r) => r.user_id));

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return requests.map((r) => ({
    id: r.id,
    userId: r.user_id,
    fullName: nameById.get(r.user_id) ?? "Unknown",
    createdAt: r.created_at,
  }));
}

export async function decideJoinRequest(requestId: string, approve: boolean) {
  const { error } = await supabase.rpc("decide_join_request", { request_id: requestId, approve });
  if (error) throw error;
}

export async function removeMember(clubId: string, userId: string) {
  const { error } = await supabase.from("club_members").delete().eq("club_id", clubId).eq("user_id", userId);
  if (error) throw error;
}

export interface SearchedUser {
  id: string;
  fullName: string;
}

export async function searchUsersToAdd(query: string, excludeIds: string[]): Promise<SearchedUser[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", `%${query}%`)
    .limit(10);

  if (error) throw error;
  const exclude = new Set(excludeIds);
  return (data ?? []).filter((p) => !exclude.has(p.id)).map((p) => ({ id: p.id, fullName: p.full_name }));
}

export async function addMember(clubId: string, userId: string) {
  const { error } = await supabase.from("club_members").insert({ club_id: clubId, user_id: userId, role: "member" });
  if (error) throw error;
}
