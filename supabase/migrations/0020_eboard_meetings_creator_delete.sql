-- Follow-up to 0019: delete is also creator-only now, not "any eboard
-- member" — a further founder tightening. Every other member's role on a
-- meeting is now purely read (view the detail screen), same as edit.
drop policy "eboard members can delete meetings" on public.eboard_meetings;

create policy "only the creator can delete a meeting"
  on public.eboard_meetings for delete
  to authenticated
  using (public.is_eboard_member(eboard_channel_id) and created_by = auth.uid());
