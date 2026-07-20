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

// .select() lets us tell a real success apart from RLS silently filtering
// the row out (0 rows affected, no error) — e.g. an Admin (not Owner)
// trying to demote/remove another Admin. Without it the caller would see
// a false "success" with nothing actually changed.
export async function promoteToAdmin(clubId: string, userId: string) {
  const { data, error } = await supabase
    .from("club_members")
    .update({ role: "admin" })
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Not authorized to promote this member.");
}

export async function demoteToMember(clubId: string, userId: string) {
  const { data, error } = await supabase
    .from("club_members")
    .update({ role: "member" })
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Not authorized to demote this admin.");
}

// Owner-only. The outgoing Owner becomes an Admin (server-enforced by the
// transfer_ownership RPC, not just a client convention).
export async function transferOwnership(clubId: string, newOwnerUserId: string) {
  const { error } = await supabase.rpc("transfer_ownership", {
    target_club_id: clubId,
    new_owner_user_id: newOwnerUserId,
  });
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

// Handles remove_member and remove_admin both — RLS differentiates by the
// target's current role (Owner/Admin can remove a Member, only Owner can
// remove an Admin outright, and the Owner's own row can never be removed
// this way). .select() detects RLS silently filtering to 0 rows so an
// unauthorized attempt surfaces as an error instead of a false success.
export async function removeMember(clubId: string, userId: string) {
  const { data, error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Not authorized to remove this member.");
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
