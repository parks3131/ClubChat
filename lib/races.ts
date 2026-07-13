import { supabase } from "./supabase";
import type { JoinRequestStatus } from "../types/database";

export interface RaceListItem {
  id: string;
  clubId: string;
  name: string;
  eventDate: string;
  access: "admin" | "member" | "none";
  requestStatus: JoinRequestStatus | null;
}

// Races themselves are readable by every club member (RLS: is_club_member),
// but whether the *current* user can enter one (chat/roster/etc.) depends
// on race_members/race_join_requests, which is_club_admin/isAdmin already
// covers for admins. Fetched as three separate queries rather than a join
// since race_members/race_join_requests only ever return the caller's own
// rows for a non-admin (RLS), which is exactly the shape needed here.
export async function fetchRaces(clubId: string, isClubAdmin: boolean): Promise<RaceListItem[]> {
  const { data: races, error } = await supabase
    .from("races")
    .select("id, club_id, name, event_date")
    .eq("club_id", clubId)
    .order("event_date", { ascending: true });

  if (error) throw error;
  if (!races || races.length === 0) return [];

  const raceIds = races.map((r) => r.id);

  const [{ data: memberships }, { data: requests }] = await Promise.all([
    supabase.from("race_members").select("race_id").in("race_id", raceIds),
    supabase.from("race_join_requests").select("race_id, status").in("race_id", raceIds),
  ]);

  const memberRaceIds = new Set((memberships ?? []).map((m) => m.race_id));
  const statusByRaceId = new Map((requests ?? []).map((r) => [r.race_id, r.status]));

  return races.map((r) => ({
    id: r.id,
    clubId: r.club_id,
    name: r.name,
    eventDate: r.event_date,
    access: isClubAdmin ? "admin" : memberRaceIds.has(r.id) ? "member" : "none",
    requestStatus: statusByRaceId.get(r.id) ?? null,
  }));
}

export async function createRace(params: { clubId: string; name: string; eventDate: string; createdBy: string }) {
  const { data, error } = await supabase
    .from("races")
    .insert({
      club_id: params.clubId,
      name: params.name,
      event_date: params.eventDate,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function requestJoinRace(raceId: string): Promise<"joined" | "requested"> {
  const { data, error } = await supabase.rpc("request_join_race", { target_race_id: raceId });
  if (error) throw error;
  return data as "joined" | "requested";
}

export interface RaceDetail {
  id: string;
  clubId: string;
  name: string;
  eventDate: string;
  channelId: string;
}

export async function fetchRace(raceId: string): Promise<RaceDetail> {
  const [{ data: race, error: raceError }, { data: channel, error: channelError }] = await Promise.all([
    supabase.from("races").select("id, club_id, name, event_date").eq("id", raceId).single(),
    supabase.from("channels").select("id").eq("race_id", raceId).single(),
  ]);

  if (raceError) throw raceError;
  if (channelError) throw channelError;

  return {
    id: race.id,
    clubId: race.club_id,
    name: race.name,
    eventDate: race.event_date,
    channelId: channel.id,
  };
}

export interface RaceMemberRow {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  joinedAt: string;
}

export async function fetchRaceMembers(raceId: string): Promise<RaceMemberRow[]> {
  const { data: members, error } = await supabase
    .from("race_members")
    .select("user_id, joined_at")
    .eq("race_id", raceId)
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
    joinedAt: m.joined_at,
  }));
}

export interface RaceJoinRequestRow {
  id: string;
  userId: string;
  fullName: string;
  createdAt: string;
}

export async function fetchPendingRaceRequests(raceId: string): Promise<RaceJoinRequestRow[]> {
  const { data: requests, error } = await supabase
    .from("race_join_requests")
    .select("id, user_id, created_at")
    .eq("race_id", raceId)
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

export async function decideRaceJoinRequest(requestId: string, approve: boolean) {
  const { error } = await supabase.rpc("decide_race_join_request", { request_id: requestId, approve });
  if (error) throw error;
}

export async function addRaceMember(raceId: string, userId: string) {
  const { error } = await supabase.from("race_members").insert({ race_id: raceId, user_id: userId });
  if (error) throw error;
}

export async function removeRaceMember(raceId: string, userId: string) {
  const { error } = await supabase.from("race_members").delete().eq("race_id", raceId).eq("user_id", userId);
  if (error) throw error;
}

export interface SearchedClubMember {
  id: string;
  fullName: string;
}

// Club members not already in the race, matching by name — the pool an
// admin can add directly to a race (mirrors lib/members.ts's
// searchUsersToAdd, scoped down to this club's own roster instead of
// every profile in the system, since race membership must be a subset of
// club membership).
export async function searchClubMembersToAdd(
  clubId: string,
  query: string,
  excludeIds: string[]
): Promise<SearchedClubMember[]> {
  const { data: memberRows, error } = await supabase.from("club_members").select("user_id").eq("club_id", clubId);
  if (error) throw error;

  const clubMemberIds = (memberRows ?? []).map((m) => m.user_id);
  if (clubMemberIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", clubMemberIds)
    .ilike("full_name", `%${query}%`)
    .limit(10);

  if (profilesError) throw profilesError;

  const exclude = new Set(excludeIds);
  return (profiles ?? []).filter((p) => !exclude.has(p.id)).map((p) => ({ id: p.id, fullName: p.full_name }));
}

export interface RaceLocationInfo {
  description: string | null;
  locationLink: string | null;
  hotelLink: string | null;
  photosLink: string | null;
  resultsLink: string | null;
}

// "Meet Information" — originally two separate task #20/#21 features
// (Photos + Result Link, and Location & Accommodation) with their own
// screens, consolidated by founder request into one combined section
// right after both shipped. All 5 fields live directly on races (no new
// table/RLS either way — the existing "admins can update races" policy
// from 0016_races.sql already covers every column here) and are edited
// together as one form with a single Save, matching how Location &
// Accommodation always worked. View-mode empty-state differs per field:
// description/location/hotel are hidden entirely when empty, while
// photos/results keep their original "stay tuned" placeholder text — a
// deliberate, requested inconsistency, not an oversight (see docs/HISTORY.md).
export async function fetchRaceLocationInfo(raceId: string): Promise<RaceLocationInfo> {
  const { data, error } = await supabase
    .from("races")
    .select("info_description, location_link, hotel_link, photos_link, results_link")
    .eq("id", raceId)
    .single();
  if (error) throw error;
  return {
    description: data.info_description,
    locationLink: data.location_link,
    hotelLink: data.hotel_link,
    photosLink: data.photos_link,
    resultsLink: data.results_link,
  };
}

export async function updateRaceLocationInfo(raceId: string, info: RaceLocationInfo) {
  const { error } = await supabase
    .from("races")
    .update({
      info_description: info.description,
      location_link: info.locationLink,
      hotel_link: info.hotelLink,
      photos_link: info.photosLink,
      results_link: info.resultsLink,
    })
    .eq("id", raceId);
  if (error) throw error;
}
