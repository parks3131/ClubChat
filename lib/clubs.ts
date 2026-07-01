import { supabase } from "./supabase";
import type { ClubRole } from "../types/database";

export interface ClubWithRole {
  id: string;
  name: string;
  description: string | null;
  sport: string | null;
  invite_code: string;
  role: ClubRole;
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
  return (clubs ?? []).map((club) => ({ ...club, role: roleByClubId.get(club.id)! }));
}

export async function createClub(params: {
  name: string;
  description: string;
  sport: string;
  createdBy: string;
}) {
  const { data, error } = await supabase
    .from("clubs")
    .insert({
      name: params.name,
      description: params.description || null,
      sport: params.sport || null,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function joinClubByCode(code: string) {
  const { data, error } = await supabase.rpc("join_club_by_code", { code });
  if (error) throw error;
  return data;
}
