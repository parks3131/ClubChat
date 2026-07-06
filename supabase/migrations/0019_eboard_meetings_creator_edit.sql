-- Follow-up to 0018: only the meeting's creator can edit it (any eboard
-- member can still delete one, e.g. to cancel/remove a bad entry — that
-- wasn't asked to change). Replaces the update policy rather than
-- altering it in place, since Postgres has no `alter policy ... using`
-- shorthand that preserves the rest.
drop policy "eboard members can update meetings" on public.eboard_meetings;

create policy "only the creator can update a meeting"
  on public.eboard_meetings for update
  to authenticated
  using (public.is_eboard_member(eboard_channel_id) and created_by = auth.uid())
  with check (public.is_eboard_member(eboard_channel_id) and created_by = auth.uid());
