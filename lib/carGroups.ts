import { supabase } from "./supabase";

export interface CarGroupMember {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface CarGroup {
  id: string;
  raceId: string;
  name: string;
  inchargeUserId: string | null;
  inchargeName: string | null;
  members: CarGroupMember[];
}

export async function fetchCarGroups(raceId: string): Promise<CarGroup[]> {
  const { data: groups, error } = await supabase
    .from("race_car_groups")
    .select("id, race_id, name, incharge_user_id")
    .eq("race_id", raceId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!groups || groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);

  const { data: memberRows, error: membersError } = await supabase
    .from("race_car_group_members")
    .select("car_group_id, user_id")
    .in("car_group_id", groupIds);
  if (membersError) throw membersError;

  const profileIds = [
    ...new Set([...(memberRows ?? []).map((m) => m.user_id), ...groups.map((g) => g.incharge_user_id).filter((id): id is string => !!id)]),
  ];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", profileIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const membersByGroup = new Map<string, CarGroupMember[]>();
  for (const m of memberRows ?? []) {
    const member: CarGroupMember = {
      userId: m.user_id,
      fullName: profileById.get(m.user_id)?.full_name ?? "Unknown",
      avatarUrl: profileById.get(m.user_id)?.avatar_url ?? null,
    };
    membersByGroup.set(m.car_group_id, [...(membersByGroup.get(m.car_group_id) ?? []), member]);
  }

  return groups.map((g) => ({
    id: g.id,
    raceId: g.race_id,
    name: g.name,
    inchargeUserId: g.incharge_user_id,
    inchargeName: g.incharge_user_id ? profileById.get(g.incharge_user_id)?.full_name ?? "Unknown" : null,
    members: membersByGroup.get(g.id) ?? [],
  }));
}

export async function createCarGroup(params: { raceId: string; name: string; createdBy: string }) {
  const { data, error } = await supabase
    .from("race_car_groups")
    .insert({ race_id: params.raceId, name: params.name, created_by: params.createdBy })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCarGroup(groupId: string) {
  const { error } = await supabase.from("race_car_groups").delete().eq("id", groupId);
  if (error) throw error;
}

export async function addCarGroupMember(params: { carGroupId: string; raceId: string; userId: string; addedBy: string }) {
  const { error } = await supabase.from("race_car_group_members").insert({
    car_group_id: params.carGroupId,
    race_id: params.raceId,
    user_id: params.userId,
    added_by: params.addedBy,
  });
  if (error) throw error;
}

export async function removeCarGroupMember(carGroupId: string, userId: string) {
  const { error } = await supabase
    .from("race_car_group_members")
    .delete()
    .eq("car_group_id", carGroupId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function setCarGroupIncharge(groupId: string, userId: string | null) {
  const { error } = await supabase.rpc("set_car_group_incharge", { p_group_id: groupId, p_user_id: userId });
  if (error) throw error;
}

export interface SearchedRaceParticipant {
  id: string;
  fullName: string;
}

// The pool an admin can add to a car group: this race's own roster
// (approved race_members) plus the club's admins, who have automatic
// race access without a race_members row — mirrors is_user_race_participant
// in migration 0021. Excludes anyone already in *any* group for this
// race, since a person can only belong to one car group per race.
export async function searchRaceParticipantsToAdd(
  raceId: string,
  clubId: string,
  query: string,
  excludeIds: string[]
): Promise<SearchedRaceParticipant[]> {
  const [{ data: memberRows, error: memberError }, { data: adminRows, error: adminError }] = await Promise.all([
    supabase.from("race_members").select("user_id").eq("race_id", raceId),
    supabase.from("club_members").select("user_id").eq("club_id", clubId).eq("role", "admin"),
  ]);
  if (memberError) throw memberError;
  if (adminError) throw adminError;

  const participantIds = [...new Set([...(memberRows ?? []).map((m) => m.user_id), ...(adminRows ?? []).map((a) => a.user_id)])];
  if (participantIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", participantIds)
    .ilike("full_name", `%${query}%`)
    .limit(10);

  if (profilesError) throw profilesError;

  const exclude = new Set(excludeIds);
  return (profiles ?? []).filter((p) => !exclude.has(p.id)).map((p) => ({ id: p.id, fullName: p.full_name }));
}
