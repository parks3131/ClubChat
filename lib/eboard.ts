import { supabase } from "./supabase";
import { readUploadBody } from "./uploadBody";
import type { JoinRequestStatus } from "../types/database";

export interface EboardChannel {
  id: string;
  clubId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  channelId: string;
  isMember: boolean;
  requestStatus: JoinRequestStatus | null;
}

// Unlike fetchRaces, presence of an eboard_channel_members row can't be
// used as an "am I a member" proxy — its SELECT policy lets every club
// admin read the full roster regardless of their own membership (see
// migration 0017_eboard.sql), so membership/request-status are checked
// with an explicit eq("user_id", userId) instead. The channels row itself
// is only fetched once membership is confirmed: unlike races (where a
// club admin always passes is_channel_member), a non-member admin is
// genuinely blocked from reading an eboard channel's row by RLS, and
// querying it unconditionally with .single() fails with "0 rows" instead
// of just being irrelevant (a non-member never needs channelId anyway).
export async function fetchEboardChannel(clubId: string, userId: string): Promise<EboardChannel | null> {
  const { data: row, error } = await supabase
    .from("eboard_channels")
    .select("id, club_id, name, description, avatar_url")
    .eq("club_id", clubId)
    .maybeSingle();

  if (error) throw error;
  if (!row) return null;

  const [{ data: membership }, { data: request }] = await Promise.all([
    supabase.from("eboard_channel_members").select("user_id").eq("eboard_channel_id", row.id).eq("user_id", userId).maybeSingle(),
    supabase
      .from("eboard_channel_join_requests")
      .select("status")
      .eq("eboard_channel_id", row.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const isMember = !!membership;
  let channelId = "";
  if (isMember) {
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id")
      .eq("eboard_channel_id", row.id)
      .single();
    if (channelError) throw channelError;
    channelId = channel.id;
  }

  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatar_url,
    channelId,
    isMember,
    requestStatus: (request?.status as JoinRequestStatus | undefined) ?? null,
  };
}

// Enforced by the "eboard members can update their channel" RLS policy
// (0045_race_eboard_avatars.sql — eboard_channels never had an UPDATE
// policy before that migration, a genuine gap, not a regression).
export async function updateEboardProfile(eboardChannelId: string, params: { name: string; description: string }) {
  const { error } = await supabase
    .from("eboard_channels")
    .update({ name: params.name, description: params.description || null })
    .eq("id", eboardChannelId);
  if (error) throw error;
}

export async function uploadEboardAvatar(eboardChannelId: string, fileUri: string, contentType: string): Promise<string> {
  const body = await readUploadBody(fileUri);
  const path = `${eboardChannelId}/avatar`;

  const { error: uploadError } = await supabase.storage
    .from("eboard-avatars")
    .upload(path, body, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("eboard-avatars").getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("eboard_channels")
    .update({ avatar_url: publicUrl })
    .eq("id", eboardChannelId);
  if (updateError) throw updateError;

  return publicUrl;
}

export async function createEboardChannel(params: {
  clubId: string;
  name: string;
  description: string | null;
  createdBy: string;
}) {
  const { data, error } = await supabase
    .from("eboard_channels")
    .insert({
      club_id: params.clubId,
      name: params.name,
      description: params.description,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// RLS: "eboard members can delete their channel" (0040_club_eboard_delete.sql)
// — only existing members, mirroring every other Eboard management action
// (add/decide rights already belong to existing members, not every club
// admin). Cascades clean up membership/requests/meetings/polls/channel
// automatically via existing FKs.
export async function deleteEboardChannel(eboardChannelId: string) {
  const { error } = await supabase.from("eboard_channels").delete().eq("id", eboardChannelId);
  if (error) throw error;
}

export async function requestJoinEboardChannel(eboardChannelId: string): Promise<"joined" | "requested"> {
  const { data, error } = await supabase.rpc("request_join_eboard_channel", {
    target_eboard_channel_id: eboardChannelId,
  });
  if (error) throw error;
  return data as "joined" | "requested";
}

export interface EboardMemberRow {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  joinedAt: string;
}

export async function fetchEboardMembers(eboardChannelId: string): Promise<EboardMemberRow[]> {
  const { data: members, error } = await supabase
    .from("eboard_channel_members")
    .select("user_id, joined_at")
    .eq("eboard_channel_id", eboardChannelId)
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

export interface EboardJoinRequestRow {
  id: string;
  userId: string;
  fullName: string;
  createdAt: string;
}

export async function fetchPendingEboardRequests(eboardChannelId: string): Promise<EboardJoinRequestRow[]> {
  const { data: requests, error } = await supabase
    .from("eboard_channel_join_requests")
    .select("id, user_id, created_at")
    .eq("eboard_channel_id", eboardChannelId)
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

export async function decideEboardJoinRequest(requestId: string, approve: boolean) {
  const { error } = await supabase.rpc("decide_eboard_join_request", { request_id: requestId, approve });
  if (error) throw error;
}

export async function addEboardMember(eboardChannelId: string, userId: string) {
  const { error } = await supabase
    .from("eboard_channel_members")
    .insert({ eboard_channel_id: eboardChannelId, user_id: userId });
  if (error) throw error;
}

// Self-removal is blocked at the RLS layer (0039_eboard_members_delete.sql),
// not just hidden in the UI — see eboard/roster.tsx's isSelf guard.
export async function removeEboardMember(eboardChannelId: string, userId: string) {
  const { error } = await supabase
    .from("eboard_channel_members")
    .delete()
    .eq("eboard_channel_id", eboardChannelId)
    .eq("user_id", userId);
  if (error) throw error;
}

export interface EboardMeeting {
  id: string;
  eboardChannelId: string;
  title: string;
  description: string | null;
  meetingLink: string | null;
  meetingAt: string;
  createdBy: string;
  createdByName: string;
}

async function attachCreatorNames(
  meetings: {
    id: string;
    eboard_channel_id: string;
    title: string;
    description: string | null;
    meeting_link: string | null;
    meeting_at: string;
    created_by: string;
  }[]
): Promise<EboardMeeting[]> {
  if (meetings.length === 0) return [];

  const creatorIds = [...new Set(meetings.map((m) => m.created_by))];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", creatorIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return meetings.map((m) => ({
    id: m.id,
    eboardChannelId: m.eboard_channel_id,
    title: m.title,
    description: m.description,
    meetingLink: m.meeting_link,
    meetingAt: m.meeting_at,
    createdBy: m.created_by,
    createdByName: nameById.get(m.created_by) ?? "Unknown",
  }));
}

export async function fetchMeetings(eboardChannelId: string): Promise<EboardMeeting[]> {
  const { data, error } = await supabase
    .from("eboard_meetings")
    .select("id, eboard_channel_id, title, description, meeting_link, meeting_at, created_by")
    .eq("eboard_channel_id", eboardChannelId)
    .order("meeting_at", { ascending: true });

  if (error) throw error;
  return attachCreatorNames(data ?? []);
}

export async function fetchMeeting(meetingId: string): Promise<EboardMeeting | null> {
  const { data, error } = await supabase
    .from("eboard_meetings")
    .select("id, eboard_channel_id, title, description, meeting_link, meeting_at, created_by")
    .eq("id", meetingId)
    .single();

  if (error) throw error;
  if (!data) return null;
  const [meeting] = await attachCreatorNames([data]);
  return meeting;
}

export async function createMeeting(params: {
  eboardChannelId: string;
  title: string;
  description: string;
  meetingLink: string;
  meetingAt: string;
  createdBy: string;
}) {
  const { data, error } = await supabase
    .from("eboard_meetings")
    .insert({
      eboard_channel_id: params.eboardChannelId,
      title: params.title,
      description: params.description || null,
      meeting_link: params.meetingLink || null,
      meeting_at: params.meetingAt,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMeeting(
  meetingId: string,
  params: { title: string; description: string; meetingLink: string; meetingAt: string }
) {
  const { error } = await supabase
    .from("eboard_meetings")
    .update({
      title: params.title,
      description: params.description || null,
      meeting_link: params.meetingLink || null,
      meeting_at: params.meetingAt,
    })
    .eq("id", meetingId);

  if (error) throw error;
}

export async function deleteMeeting(meetingId: string) {
  const { error } = await supabase.from("eboard_meetings").delete().eq("id", meetingId);
  if (error) throw error;
}

export interface SearchedClubAdmin {
  id: string;
  fullName: string;
}

// The pool an existing eboard member can add directly: this club's own
// admins and Owner (membership must always be a subset of admin-tier club
// members), matching by name, minus whoever's already in.
export async function searchClubAdminsToAdd(
  clubId: string,
  query: string,
  excludeIds: string[]
): Promise<SearchedClubAdmin[]> {
  const { data: adminRows, error } = await supabase
    .from("club_members")
    .select("user_id")
    .eq("club_id", clubId)
    .in("role", ["admin", "owner"]);
  if (error) throw error;

  const adminIds = (adminRows ?? []).map((m) => m.user_id);
  if (adminIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", adminIds)
    .ilike("full_name", `%${query}%`)
    .limit(10);

  if (profilesError) throw profilesError;

  const exclude = new Set(excludeIds);
  return (profiles ?? []).filter((p) => !exclude.has(p.id)).map((p) => ({ id: p.id, fullName: p.full_name }));
}
