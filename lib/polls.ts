import { supabase } from "./supabase";

export interface PollListItem {
  id: string;
  question: string;
  isClosed: boolean;
  optionCount: number;
  createdAt: string;
}

export async function fetchPolls(clubId: string): Promise<PollListItem[]> {
  const { data: polls, error } = await supabase
    .from("polls")
    .select("id, question, is_closed, created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!polls || polls.length === 0) return [];

  const { data: options } = await supabase
    .from("poll_options")
    .select("poll_id")
    .in(
      "poll_id",
      polls.map((p) => p.id)
    );

  const countByPollId = new Map<string, number>();
  for (const o of options ?? []) {
    countByPollId.set(o.poll_id, (countByPollId.get(o.poll_id) ?? 0) + 1);
  }

  return polls.map((p) => ({
    id: p.id,
    question: p.question,
    isClosed: p.is_closed,
    optionCount: countByPollId.get(p.id) ?? 0,
    createdAt: p.created_at,
  }));
}

export async function createPoll(params: {
  clubId: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  isPrivate: boolean;
  createdBy: string;
}): Promise<{ id: string }> {
  const { data: poll, error } = await supabase
    .from("polls")
    .insert({
      club_id: params.clubId,
      question: params.question,
      allow_multiple: params.allowMultiple,
      is_private: params.isPrivate,
      created_by: params.createdBy,
    })
    .select("id")
    .single();

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
        .select("id, club_id, question, allow_multiple, is_private, is_closed, created_by, created_at")
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
