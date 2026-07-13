import { supabase } from "./supabase";

// A poll is club-scoped by default, or scoped to one Race or one Eboard &
// Council channel instead — mirrors the channels.race_id/eboard_channel_id
// generalization (0016/0017) and, closer to home, how race_car_groups/
// eboard_meetings are scoped. club_id is always carried (even on a race/
// eboard poll, denormalized) since every fetch/create call already has it
// in context and every notification needs it regardless of scope.
export type PollScope =
  | { type: "club"; clubId: string }
  | { type: "race"; clubId: string; raceId: string }
  | { type: "eboard"; clubId: string; eboardChannelId: string };

export interface PollListItem {
  id: string;
  question: string;
  isClosed: boolean;
  closesAt: string | null;
  optionCount: number;
  voteCount: number;
  hasVoted: boolean;
  createdAt: string;
}

// True once voting is actually blocked server-side (is_poll_closed /
// cast_vote, 0038_polls_scope_and_deadline.sql) — a manual close, or a
// closes_at deadline that has passed. Kept as one shared helper so the
// list and detail screens can't drift on what "closed" means.
export function isPollEffectivelyClosed(poll: { isClosed: boolean; closesAt: string | null }): boolean {
  return poll.isClosed || (poll.closesAt !== null && new Date(poll.closesAt).getTime() <= Date.now());
}

export async function fetchPolls(scope: PollScope, currentUserId: string): Promise<PollListItem[]> {
  let query = supabase
    .from("polls")
    .select("id, question, is_closed, closes_at, created_at")
    .order("created_at", { ascending: false });

  if (scope.type === "club") {
    // Excludes race/Eboard polls that happen to share this club_id — a
    // club's Polls list is siloed to its own club-wide polls, same as
    // club chat never shows race/Eboard messages.
    query = query.eq("club_id", scope.clubId).is("race_id", null).is("eboard_channel_id", null);
  } else if (scope.type === "race") {
    query = query.eq("race_id", scope.raceId);
  } else {
    query = query.eq("eboard_channel_id", scope.eboardChannelId);
  }

  const { data: polls, error } = await query;
  if (error) throw error;
  if (!polls || polls.length === 0) return [];

  const pollIds = polls.map((p) => p.id);

  const [{ data: options }, { data: myVotes }] = await Promise.all([
    supabase.from("poll_options").select("poll_id, vote_count").in("poll_id", pollIds),
    supabase.from("poll_votes").select("poll_id").eq("user_id", currentUserId).in("poll_id", pollIds),
  ]);

  const optionCountByPollId = new Map<string, number>();
  const voteCountByPollId = new Map<string, number>();
  for (const o of options ?? []) {
    optionCountByPollId.set(o.poll_id, (optionCountByPollId.get(o.poll_id) ?? 0) + 1);
    voteCountByPollId.set(o.poll_id, (voteCountByPollId.get(o.poll_id) ?? 0) + o.vote_count);
  }
  const votedPollIds = new Set((myVotes ?? []).map((v) => v.poll_id));

  return polls.map((p) => ({
    id: p.id,
    question: p.question,
    isClosed: p.is_closed,
    closesAt: p.closes_at,
    optionCount: optionCountByPollId.get(p.id) ?? 0,
    voteCount: voteCountByPollId.get(p.id) ?? 0,
    hasVoted: votedPollIds.has(p.id),
    createdAt: p.created_at,
  }));
}

export async function createPoll(params: {
  scope: PollScope;
  question: string;
  options: string[];
  allowMultiple: boolean;
  isPrivate: boolean;
  closesAt: string | null;
  createdBy: string;
}): Promise<{ id: string }> {
  const insertRow: {
    club_id: string;
    race_id?: string;
    eboard_channel_id?: string;
    question: string;
    allow_multiple: boolean;
    is_private: boolean;
    closes_at: string | null;
    created_by: string;
  } = {
    club_id: params.scope.clubId,
    question: params.question,
    allow_multiple: params.allowMultiple,
    is_private: params.isPrivate,
    closes_at: params.closesAt,
    created_by: params.createdBy,
  };
  if (params.scope.type === "race") insertRow.race_id = params.scope.raceId;
  if (params.scope.type === "eboard") insertRow.eboard_channel_id = params.scope.eboardChannelId;

  const { data: poll, error } = await supabase.from("polls").insert(insertRow).select("id").single();

  if (error) throw error;

  const { error: optionsError } = await supabase.from("poll_options").insert(
    params.options.map((text, position) => ({
      poll_id: poll.id,
      text,
      position,
    }))
  );

  if (optionsError) throw optionsError;

  return { id: poll.id };
}

export interface PollOptionDetail {
  id: string;
  text: string;
  position: number;
  voteCount: number;
  votedByMe: boolean;
}

export interface PollDetail {
  id: string;
  clubId: string;
  question: string;
  allowMultiple: boolean;
  isPrivate: boolean;
  isClosed: boolean;
  closesAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  options: PollOptionDetail[];
}

export async function fetchPoll(pollId: string, currentUserId: string): Promise<PollDetail> {
  const [{ data: poll, error: pollError }, { data: options, error: optionsError }, { data: myVotes }] =
    await Promise.all([
      supabase
        .from("polls")
        .select("id, club_id, question, allow_multiple, is_private, is_closed, closes_at, created_by, created_at")
        .eq("id", pollId)
        .single(),
      supabase.from("poll_options").select("id, text, position, vote_count").eq("poll_id", pollId).order("position"),
      supabase.from("poll_votes").select("option_id").eq("poll_id", pollId).eq("user_id", currentUserId),
    ]);

  if (pollError) throw pollError;
  if (optionsError) throw optionsError;

  const { data: creatorProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", poll.created_by)
    .single();

  const myVotedOptionIds = new Set((myVotes ?? []).map((v) => v.option_id));

  return {
    id: poll.id,
    clubId: poll.club_id,
    question: poll.question,
    allowMultiple: poll.allow_multiple,
    isPrivate: poll.is_private,
    isClosed: poll.is_closed,
    closesAt: poll.closes_at,
    createdBy: poll.created_by,
    createdByName: creatorProfile?.full_name ?? "Unknown",
    createdAt: poll.created_at,
    options: (options ?? []).map((o) => ({
      id: o.id,
      text: o.text,
      position: o.position,
      voteCount: o.vote_count,
      votedByMe: myVotedOptionIds.has(o.id),
    })),
  };
}

// Only meaningful to call when the caller is allowed to see voter
// identities (poll isn't private, or the caller is its creator) — RLS
// on poll_votes is the real backstop either way, this just avoids an
// unnecessary request otherwise.
export async function fetchPollVoters(pollId: string): Promise<Record<string, { userId: string; fullName: string }[]>> {
  const { data: votes, error } = await supabase.from("poll_votes").select("option_id, user_id").eq("poll_id", pollId);
  if (error) throw error;
  if (!votes || votes.length === 0) return {};

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in(
      "id",
      votes.map((v) => v.user_id)
    );

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const byOption: Record<string, { userId: string; fullName: string }[]> = {};
  for (const v of votes) {
    if (!byOption[v.option_id]) byOption[v.option_id] = [];
    byOption[v.option_id].push({ userId: v.user_id, fullName: nameById.get(v.user_id) ?? "Unknown" });
  }
  return byOption;
}

export async function castVote(optionId: string) {
  const { error } = await supabase.rpc("cast_vote", { p_option_id: optionId });
  if (error) throw error;
}

export async function setPollClosed(pollId: string, isClosed: boolean) {
  const { error } = await supabase.from("polls").update({ is_closed: isClosed }).eq("id", pollId);
  if (error) throw error;
}

export async function deletePoll(pollId: string) {
  const { error } = await supabase.from("polls").delete().eq("id", pollId);
  if (error) throw error;
}
